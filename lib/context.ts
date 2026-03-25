import { Pinecone } from "@pinecone-database/pinecone";
import { generateEmbedding } from "./embedding";

export interface MatchMetadata {
  text: string;
  pageNumber: number;
}

/** Rough token estimate for English-ish text (no tokenizer dependency). */
export function estimateTokens(text: string): number {
  const t = text.trim();
  if (!t.length) return 0;
  return Math.ceil(t.length / 4);
}

function normalizeChunkText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Pinecone returns matches in similarity order; we re-sort defensively.
 * Drops chunks whose normalized text is fully contained in a higher-scored kept chunk.
 */
export function dedupeRankedMatches(
  matches: Array<{ id: string; score: number; metadata: MatchMetadata }>,
  scoreThreshold: number
): Array<{ id: string; score: number; metadata: MatchMetadata }> {
  const ranked = matches
    .filter((m) => m.score >= scoreThreshold && m.metadata.text.trim().length > 0)
    .sort((a, b) => b.score - a.score);

  const kept: typeof ranked = [];
  for (const m of ranked) {
    const norm = normalizeChunkText(m.metadata.text);
    if (!norm.length) continue;

    const redundant = kept.some((o) => {
      const on = normalizeChunkText(o.metadata.text);
      return on.includes(norm) && on.length >= norm.length;
    });
    if (!redundant) kept.push(m);
  }
  return kept;
}

/**
 * Concatenate chunks in order (already relevance-ranked) until the token budget is reached.
 */
export function packIntoTokenBudget(
  chunks: Array<{ text: string }>,
  maxTokens: number,
  separator = "\n\n"
): string {
  const parts: string[] = [];
  let usedTokens = 0;

  for (const c of chunks) {
    const t = c.text.trim();
    if (!t.length) continue;

    const sep = parts.length === 0 ? "" : separator;
    const candidate = sep + t;
    const candTokens = estimateTokens(candidate);

    if (usedTokens + candTokens <= maxTokens) {
      parts.push(t);
      usedTokens += candTokens;
      continue;
    }

    const remaining = maxTokens - usedTokens - estimateTokens(sep);
    if (remaining > 32) {
      const maxChars = Math.max(0, remaining * 4 - 12);
      const truncated = t.slice(0, maxChars).trimEnd();
      if (truncated.length > 0) parts.push(truncated);
    }
    break;
  }

  return parts.join(separator);
}

export async function getMatchesFromEmbeddings(
  embeddings: number[],
  fileKey: string,
  topK: number = 20
): Promise<Array<{ id: string; score: number; metadata: MatchMetadata }>> {
  try {
    const client = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
    const pineconeIndex = await client.index("chatpdf");
    const namespace = pineconeIndex.namespace(fileKey);
    const queryResult = await namespace.query({
      topK,
      vector: embeddings,
      includeMetadata: true,
    });
    return (queryResult.matches ?? [])
      .filter((match) => typeof match.score === "number")
      .map((match) => ({
        id: match.id,
        score: match.score as number,
        metadata:
          match.metadata &&
          typeof match.metadata.text === "string" &&
          typeof match.metadata.pageNumber === "number"
            ? (match.metadata as unknown as MatchMetadata)
            : { text: "", pageNumber: 0 },
      }));
  } catch (error) {
    console.error("Error querying embeddings:", error);
    throw error;
  }
}

function readEnvNumber(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function getContext(query: string, fileKey: string): Promise<string> {
  const topK = readEnvNumber("CONTEXT_TOP_K", 20);
  const scoreThreshold = readEnvNumber("CONTEXT_SCORE_THRESHOLD", 0.7);
  const maxTokens = readEnvNumber("CONTEXT_MAX_TOKENS", 750);

  const queryEmbeddings = await generateEmbedding(query);
  const matches = await getMatchesFromEmbeddings(queryEmbeddings, fileKey, topK);
  const uniqueRanked = dedupeRankedMatches(matches, scoreThreshold);
  return packIntoTokenBudget(uniqueRanked.map((m) => ({ text: m.metadata.text })), maxTokens);
}
