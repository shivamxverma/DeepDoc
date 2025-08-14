"use server";

import { put } from "@vercel/blob";
import { processTextIntoPinecone } from "./pinecone";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "./db";
import { chats } from "./db/schema";

interface UploadSuccess {
  message: string;
  chatId: number | null;
  text: string;
  fileUrl: string;
}

interface UploadError {
  error: string;
}

export async function uploadPDF(
  pdf: File | null
): Promise<UploadSuccess | UploadError> {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  if (!pdf) {
    return { error: "PDF file is required" };
  }

  console.log("Received file for upload:", pdf.name);

  const arrayBuffer = await pdf.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { default: pdfParse } = await import("pdf-parse");
  const { text: extractedText } = await pdfParse(buffer);

  const timestamp = Date.now();
  const fileKey = `${pdf.name}-${timestamp}.pdf`;

  const blob = await put(fileKey, buffer, {
    access: "public",
  });

  let chatId: number | null = null;

  if (extractedText) {
    try {
      await processTextIntoPinecone(extractedText, fileKey);
      console.log("Embeddings uploaded successfully!");

      const [inserted] = await db
        .insert(chats)
        .values({
          fileKey,
          pdfName: pdf.name,
          pdfUrl: blob.url,
          userId,
        })
        .returning({ id: chats.id });

      chatId = inserted.id;
    } catch (err) {
      console.error("Error processing text or saving chat:", err);
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
