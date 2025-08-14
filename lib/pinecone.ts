import { GoogleGenerativeAI } from '@google/generative-ai';
import { Pinecone } from "@pinecone-database/pinecone";
import dotenv from 'dotenv';
import md5 from 'md5';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
dotenv.config();

/** 
 * A “raw” chunk coming out of the splitter:
 * metadata may be anything JSON‐serializable.
 */
interface RawDoc {
  pageContent: string;
  metadata: Record<string, unknown>;
}

/** 
 * What Pinecone wants:
 *  - id
 *  - values
 *  - metadata only of primitive or string[] types
 */
interface PineconeVector {
  id: string;
  values: number[];
  metadata: Record<string, string | number | boolean | string[]>;
}

export const getPineconeClient = () =>
  new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });

const googleai = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY!
).getGenerativeModel({ model: "text-embedding-004" });

export async function processTextIntoPinecone(
  text: string,
  fileKey: string
): Promise<string> {
  console.log("Splitting text into smaller chunks...");
  const docs = await splitTextIntoChunks(text);

  console.log("Generating embeddings...");
  const vectors = await generateEmbeddings(docs);

  console.log("Uploading embeddings to Pinecone...");
  await uploadToPinecone(vectors, fileKey);

  // return the first chunk’s content
  return docs[0].pageContent;
}

async function splitTextIntoChunks(text: string): Promise<RawDoc[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 200,
    chunkOverlap: 50,
  });

  return splitter.splitDocuments([
    {
      pageContent: text,
      metadata: { text: truncateStringByBytes(text, 36000) },
    },
  ]);
}

async function generateEmbeddings(
  docs: RawDoc[]
): Promise<PineconeVector[]> {
  return Promise.all(
    docs.map(async (doc) => ({
      id: md5(doc.pageContent),
      values: await generateEmbedding(doc.pageContent),
      metadata: sanitizeMetadata(doc.metadata),
    }))
  );
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const result = await googleai.embedContent(text);
  return result.embedding.values;
}

async function uploadToPinecone(
  vectors: PineconeVector[],
  fileKey: string
) {
  const client = getPineconeClient();
  const pineconeIndex = await client.index("chatpdf");
  const namespace = pineconeIndex.namespace(fileKey);
  console.log("Inserting vectors into Pinecone...");
  await namespace.upsert(vectors);
}

function sanitizeMetadata(
  metadata: Record<string, unknown>
): PineconeVector["metadata"] {
  const out: PineconeVector["metadata"] = {};

  for (const [k, v] of Object.entries(metadata)) {
    if (
      typeof v === "string" ||
      typeof v === "number" ||
      typeof v === "boolean"
    ) {
      out[k] = v;
    } else if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
      out[k] = v;
    } else {
      out[k] = JSON.stringify(v);
    }
  }

  return out;
}

export const truncateStringByBytes = (str: string, bytes: number): string => {
  const enc = new TextEncoder();
  const dec = new TextDecoder("utf-8");
  return dec.decode(enc.encode(str).slice(0, bytes));
};
