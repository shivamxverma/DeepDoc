/**
 * RAG evaluation harness for a single uploaded PDF.
 *
 *   npm run eval                                   # sweep + generate/judge best configs
 *   npm run eval -- --retrieval-only               # sweep only (no chat/judge calls)
 *   npm run eval -- --cases test/eval/other.json   # different PDF / case file
 *   npm run eval -- --config 0.3,20,750 --config 0.2,10,1500   # extra configs to generate with
 *   npm run eval -- --prompts v1,v2 --configs-only             # A/B prompts on current + --config only
 *
 * Retrieval is measured once per question (one embedding + one Pinecone query), then every
 * threshold/topK/maxTokens combination is replayed locally. Only the shortlisted configs go
 * through the real chat prompt and an LLM judge.
 */
import fs from "node:fs";
import path from "node:path";
import { Pinecone } from "@pinecone-database/pinecone";
import { generateEmbedding } from "../lib/embedding";
import {
  ContextOptions,
  MatchMetadata,
  estimateTokens,
  getContextOptions,
  getMatchesFromEmbeddings,
  selectContext,
} from "../lib/context";
import { callChatModel, rewriteQuestion } from "../lib/chat";
import { PromptMessage, REFUSAL_MESSAGE, buildChatMessages } from "../lib/prompt";
import { V1_REFUSAL, buildV1Messages } from "./prompt-v1";
import { azureClient } from "../lib/azure";
import { config } from "../lib/config";

type Expect = "answer" | "refuse" | "either";
type Match = { id: string; score: number; metadata: MatchMetadata };

interface EvalCase {
  id: string;
  category: string;
  question: string;
  reference: string;
  evidence: string[];
  expect: Expect;
  /** Earlier turns for multi-turn cases (oldest first, without the current question). */
  history?: PromptMessage[];
}

interface Judgement {
  correctness: number;
  faithfulness: number;
  completeness: number;
  relevance: number;
  rating: number;
  issue: string;
}

interface GenResult {
  caseId: string;
  category: string;
  question: string;
  /** Query actually sent to retrieval (differs from `question` when a follow-up was rewritten). */
  searchQuery: string;
  response: string;
  refused: boolean;
  behaviorOk: boolean;
  evidenceInIndex: number;
  evidenceInContext: number;
  evidenceTotal: number;
  contextTokens: number;
  usedFallback: boolean;
  latencyMs: number;
  judge: Judgement;
  diagnosis: "ok" | "indexing" | "retrieval" | "generation";
}

// ---------- args ----------

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(name);
const opt = (name: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const opts = (name: string) => argv.flatMap((a, i) => (a === name && argv[i + 1] ? [argv[i + 1]] : []));

const CASES_PATH = opt("--cases") ?? "test/eval/cases.json";
const RETRIEVAL_ONLY = flag("--retrieval-only");
const CONCURRENCY = Number(opt("--concurrency") ?? 4);
const TOP_N_GEN = Number(opt("--top") ?? 2);
const CONFIGS_ONLY = flag("--configs-only");

type BuildMessages = (context: string, question: string, history?: PromptMessage[]) => PromptMessage[];

const PROMPTS: Record<string, BuildMessages> = {
  v1: buildV1Messages,
  v2: buildChatMessages,
};
const PROMPT_NAMES = (opt("--prompts") ?? "v2").split(",").map((p) => p.trim());
for (const p of PROMPT_NAMES) if (!PROMPTS[p]) throw new Error(`Unknown prompt "${p}" (have: ${Object.keys(PROMPTS).join(", ")})`);

const GRID = {
  scoreThreshold: [0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.7],
  topK: [3, 5, 8, 10, 20],
  maxTokens: [500, 750, 1000, 1500, 3000],
};

// ---------- helpers ----------

/** Case-insensitive, whitespace-insensitive (chunk text has artefacts like "Node. js"). */
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
const contains = (hay: string, needle: string) => norm(hay).includes(norm(needle));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const f1 = (x: number) => x.toFixed(1);
const f2 = (x: number) => x.toFixed(2);
const quantile = (xs: number[], q: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};
const cfgLabel = (c: ContextOptions) => `thr=${c.scoreThreshold} topK=${c.topK} maxTok=${c.maxTokens}`;

async function pool<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    })
  );
  return out;
}

/** Either prompt's fixed refusal sentence. */
const isRefusal = (text: string) => contains(text, REFUSAL_MESSAGE) || contains(text, V1_REFUSAL);

