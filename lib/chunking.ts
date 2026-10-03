import natural from "natural";
import { quantile } from "d3-array";
import * as math from "mathjs";
import { generateEmbedding, generateEmbeddings } from "./embedding";

export interface ChunkWithMetadata {
  text: string;
  metadata: {
    startIndex: number;
    endIndex: number;
    /** Nearest heading above this chunk ("" if none). */
    section: string;
    /** True when the chunk begins at a heading, i.e. starts a new section. */
    startsSection: boolean;
  };
}

/** A line-aware piece of the document: either a heading line or one sentence of body text. */
export interface TextUnit {
  text: string;
  heading: boolean;
}

interface SentenceObject {
  sentence: string;
  heading: boolean;
  index: number;
  combined_sentence: string;
  embedding?: number[];
  distance_to_next?: number;
}

export interface ChunkingOptions {
  bufferSize?: number;
  mergeLengthThreshold?: number;
  cosineSimThreshold?: number;
  percentileThreshold?: number;
  maxSentencesPerBatch?: number;
  maxChunkLength?: number;
}

/** Bullets and numbered list items: "• ", "- ", "* ", "1. ", "2) ". */
const BULLET_RE = /^(?:[•●▪◦‣∙*\-–]|\d+[.)])\s+/;
/** Lines this short with no closing punctuation are treated as headings (section titles, project names). */
const HEADING_MAX_LEN = 60;
/** Don't start a new chunk at a heading until the current one has at least this much text. */
const MIN_CHUNK_BEFORE_HEADING_BREAK = 100;
const MAX_SECTION_LABEL = 100;

/** Stand-in for dots inside tokens ("Node.js", "B.Tech", "7.51") so the tokenizer doesn't split there. */
const INNER_DOT = "․";
const protectInnerDots = (s: string) => s.replace(/(\w)\.(?=\w)/g, `$1${INNER_DOT}`);
const restoreInnerDots = (s: string) => s.split(INNER_DOT).join(".");

function isHeadingLine(line: string): boolean {
  return (
    line.length <= HEADING_MAX_LEN &&
    !BULLET_RE.test(line) &&
    !/[.,;:!?]$/.test(line) &&
    !/^\d+$/.test(line) && // page numbers
    /[A-Za-z]/.test(line)
  );
}

export function splitToSentences(text: string): string[] {
  const cleaned = text.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const abbreviations = ["Mr.", "Mrs.", "Dr.", "Ms.", "Prof.", "Sr.", "Jr.", "St.", "vs.", "etc.", "e.g.", "i.e."].map(
    protectInnerDots
  );
  const tokenizer = new natural.SentenceTokenizer(abbreviations);
  return tokenizer
    .tokenize(protectInnerDots(cleaned))
    .map(restoreInnerDots)
    .filter((s) => s.length > 0);
}

/**
 * Split extracted PDF text into headings and sentences, keeping the line structure that
 * `splitToSentences` alone would flatten: each bullet starts a new block, wrapped lines are
 * joined back onto their block, and short unpunctuated lines become headings.
 */
export function splitToUnits(text: string): TextUnit[] {
  const blocks: TextUnit[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length) blocks.push({ text: current.join(" "), heading: false });
    current = [];
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) {
      flush();
    } else if (BULLET_RE.test(line)) {
      flush();
      current.push(line);
    } else if (isHeadingLine(line)) {
      flush();
      blocks.push({ text: line, heading: true });
    } else {
      current.push(line);
    }
  }
  flush();

  return blocks.flatMap((b) =>
    b.heading ? [b] : splitToSentences(b.text).map((s) => ({ text: s, heading: false }))
  );
}

export function structureSentences(units: TextUnit[], bufferSize: number = 2): SentenceObject[] {
  return units.map((unit, i) => {
    const start = Math.max(0, i - bufferSize);
    const end = Math.min(units.length, i + bufferSize + 1);
    return {
      sentence: unit.text,
      heading: unit.heading,
      index: i,
      combined_sentence: units
        .slice(start, end)
        .map((u) => u.text)
        .join(" "),
    };
  });
}

