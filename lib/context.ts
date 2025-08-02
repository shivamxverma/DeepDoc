import { Pinecone } from "@pinecone-database/pinecone";
import { generateEmbedding } from "./pinecone";

export interface MatchMetadata {
  text: string;
  pageNumber: number;
}

export async function getMatchesFromEmbeddings(
  embeddings: number[],
  fileKey: string
): Promise<Array<{ id: string; score: number; metadata: MatchMetadata }>> {
  try {
    const client = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
    const pineconeIndex = await client.index("chatpdf");
    const namespace = pineconeIndex.namespace(fileKey);
    const queryResult = await namespace.query({
      topK: 5,
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

export async function getContext(
  query: string,
  fileKey: string
): Promise<string> {
  const queryEmbeddings = await generateEmbedding(query);
  const matches = await getMatchesFromEmbeddings(queryEmbeddings, fileKey);
  const qualifyingDocs = matches.filter(
    (match) => match.score !== undefined && match.score > 0.7
  );
  const docs = qualifyingDocs.map((match) => match.metadata.text);
  return docs.join("\n").substring(0, 3000);
}