function behaviorOk(expect: Expect, refused: boolean): boolean {
  if (expect === "refuse") return refused;
  if (expect === "answer") return !refused;
  return true;
}

// ---------- index snapshot ----------

async function fetchAllChunks(fileKey: string): Promise<string[]> {
  const ns = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! }).index("chatpdf").namespace(fileKey);
  const stats = await new Pinecone({ apiKey: process.env.PINECONE_API_KEY! }).index("chatpdf").describeIndexStats();
  const count = stats.namespaces?.[fileKey]?.recordCount ?? 0;
  if (!count) throw new Error(`Namespace "${fileKey}" has no vectors — was this PDF indexed?`);
  const dim = stats.dimension ?? 1536;
  const res = await ns.query({ topK: Math.min(count, 10000), vector: new Array(dim).fill(0.01), includeMetadata: true });
  return (res.matches ?? []).map((m) => String(m.metadata?.text ?? ""));
}

// ---------- retrieval sweep ----------

interface SweepRow {
  cfg: ContextOptions;
  recall: number; // evidence found in context / evidence that exists in the index
  hitRate: number; // cases where all indexed evidence is in context
  precision: number; // selected chunks that contain any evidence
  avgTokens: number;
  fallbackRate: number;
}

function evaluateRetrieval(cases: EvalCase[], matchesById: Map<string, Match[]>, indexText: string, cfg: ContextOptions): SweepRow {
  const scored = cases.filter((c) => c.expect === "answer" && c.evidence.length);
  const recalls: number[] = [];
  const hits: number[] = [];
  const precisions: number[] = [];
  const tokens: number[] = [];
  const fallbacks: number[] = [];

  for (const c of scored) {
    const sel = selectContext(matchesById.get(c.id)!, cfg);
    const indexed = c.evidence.filter((e) => contains(indexText, e));
    const found = indexed.filter((e) => contains(sel.text, e));
    if (indexed.length) {
      recalls.push(found.length / indexed.length);
      hits.push(found.length === indexed.length ? 1 : 0);
    }
    if (sel.chunks.length) {
      precisions.push(sel.chunks.filter((m) => c.evidence.some((e) => contains(m.metadata.text, e))).length / sel.chunks.length);
    }
    tokens.push(estimateTokens(sel.text));
    fallbacks.push(sel.usedFallback ? 1 : 0);
  }

  return {
    cfg,
    recall: mean(recalls),
    hitRate: mean(hits),
    precision: mean(precisions),
    avgTokens: mean(tokens),
    fallbackRate: mean(fallbacks),
  };
}

// ---------- judge ----------