export async function attachEmbeddings(sentences: SentenceObject[], batchSize: number = 50): Promise<SentenceObject[]> {
  const result: SentenceObject[] = [];
  for (let i = 0; i < sentences.length; i += batchSize) {
    const batch = sentences.slice(i, i + batchSize);
    const texts = batch.map((s) => s.combined_sentence);
    try {
      const embeddings = await generateEmbeddings(texts);
      result.push(...batch.map((s, j) => ({ ...s, embedding: embeddings[j] })));
    } catch {
      result.push(...batch.map((s) => ({ ...s, embedding: undefined })));
    }
  }
  return result;
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  const dot = math.dot(vecA, vecB) as number;
  const normA = math.norm(vecA) as number;
  const normB = math.norm(vecB) as number;
  return normA === 0 || normB === 0 ? 0 : dot / (normA * normB);
}

/** Indices i where the topic shifts between sentence i and i + 1. */
export function detectShifts(sentences: SentenceObject[], percentile: number = 90): number[] {
  const pairs: Array<{ index: number; distance: number }> = [];
  for (let i = 0; i < sentences.length - 1; i++) {
    const a = sentences[i].embedding;
    const b = sentences[i + 1].embedding;
    if (a && b) {
      const distance = 1 - cosineSimilarity(a, b);
      pairs.push({ index: i, distance });
      sentences[i].distance_to_next = distance;
    }
  }
  if (pairs.length === 0) return [];
  const sorted = pairs.map((p) => p.distance).sort((x, y) => x - y);
  const threshold = quantile(sorted, percentile / 100) || 0;
  return pairs.filter((p) => p.distance > threshold).map((p) => p.index);
}

/**
 * Group sentences into chunks of at most `maxChunkLength` characters without dropping text.
 * A chunk breaks before a heading (new section), at a semantic shift, or before it would overflow;
 * a single sentence longer than the limit becomes its own chunk. Trailing headings are carried into
 * the next chunk so a title is never separated from its content, and chunks that continue a section
 * are prefixed with that section's heading so they still say what they belong to.
 */
export function groupIntoChunks(sentences: SentenceObject[], shifts: number[], maxChunkLength: number = 500): ChunkWithMetadata[] {
  const shiftAfter = new Set(shifts);
  const chunks: ChunkWithMetadata[] = [];
  let group: SentenceObject[] = [];
  let groupLength = 0;
  let groupSection = "";
  let headingRun: string[] = [];
  let section = "";

  const flush = (final = false) => {
    // Carry trailing headings over to the next chunk, unless this is the last one.
    const carry: SentenceObject[] = [];
    while (!final && group.length && group[group.length - 1].heading) carry.unshift(group.pop()!);

    if (group.length) {
      const body = group.map((s) => s.sentence).join(" ");
      const startsSection = group[0].heading;
      chunks.push({
        text: !startsSection && groupSection ? `${groupSection} (continued): ${body}` : body,
        metadata: {
          startIndex: group[0].index,
          endIndex: group[group.length - 1].index,
          section: groupSection,
          startsSection,
        },
      });
    }
    group = carry;
    groupLength = carry.reduce((n, s) => n + s.sentence.length + 1, 0);
  };

  for (const s of sentences) {
    if (group.length) {
      const last = group[group.length - 1];
      const newSection = s.heading && !last.heading && groupLength >= MIN_CHUNK_BEFORE_HEADING_BREAK;
      const topicShift = shiftAfter.has(s.index - 1) && !last.heading;
      const overflow = groupLength + s.sentence.length + 1 > maxChunkLength;
      if (newSection || topicShift || overflow) flush();
    }

    if (s.heading) {
      if (group.length === 0 || !group[group.length - 1].heading) headingRun = [];
      headingRun.push(s.sentence);
      section = headingRun.join(" › ").slice(0, MAX_SECTION_LABEL);
    }
    // A chunk's section is fixed by its leading headings, or by the section it starts inside of.
    if (group.every((g) => g.heading)) groupSection = section;

    group.push(s);
    groupLength += s.sentence.length + 1;
  }
  flush(true);
  return chunks;
}

