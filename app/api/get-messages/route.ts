import { db } from "../../../lib/db";
import { messages } from "../../../lib/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { sanitizeServerError } from "../../../lib/error";

interface RequestBody {
  chatId: number;
}

export async function POST(req: Request) {
  try {
    const { chatId } = (await req.json()) as RequestBody;

    if (!chatId || typeof chatId !== "number") {
      return NextResponse.json({ error: "Invalid or missing chatId" }, { status: 400 });
    }

    const _messages = await db.select().from(messages).where(eq(messages.chatId, chatId));

    return NextResponse.json(_messages);
  } catch (error) {
    return NextResponse.json({ error: sanitizeServerError(error) }, { status: 500 });
  }
}