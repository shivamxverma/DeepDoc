import { NextResponse } from "next/server";
import { db } from "../../../lib/db";
import { chats, messages, userSystemEnum } from "../../../lib/db/schema";
import { eq } from "drizzle-orm";
import { getContext } from "../../../lib/context";
import { callChatModel, rewriteQuestion } from "../../../lib/chat";
import { loadHistory } from "../../../lib/history";
import { buildChatMessages } from "../../../lib/prompt";

import { sanitizeServerError } from "../../../lib/error";

export async function POST(req: Request) {
  try {
    // History comes from the DB, never from the client, so it can't be forged.
    const { message, chatId } = (await req.json()) as { message: string; chatId: number | string };

    if (!chatId || typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const found = await db.select().from(chats).where(eq(chats.id, Number(chatId)));
    if (found.length !== 1) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    const fileKey = found[0].fileKey;

    // Load history before saving the new message so it isn't duplicated in the prompt.
    const history = await loadHistory(Number(chatId));

    await db.insert(messages).values({
      chatId: Number(chatId),
      content: message,
      role: userSystemEnum.enumValues[1],
    });

    const searchQuery = await rewriteQuestion(history, message);
    const context = await getContext(searchQuery, fileKey);

    const promptMessages = buildChatMessages(context ?? "", message, history);

    const aiMessage = await callChatModel(promptMessages);

    await db.insert(messages).values({
      chatId: Number(chatId),
      content: aiMessage,
      role: userSystemEnum.enumValues[0],
    });

    return NextResponse.json({ role: "system", content: aiMessage });
  } catch (error: any) {
    const userMessage = sanitizeServerError(error);
    const status = error?.status || error?.response?.status || 500;
    return NextResponse.json(
      { error: userMessage },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}