/** Text of a chunk without its "(continued)" section prefix. */
function chunkBody(chunk: ChunkWithMetadata): string {
  const prefix = `${chunk.metadata.section} (continued): `;
  return chunk.metadata.section && chunk.text.startsWith(prefix) ? chunk.text.slice(prefix.length) : chunk.text;
}

export async function mergeChunks(chunks: ChunkWithMetadata[], options: ChunkingOptions): Promise<ChunkWithMetadata[]> {
  const { mergeLengthThreshold = 200, cosineSimThreshold = 0.9, maxChunkLength = 500 } = options;
  if (chunks.length === 0) return [];
  const merged: ChunkWithMetadata[] = [chunks[0]];

  for (let i = 1; i < chunks.length; i++) {
    const last = merged[merged.length - 1];
    const current = chunks[i];

    // Never merge across a section boundary.
    if (current.metadata.startsSection) {
      merged.push(current);
      continue;
    }

    const timeoutPromise = <T,>(promise: Promise<T>, ms: number) =>
      Promise.race<T>([
        promise,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Embedding timeout")), ms)),
      ]);

    try {
      const [lastEmb, currEmb] = await Promise.all([
        timeoutPromise(generateEmbedding(last.text), 5000),
        timeoutPromise(generateEmbedding(current.text), 5000),
      ]);
      const sim = cosineSimilarity(lastEmb, currEmb);
      const currentBody = chunkBody(current);
      const combinedLength = last.text.length + currentBody.length;

      if (combinedLength < mergeLengthThreshold && sim > cosineSimThreshold && combinedLength <= maxChunkLength) {
        merged[merged.length - 1] = {
          text: `${last.text} ${currentBody}`,
          metadata: { ...last.metadata, endIndex: current.metadata.endIndex },
        };
      } else {
        merged.push(current);
      }
    } catch {
      merged.push(current);
    }
  }
  return merged;
}

export async function processText(
  text: string,
  options: ChunkingOptions = {
    bufferSize: 2,
    mergeLengthThreshold: 200,
    cosineSimThreshold: 0.9,
    percentileThreshold: 90,
    maxSentencesPerBatch: 100,
    maxChunkLength: 500,
  }
): Promise<{ chunks: ChunkWithMetadata[]; embeddings: (number[] | undefined)[] }> {
  let units = splitToUnits(text);
  if (units.length === 0 && text.trim().length > 0) {
    units = [{ text: text.trim(), heading: false }];
  }
  if (units.length === 0) {
    throw new Error("No sentences found in the input text");
  }

  const batches: SentenceObject[][] = [];
  const batchSize = options.maxSentencesPerBatch || 100;

  for (let i = 0; i < units.length; i += batchSize) {
    batches.push(structureSentences(units.slice(i, i + batchSize), options.bufferSize ?? 2));
  }

  const allChunks: ChunkWithMetadata[] = [];
  const allEmbeddings: (number[] | undefined)[] = [];

  for (let i = 0; i < batches.length; i++) {
    const embedded = await attachEmbeddings(batches[i]);
    const shifts = detectShifts(embedded, options.percentileThreshold ?? 90);
    const chunks = groupIntoChunks(embedded, shifts, options.maxChunkLength ?? 500);
    const merged = await mergeChunks(chunks, options);

    allChunks.push(...merged);

    const emb = await generateEmbeddings(merged.map((c) => c.text));
    allEmbeddings.push(...emb);
  }

  return { chunks: allChunks, embeddings: allEmbeddings };
}
