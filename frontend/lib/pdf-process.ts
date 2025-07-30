"use server";

import { put } from "@vercel/blob";
import { processTextIntoPinecone } from "./pinecone";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "./db";
import { chats } from "./db/schema";

export async function uploadPDF(pdf: File | null) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  try {
    console.log("Received file for upload");

    if (!pdf) {
      return { error: "PDF file is required" };
    }

    const arrayBuffer = await pdf.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { default: pdfParse } = await import("pdf-parse");

    console.log(`Processing file: ${pdf.name}`);

    const pdfData = await pdfParse(buffer);
    const extractedText = pdfData.text;

    const blob = await put(pdf.name, buffer, {
      access: "public",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    let chat_id: any[] = [];
    console.log("blob", blob);

    if (extractedText) {
      try {
        const fileKey = `${pdf.name}-${Date.now()}.pdf`;
        await processTextIntoPinecone(extractedText, fileKey);
        console.log("Embedding uploaded successfully!");

        chat_id = await db
          .insert(chats)
          .values({
            fileKey,
            pdfName: pdf.name,
            pdfUrl: blob.url,
            userId,
          })
          .returning({
            insertedId: chats.id,
          });
      } catch (error) {
        console.error("Error processing text:", error);
      }
    }

    return {
      message: "File uploaded and processed successfully",
      chat_id: chat_id.length > 0 ? chat_id[0].insertedId : null,
      text: extractedText,
      fileUrl: blob.url,
    };
  } catch (error) {
    console.error("Error processing PDF:", error);
    return { error: "Failed to process PDF" };
  }
}
