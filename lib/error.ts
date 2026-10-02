/**
 * Centralized Error handling & Security Sanitization Module for DeepDoc
 *
 * Prevents internal server details, raw SQL queries, database hostnames,
 * API stack traces, and cloud secrets from leaking to the frontend client.
 */

export enum ErrorCategory {
  DATABASE = "DATABASE",
  STORAGE = "STORAGE",
  VECTOR_DB = "VECTOR_DB",
  AI_MODEL = "AI_MODEL",
  PARSING = "PARSING",
  VALIDATION = "VALIDATION",
  UNKNOWN = "UNKNOWN",
}

export interface HumanizedError {
  category: ErrorCategory;
  message: string;
}

/**
 * Checks if an error message string contains sensitive technical information
 * such as SQL syntax, stack traces, hostnames, or API tokens.
 */
function isSensitiveErrorMessage(msg: string): boolean {
  const lower = msg.toLowerCase();
  const sensitivePatterns = [
    "select ",
    "insert ",
    "update ",
    "delete ",
    "from ",
    "where ",
    "http://",
    "https://",
    "localhost",
    "127.0.0.1",
    "getaddrinfo",
    "enotfound",
    "econnrefused",
    "at ",
    "token",
    "password",
    "secret",
    "bearer",
    "neondberror",
    "failed query",
  ];
  return sensitivePatterns.some((pattern) => lower.includes(pattern));
}

/**
 * Maps technical server errors into humanized, safe user messages.
 * Logs full technical details safely to the server console.
 */
export function sanitizeServerError(error: unknown): string {
  // Log full technical details safely to server console for developer debugging
  console.error("[SERVER ERROR LOG]:", error);

  if (!error) {
    return "An unexpected error occurred. Please try again.";
  }

  const errString = String(
    error instanceof Error ? error.stack || error.message : JSON.stringify(error)
  ).toLowerCase();

  // Database connectivity & query failures (Postgres, Neon, ENOTFOUND, connection refused, failed query)
  if (
    errString.includes("neon") ||
    errString.includes("postgres") ||
    errString.includes("enotfound") ||
    errString.includes("econnrefused") ||
    errString.includes("failed query") ||
    errString.includes("connection to server") ||
    errString.includes("database_url")
  ) {
    return "Unable to connect to the database service. Please check system configuration or try again shortly.";
  }

  // Storage / Vercel Blob access denied / unauthorized / missing token
  if (
    errString.includes("vercel blob") ||
    errString.includes("access denied") ||
    errString.includes("blob_read_write_token") ||
    errString.includes("unauthorized")
  ) {
    return "File storage service is temporarily unavailable or misconfigured. Please check storage settings.";
  }

  // Pinecone / Vector DB errors
  if (
    errString.includes("pinecone") ||
    errString.includes("vector") ||
    errString.includes("pinecone_api_key")
  ) {
    return "Vector database processing failed. Please try uploading the document again.";
  }

  // Azure OpenAI / AI Model / Rate limit / Capacity errors
  if (
    errString.includes("azure_openai") ||
    errString.includes("openai") ||
    errString.includes("rate limit") ||
    errString.includes("503") ||
    errString.includes("capacity")
  ) {
    return "AI service is currently busy or experiencing high demand. Please try again in a moment.";
  }

  // PDF Parsing errors
  if (
    errString.includes("pdf-parse") ||
    errString.includes("corrupt") ||
    errString.includes("invalid pdf")
  ) {
    return "Failed to extract text from the PDF. The file may be corrupted or password protected.";
  }

  // Safe error fallback: If custom Error object has a safe non-technical message, return it
  if (error instanceof Error && error.message && !isSensitiveErrorMessage(error.message)) {
    return error.message;
  }

  return "An unexpected error occurred while processing your request. Please try again later.";
}
