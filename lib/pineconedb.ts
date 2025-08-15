import { Pinecone, PineconeRecord } from "@pinecone-database/pinecone";
import dotenv from "dotenv";
dotenv.config();

const INDEX_NAME = process.env.PINECONE_INDEX || "chatpdf";

export const getPineconeClient = () =>
  new Pinecone({
    apiKey: process.env.PINECONE_API_KEY as string,
  });

type AllowedMeta = string | number | boolean;

function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, AllowedMeta> {
  const out: Record<string, AllowedMeta> = {};
  for (const k in metadata) {
    const v = metadata[k];
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    } else {
      out[k] = JSON.stringify(v ?? null);
    }
  }
  return out;
}

export async function uploadToPinecone(vectors: PineconeRecord[], namespace: string, batchSize = 100) {
  if (!vectors?.length) return;
  const client = getPineconeClient();
  const ns = client.index(INDEX_NAME).namespace(namespace);
  for (let i = 0; i < vectors.length; i += batchSize) {
    const batch = vectors.slice(i, i + batchSize).map((v) => ({
      id: v.id,
      values: v.values,
      metadata: v.metadata ? sanitizeMetadata(v.metadata as Record<string, unknown>) : {},
    }));
    await ns.upsert(batch);
  }
}
