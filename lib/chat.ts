import { azureClient } from "./azure";
import { config } from "./config";
import { buildCondenseMessages, type PromptMessage } from "./prompt";

export async function callChatModel(messages: PromptMessage[]): Promise<string> {
  const maxRetries = 5;
  let delay = 500;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await azureClient.chat.completions.create(
        {
          model: config.AZURE_OPENAI_CHAT_DEPLOYMENT_NAME,
          messages,
        },
        { signal: controller.signal }
      );
      clearTimeout(timeout);
      return response.choices[0]?.message?.content || "";
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

/**
 * Turn a follow-up into a standalone search query using the conversation so far.
 * Falls back to the original question when there is no history or the rewrite fails.
 */
export async function rewriteQuestion(history: PromptMessage[], question: string): Promise<string> {
  if (history.length === 0) return question;
  try {
    const rewritten = (await callChatModel(buildCondenseMessages(history, question))).trim();
    return rewritten || question;
  } catch {
    return question;
  }
}
