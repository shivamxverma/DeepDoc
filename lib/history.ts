import { desc, eq } from "drizzle-orm";
import { db } from "./db";
import { messages } from "./db/schema";
import { estimateTokens, readEnvNumber } from "./context";
import type { PromptMessage } from "./prompt";

export type HistoryMessage = PromptMessage & { role: "user" | "assistant" };

/**
 * Most recent turns of a chat, oldest first, trimmed to a message count and token budget
 * (older turns are dropped first). AI replies are stored with role "system" in the DB and
 * must go to the model as "assistant", never as system instructions.
 */
export async function loadHistory(chatId: number): Promise<HistoryMessage[]> {
  const maxMessages = readEnvNumber("CHAT_HISTORY_MESSAGES", 8);
  const maxTokens = readEnvNumber("CHAT_HISTORY_MAX_TOKENS", 2000);

  const rows = await db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(desc(messages.id))
    .limit(maxMessages);

  const kept: HistoryMessage[] = [];
  let used = 0;
  for (const row of rows) {
    const tokens = estimateTokens(row.content);
    if (used + tokens > maxTokens) break;
    used += tokens;
    kept.push({ role: row.role === "user" ? "user" : "assistant", content: row.content });
  }
  return kept.reverse();
}
