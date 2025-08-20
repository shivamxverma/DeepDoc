"use server";

import md5 from "md5";
import { PineconeRecord } from "@pinecone-database/pinecone";
import { put } from "@vercel/blob";
import { db } from "./db";
import { chats } from "./db/schema";
import { uploadToPinecone } from "./pineconedb";
import { processText } from "./chunking";

interface UploadSuccess {
  message: string;
  chatId: number | null;
  text: string;
  fileUrl: string;
}

interface UploadError {
  error: string;
}

function isZeroVector(vector: number[]): boolean {
  return vector.every((v) => v === 0);
}

export async function uploadPDF(pdf: File | null): Promise<UploadSuccess | UploadError> {
  if (!pdf) {
    return { error: "PDF file is required" };
  }

  const arrayBuffer = await pdf.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { default: pdfParse } = await import("pdf-parse");
  const { text: extractedText } = await pdfParse(buffer);

  const timestamp = Date.now();
  const fileKey = `${pdf.name}-${timestamp}.pdf`;

  const blob = await put(fileKey, buffer, {
    access: "public",
    contentType: "application/pdf",
  });

  let chatId: number | null = null;

  const [inserted] = await db
    .insert(chats)
    .values({
      fileKey,
      pdfName: pdf.name,
      pdfUrl: blob.url,
    })
    .returning({ id: chats.id });

  chatId = inserted.id;

  if (extractedText) {
    try {
      const { chunks, embeddings } = await processText(extractedText, {
        bufferSize: 1,
        mergeLengthThreshold: 300,
        cosineSimThreshold: 0.8,
        percentileThreshold: 90,
        maxSentencesPerBatch: 500,
      });

      const validVectors: PineconeRecord[] = [];
      for (let index = 0; index < chunks.length; index++) {
        const embedding = embeddings[index];
        if (embedding && !isZeroVector(embedding)) {
          validVectors.push({
            id: md5(chunks[index].text),
            values: embedding,
            metadata: {
              text: chunks[index].text,
              startIndex: chunks[index].metadata.startIndex,
              endIndex: chunks[index].metadata.endIndex,
              title: "PDF Document",
              description: "PDF document",
              timestamp: new Date().toISOString(),
              chatId,
              fileKey,
            },
          });
        }
      }

      if (validVectors.length > 0) {
        await uploadToPinecone(validVectors, fileKey);
      }
    } catch (err) {
      return { error: "Failed to process PDF text or save record." };
    }
  }

  return {
    message: "File uploaded and processed successfully",
    chatId,
    text: extractedText,
    fileUrl: blob.url,
  };
}