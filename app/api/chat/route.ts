import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "../../../lib/db";
import { chats, messages, userSystemEnum } from "../../../lib/db/schema";
import { eq } from "drizzle-orm";
import { getContext } from "../../../lib/context";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

type ChatMessage = { role: "user" | "system"; content: string };

async function callGeminiWithRetry(prompt: string): Promise<string> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const maxRetries = 5;
  let delay = 500;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const result = await model.generateContent(
        { contents: [{ role: "user", parts: [{ text: prompt }] }] },
        { signal: controller.signal }
      );
      clearTimeout(timeout);
      return result.response.text();
    } catch (err: any) {
      clearTimeout(timeout);
      const status =
        err?.status || err?.response?.status || (err?.name === "AbortError" ? 408 : undefined);
      const retriable =
        status === 503 || status === 500 || status === 429 || status === 408;
      if (!retriable || attempt === maxRetries) throw err;
      await new Promise((r) => setTimeout(r, delay + Math.random() * 300));
      delay *= 2;
    }
  }
  throw new Error("Exhausted retries");
}

export async function POST(req: Request) {
  try {
    const { messages: chatMessages, chatId } = (await req.json()) as {
      messages: ChatMessage[];
      chatId: string;
    };

    if (!chatId || !Array.isArray(chatMessages) || chatMessages.length === 0) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const lastMessage = chatMessages[chatMessages.length - 1];
    if (!lastMessage?.content || lastMessage.role !== "user") {
      return NextResponse.json(
        { error: "Last message must be from user with content" },
        { status: 400 }
      );
    }

    const found = await db.select().from(chats).where(eq(chats.id, Number(chatId)));
    if (found.length !== 1) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    const fileKey = found[0].fileKey;

    await db.insert(messages).values({
      chatId: Number(chatId),
      content: lastMessage.content,
      role: userSystemEnum.enumValues[1],
    });

    const context = await getContext(lastMessage.content, fileKey);

    const prompt = `
You are DeepDoc, an assistant focused on the user's uploaded material. Your job is to give accurate, useful answers strictly grounded in the CONTEXT BLOCK below.

## Grounding
- Use only the CONTEXT BLOCK for factual claims, definitions, numbers, names, dates, quotes, and code. Do not rely on outside knowledge to fill gaps.
- If the context is empty, off-topic, or insufficient to answer the question, respond with exactly this sentence and nothing else: "I'm sorry, but I don't have enough information to answer that question based on the given context."
- If the context supports only part of the question, answer that part clearly and briefly state what the provided material does not cover (without inventing details).

## Answers
- Lead with a direct answer, then add structure only when it helps: short paragraphs, bullets for lists, numbered steps for procedures, tables for comparisons.
- For code or technical excerpts taken from the context, use fenced code blocks and preserve identifiers and syntax faithfully.
- Be concise by default; expand only when the question asks for explanation, walkthroughs, or edge cases that the context actually supports.
- Write in a neutral, professional tone. Avoid meta phrases like "according to the context" unless you are stating a limitation.

CONTEXT BLOCK:
${context ?? ""}

User: ${lastMessage.content}
DeepDoc:
`.trim();

    const aiMessage = await callGeminiWithRetry(prompt);

    await db.insert(messages).values({
      chatId: Number(chatId),
      content: aiMessage,
      role: userSystemEnum.enumValues[0],
    });

    return NextResponse.json({ role: "system", content: aiMessage });
  } catch (error: any) {
    const status = error?.status || error?.response?.status || 500;
    const statusText =
      error?.statusText || error?.response?.statusText || error?.message || "Internal Server Error";
    return NextResponse.json(
      { error: "Upstream model error. Please try again.", status, statusText },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}