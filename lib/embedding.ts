import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "./config";

const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "text-embedding-004" });

const embeddingCache = new Map<string, number[]>();
const MAX_PAYLOAD_SIZE = 9000;

function truncateText(text: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(text);
  if (encoded.length <= maxBytes) return text;
  const truncated = encoded.slice(0, maxBytes);
  return new TextDecoder().decode(truncated).substring(0, Math.floor(maxBytes / 4));
}

function isZeroVector(vector: number[]): boolean {
  return vector.every((v) => v === 0);
}

export async function generateEmbedding(text: string, retries = 3, timeoutMs = 10000): Promise<number[]> {
  const cached = embeddingCache.get(text);
  if (cached) return cached;

  const truncatedText = truncateText(text, MAX_PAYLOAD_SIZE);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Embedding timeout")), timeoutMs));
      const embeddingPromise = model.embedContent(truncatedText).then((r) => r.embedding.values as number[]);
      const embedding = await Promise.race([embeddingPromise, timeoutPromise]);
      if (isZeroVector(embedding)) throw new Error("All-zero embedding");
      embeddingCache.set(text, embedding);
      return embedding;
    } catch {
      if (attempt === retries) throw new Error("Failed to generate embedding");
      await new Promise((res) => setTimeout(res, 1000 * attempt));
    }
  }
  throw new Error("Unexpected");
}

export async function generateEmbeddings(texts: string[], batchSize = 10): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const batchEmbeddings = await Promise.all(
      batch.map(async (t) => {
        try {
          return await generateEmbedding(t);
        } catch {
          return null;
        }
      })
    );
    out.push(...batchEmbeddings.filter((e): e is number[] => Array.isArray(e)));
  }
  return out;
}