async function judge(c: EvalCase, context: string, response: string): Promise<Judgement> {
  const transcript = (c.history ?? []).map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n");
  const prompt = `You are grading a document-QA assistant. The assistant may ONLY use the CONTEXT it was given${transcript ? " and the EARLIER CONVERSATION" : ""}.
${transcript ? `\nEARLIER CONVERSATION:\n"""\n${transcript}\n"""\n` : ""}
QUESTION: ${c.question}
EXPECTED BEHAVIOUR: ${c.expect === "refuse" ? "refuse (the answer is not in the document / request is off-task)" : c.expect === "either" ? "either refuse or clearly say it is not mentioned; asserting it is true is wrong" : "answer from the document"}
REFERENCE ANSWER (ground truth from the full document): ${c.reference}

CONTEXT GIVEN TO THE ASSISTANT:
"""
${context || "(empty)"}
"""

ASSISTANT RESPONSE:
"""
${response}
"""

Score each 1-5:
- correctness: matches the reference answer's facts (a refusal on an answerable question = 1; a correct refusal on a refuse question = 5)
- faithfulness: every claim is supported by the CONTEXT${transcript ? " or the EARLIER CONVERSATION" : ""} (nothing invented; a refusal = 5)
- completeness: covers all parts of the reference answer
- relevance: directly answers the question, well-formatted, no padding
Then give an overall rating 1-10 and the single most important issue (or "none").

Reply with JSON only: {"correctness":n,"faithfulness":n,"completeness":n,"relevance":n,"rating":n,"issue":"..."}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await azureClient.chat.completions.create({
        model: config.AZURE_OPENAI_CHAT_DEPLOYMENT_NAME,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });
      const j = JSON.parse(res.choices[0]?.message?.content ?? "{}");
      const n = (v: unknown, max: number) => Math.max(1, Math.min(max, Number(v) || 1));
      return {
        correctness: n(j.correctness, 5),
        faithfulness: n(j.faithfulness, 5),
        completeness: n(j.completeness, 5),
        relevance: n(j.relevance, 5),
        rating: n(j.rating, 10),
        issue: String(j.issue ?? ""),
      };
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  throw new Error("unreachable");
}

// ---------- generation ----------

async function runGeneration(
  cases: EvalCase[],
  matchesById: Map<string, Match[]>,
  indexText: string,
  cfg: ContextOptions,
  buildMessages: BuildMessages,
  searchQueries: Map<string, string>
): Promise<GenResult[]> {
  return pool(cases, CONCURRENCY, async (c) => {
    const sel = selectContext(matchesById.get(c.id)!, cfg);
    const t0 = Date.now();
    const response = await callChatModel(buildMessages(sel.text, c.question, c.history ?? []));
    const latencyMs = Date.now() - t0;
    const j = await judge(c, sel.text, response);
    const refused = isRefusal(response);
    const ok = behaviorOk(c.expect, refused);
    const inIndex = c.evidence.filter((e) => contains(indexText, e)).length;
    const inContext = c.evidence.filter((e) => contains(sel.text, e)).length;

    let diagnosis: GenResult["diagnosis"] = "ok";
    if (!ok || j.correctness <= 3 || j.completeness <= 2) {
      if (c.expect !== "answer") diagnosis = "generation";
      else if (inIndex < c.evidence.length) diagnosis = "indexing";
      else if (inContext < c.evidence.length) diagnosis = "retrieval";
      else diagnosis = "generation";
    }
    process.stdout.write(diagnosis === "ok" ? "." : diagnosis[0]);

    return {
      caseId: c.id,
      category: c.category,
      question: c.question,
      searchQuery: searchQueries.get(c.id) ?? c.question,
      response,
      refused,
      behaviorOk: ok,
      evidenceInIndex: inIndex,
      evidenceInContext: inContext,
      evidenceTotal: c.evidence.length,
      contextTokens: estimateTokens(sel.text),
      usedFallback: sel.usedFallback,
      latencyMs,
      judge: j,
      diagnosis,
    };
  });
}

function summarize(rs: GenResult[]) {
  const pass = rs.filter((r) => r.behaviorOk && r.judge.rating >= 7).length;
  return {
    rating: mean(rs.map((r) => r.judge.rating)),
    correctness: mean(rs.map((r) => r.judge.correctness)),
    faithfulness: mean(rs.map((r) => r.judge.faithfulness)),
    completeness: mean(rs.map((r) => r.judge.completeness)),
    relevance: mean(rs.map((r) => r.judge.relevance)),
    behavior: mean(rs.map((r) => (r.behaviorOk ? 1 : 0))),
    passRate: pass / rs.length,
    p50: quantile(rs.map((r) => r.latencyMs), 0.5),
    p95: quantile(rs.map((r) => r.latencyMs), 0.95),
    diagnoses: rs.reduce<Record<string, number>>((acc, r) => ((acc[r.diagnosis] = (acc[r.diagnosis] ?? 0) + 1), acc), {}),
  };
}

// ---------- main ----------

async function main() {
  const file = JSON.parse(fs.readFileSync(CASES_PATH, "utf8")) as { fileKey: string; cases: EvalCase[] };
  const { fileKey, cases } = file;
  console.log(`Evaluating ${cases.length} cases against "${fileKey}"`);

  const chunks = await fetchAllChunks(fileKey);
  const indexText = chunks.join("\n");
  console.log(`Index: ${chunks.length} chunks, ${estimateTokens(indexText)} tokens total`);

  const missingFromIndex = cases.flatMap((c) =>
    c.evidence.filter((e) => !contains(indexText, e)).map((e) => ({ id: c.id, evidence: e }))
  );

  // One embedding + one Pinecone query per question; everything else is replayed locally.
  const maxTopK = Math.max(...GRID.topK);
  const matchesById = new Map<string, Match[]>();
  const topScores = new Map<string, number[]>();
  // Follow-ups are rewritten once (same as the chat route) and the rewrite is reused for every config.
  const searchQueries = new Map<string, string>();
  await pool(cases, CONCURRENCY, async (c) => {
    const query = await rewriteQuestion(c.history ?? [], c.question);
    searchQueries.set(c.id, query);
    const emb = await generateEmbedding(query);
    const m = await getMatchesFromEmbeddings(emb, fileKey, maxTopK);
    matchesById.set(c.id, m);
    topScores.set(c.id, m.slice(0, 3).map((x) => x.score));
  });

  const sweep: SweepRow[] = [];
  for (const scoreThreshold of GRID.scoreThreshold)
    for (const topK of GRID.topK)
      for (const maxTokens of GRID.maxTokens)
        sweep.push(evaluateRetrieval(cases, matchesById, indexText, { scoreThreshold, topK, maxTokens, fallbackK: 5 }));

  // Best = highest recall, then fewest tokens (cheaper, less noise), then precision.
  const ranked = [...sweep].sort(
    (a, b) => b.recall - a.recall || a.avgTokens - b.avgTokens || b.precision - a.precision
  );

  const current = getContextOptions();
  const codeDefault: ContextOptions = { scoreThreshold: 0.3, topK: 20, maxTokens: 750, fallbackK: 5 };
  const extra = opts("--config").map((s) => {
    const [scoreThreshold, topK, maxTokens] = s.split(",").map(Number);
    return { scoreThreshold, topK, maxTokens, fallbackK: 5 };
  });
  // Shortlist: current env, code default, best recall, and the best config at a modest budget.
  const budgetBest = ranked.find((r) => r.cfg.maxTokens <= 1000)!;
  const candidates: Array<{ name: string; cfg: ContextOptions }> = [
    { name: "current (.env)", cfg: current },
    ...(CONFIGS_ONLY
      ? []
      : [
          { name: "code default", cfg: codeDefault },
          ...ranked.slice(0, TOP_N_GEN).map((r, i) => ({ name: `sweep #${i + 1}`, cfg: r.cfg })),
          { name: "best ≤1000 tok", cfg: budgetBest.cfg },
        ]),
    ...extra.map((cfg, i) => ({ name: `custom #${i + 1}`, cfg })),
  ];
  const seen = new Set<string>();
  const genConfigs = candidates.filter(({ cfg }) => {
    const k = cfgLabel(cfg);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const findRow = (cfg: ContextOptions) => evaluateRetrieval(cases, matchesById, indexText, cfg);

  const gen: Array<{ name: string; cfg: ContextOptions; results: GenResult[] }> = [];
  if (!RETRIEVAL_ONLY) {
    for (const promptName of PROMPT_NAMES) {
      for (const { name: cfgName, cfg } of genConfigs) {
        const name = PROMPT_NAMES.length > 1 ? `${promptName} · ${cfgName}` : cfgName;
        process.stdout.write(`Generating + judging [${name}] ${cfgLabel(cfg)} `);
        gen.push({ name, cfg, results: await runGeneration(cases, matchesById, indexText, cfg, PROMPTS[promptName], searchQueries) });
        process.stdout.write("\n");
      }
    }
  }

  // ---------- report ----------
  const L: string[] = [];
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  L.push(`# DeepDoc RAG eval — ${stamp}`, "");
  L.push(`- PDF: \`${fileKey}\``, `- Cases: ${cases.length}`, `- Index: ${chunks.length} chunks, ~${estimateTokens(indexText)} tokens`, "");

  L.push(`## 1. Indexing coverage`, "");
  if (missingFromIndex.length) {
    L.push(`${missingFromIndex.length} evidence strings are **not in the index at all** (lost during chunking/extraction). No retrieval config can fix these:`, "");
    for (const m of missingFromIndex) L.push(`- \`${m.id}\`: "${m.evidence}"`);
  } else L.push("All evidence strings exist in the index.");
  L.push("");

  L.push(`## 2. Retrieval sweep (${sweep.length} configs, answerable cases only)`, "");
  L.push("Recall = evidence in context ÷ evidence that exists in the index. Precision = selected chunks containing any evidence.", "");
  L.push("| Config | Recall | Hit rate | Precision | Avg ctx tokens | Fallback |", "|---|---|---|---|---|---|");
  const row = (label: string, r: SweepRow) =>
    `| ${label} | ${pct(r.recall)} | ${pct(r.hitRate)} | ${pct(r.precision)} | ${r.avgTokens.toFixed(0)} | ${pct(r.fallbackRate)} |`;
  L.push(row(`**current (.env)** ${cfgLabel(current)}`, findRow(current)));
  L.push(row(`**code default** ${cfgLabel(codeDefault)}`, findRow(codeDefault)));
  for (const r of ranked.slice(0, 10)) L.push(row(cfgLabel(r.cfg), r));
  L.push("");

  L.push(`### Effect of each knob (averaged over the other two)`, "");
  for (const knob of ["scoreThreshold", "topK", "maxTokens"] as const) {
    L.push(`| ${knob} | Recall | Precision | Avg tokens |`, "|---|---|---|---|");
    for (const v of GRID[knob]) {
      const rs = sweep.filter((r) => r.cfg[knob] === v);
      L.push(`| ${v} | ${pct(mean(rs.map((r) => r.recall)))} | ${pct(mean(rs.map((r) => r.precision)))} | ${mean(rs.map((r) => r.avgTokens)).toFixed(0)} |`);
    }
    L.push("");
  }

  const rewritten = cases.filter((c) => c.history?.length);
  if (rewritten.length) {
    L.push(`### Follow-up rewrites (multi-turn cases)`, "");
    L.push("| Case | Question | Search query after rewrite |", "|---|---|---|");
    for (const c of rewritten) L.push(`| ${c.id} | ${c.question} | ${searchQueries.get(c.id)} |`);
    L.push("");
  }

  L.push(`### Similarity scores per question (top 3)`, "");
  L.push("| Case | Category | Top-3 scores |", "|---|---|---|");
  for (const c of cases) L.push(`| ${c.id} | ${c.category} | ${(topScores.get(c.id) ?? []).map(f2).join(", ")} |`);
  L.push("");

  if (gen.length) {
    L.push(`## 3. End-to-end results (real prompt + LLM judge)`, "");
    L.push("Pass = correct behaviour (answer/refuse) **and** rating ≥ 7.", "");
    L.push("| Config | Rating /10 | Pass | Correct | Faithful | Complete | Relevant | Answer/refuse OK | p50 / p95 latency | Failures by cause |", "|---|---|---|---|---|---|---|---|---|---|");
    for (const g of gen) {
      const s = summarize(g.results);
      const d = Object.entries(s.diagnoses).filter(([k]) => k !== "ok").map(([k, v]) => `${k} ${v}`).join(", ") || "—";
      L.push(`| **${g.name}** ${cfgLabel(g.cfg)} | ${f1(s.rating)} | ${pct(s.passRate)} | ${f1(s.correctness)} | ${f1(s.faithfulness)} | ${f1(s.completeness)} | ${f1(s.relevance)} | ${pct(s.behavior)} | ${(s.p50 / 1000).toFixed(1)}s / ${(s.p95 / 1000).toFixed(1)}s | ${d} |`);
    }
    L.push("");

    const categories = [...new Set(cases.map((c) => c.category))];
    L.push(`### Rating by category`, "");
    L.push(`| Category | ${gen.map((g) => g.name).join(" | ")} |`, `|---|${gen.map(() => "---").join("|")}|`);
    for (const cat of categories)
      L.push(`| ${cat} | ${gen.map((g) => f1(mean(g.results.filter((r) => r.category === cat).map((r) => r.judge.rating)))).join(" | ")} |`);
    L.push("");

    const best = [...gen].sort((a, b) => summarize(b.results).rating - summarize(a.results).rating)[0];
    L.push(`### Per-case detail — best config: ${best.name} (${cfgLabel(best.cfg)})`, "");
    L.push("| Case | Rating | C/F/Cp/R | Evidence idx→ctx | Ctx tok | Cause | Issue |", "|---|---|---|---|---|---|---|");
    for (const r of best.results) {
      const j = r.judge;
      L.push(`| ${r.caseId} | ${j.rating} | ${j.correctness}/${j.faithfulness}/${j.completeness}/${j.relevance} | ${r.evidenceTotal ? `${r.evidenceInIndex}/${r.evidenceTotal}→${r.evidenceInContext}` : "—"} | ${r.contextTokens}${r.usedFallback ? " (fb)" : ""} | ${r.diagnosis} | ${j.issue.replace(/\|/g, "/").replace(/\n/g, " ")} |`);
    }
    L.push("");

    L.push(`### Responses — best config`, "");
    for (const r of best.results) {
      L.push(`<details><summary><b>${r.caseId}</b> — ${r.judge.rating}/10 — ${r.question}</summary>`, "", r.response.trim(), "", "</details>", "");
    }
  }

  const outDir = path.join("test/eval/results");
  fs.mkdirSync(outDir, { recursive: true });
  const base = path.join(outDir, stamp);
  fs.writeFileSync(`${base}.md`, L.join("\n"));
  fs.writeFileSync(`${base}.json`, JSON.stringify({ fileKey, sweep, genConfigs, gen, missingFromIndex }, null, 2));
  console.log(`\nReport: ${base}.md\nRaw:    ${base}.json`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
