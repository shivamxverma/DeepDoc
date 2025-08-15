import natural from "natural";
import { quantile } from "d3-array";
import * as math from "mathjs";
import { generateEmbedding, generateEmbeddings } from "./embedding";

export interface ChunkWithMetadata {
  text: string;
  metadata: { startIndex: number; endIndex: number };
}

interface SentenceObject {
  sentence: string;
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

export function splitToSentences(text: string): string[] {
  const cleaned = text.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const abbreviations = ["Mr.", "Mrs.", "Dr.", "Ms.", "Prof.", "Sr.", "Jr.", "St.", "vs.", "etc.", "e.g.", "i.e."];
  const tokenizer = new natural.SentenceTokenizer(abbreviations);
  return tokenizer.tokenize(cleaned).filter((s) => s.length > 0);
}

export function structureSentences(sentences: string[], bufferSize: number = 2): SentenceObject[] {
  return sentences.map((sentence, i) => {
    const start = Math.max(0, i - bufferSize);
    const end = Math.min(sentences.length, i + bufferSize + 1);
    return {
      sentence,
      index: i,
      combined_sentence: sentences.slice(start, end).join(" "),
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
      if (embeddings.length !== batch.length) {
        throw new Error(`Embedding length mismatch: expected ${batch.length}, got ${embeddings.length}`);
      }
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

export function detectShifts(sentences: SentenceObject[], percentile: number = 90): number[] {
  const distances: number[] = [];
  for (let i = 0; i < sentences.length - 1; i++) {
    if (sentences[i].embedding && sentences[i + 1].embedding) {
      const sim = cosineSimilarity(sentences[i].embedding, sentences[i + 1].embedding);
      const d = 1 - sim;
      distances.push(d);
      sentences[i].distance_to_next = d;
    }
  }
  if (distances.length === 0) return [];
  const threshold = quantile(distances.slice().sort((a, b) => a - b), percentile / 100) || 0;
  return distances.map((d, i) => (d > threshold ? i : -1)).filter((i) => i !== -1);
}

export function groupIntoChunks(sentences: SentenceObject[], shifts: number[], maxChunkLength: number = 500): ChunkWithMetadata[] {
  const chunks: ChunkWithMetadata[] = [];
  let start = 0;
  let currentLength = 0;

  for (let i = 0; i <= sentences.length; i++) {
    const shouldBreak = i === sentences.length || shifts.includes(i - 1) || currentLength >= maxChunkLength;
    if (shouldBreak) {
      if (start < i) {
        const group = sentences.slice(start, i);
        const text = group.map((s) => s.sentence).join(" ");
        chunks.push({
          text: text.length > maxChunkLength ? text.slice(0, maxChunkLength) : text,
          metadata: { startIndex: start, endIndex: i - 1 },
        });
      }
      start = i;
      currentLength = 0;
    }
    if (i < sentences.length) {
      currentLength += sentences[i].sentence.length;
    }
  }
  return chunks;
}

export async function mergeChunks(chunks: ChunkWithMetadata[], options: ChunkingOptions): Promise<ChunkWithMetadata[]> {
  const { mergeLengthThreshold = 200, cosineSimThreshold = 0.9, maxChunkLength = 500 } = options;
  if (chunks.length === 0) return [];
  const merged: ChunkWithMetadata[] = [chunks[0]];

  for (let i = 1; i < chunks.length; i++) {
    const last = merged[merged.length - 1];
    const current = chunks[i];

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
      const combinedLength = last.text.length + current.text.length;

      if (combinedLength < mergeLengthThreshold && sim > cosineSimThreshold && combinedLength <= maxChunkLength) {
        merged[merged.length - 1] = {
          text: `${last.text} ${current.text}`,
          metadata: { startIndex: last.metadata.startIndex, endIndex: current.metadata.endIndex },
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
): Promise<{ chunks: ChunkWithMetadata[]; embeddings: number[][] }> {
  const sentences = splitToSentences(text);
  if (sentences.length === 0) {
    throw new Error("No sentences found in the input text");
  }

  const batches: SentenceObject[][] = [];
  const batchSize = options.maxSentencesPerBatch || 100;

  for (let i = 0; i < sentences.length; i += batchSize) {
    batches.push(structureSentences(sentences.slice(i, i + batchSize), options.bufferSize ?? 2));
  }

  const allChunks: ChunkWithMetadata[] = [];
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < batches.length; i++) {
    const embedded = await attachEmbeddings(batches[i]);
    const shifts = detectShifts(embedded, options.percentileThreshold ?? 90);
    const chunks = groupIntoChunks(embedded, shifts, options.maxChunkLength ?? 500);
    const merged = await mergeChunks(chunks, options);

    allChunks.push(...merged);

    const emb = await generateEmbeddings(merged.map((c) => c.text));
    if (emb.length !== merged.length) {
      throw new Error(`Embedding length mismatch: expected ${merged.length}, got ${emb.length}`);
    }
    allEmbeddings.push(...emb);
  }

  return { chunks: allChunks, embeddings: allEmbeddings };
}
