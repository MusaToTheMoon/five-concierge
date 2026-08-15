import { NextResponse } from "next/server";
import type { ErrorKind } from "./observability";

const RATE_LIMIT_REPLY =
  "The concierge desk is a little overwhelmed right now. Give it a moment and ask again.";

/** Categorizes a provider failure for logging. Shared with handleGeminiError so the branching lives in one place. */
export function classifyError(error: unknown): ErrorKind {
  const message = error instanceof Error ? error.message : String(error);
  const status = (error as { status?: number })?.status;

  if (status === 429 || /RESOURCE_EXHAUSTED|429/.test(message)) return "provider_rate_limit";
  if (/GEMINI_API_KEY|embeddings\.json/.test(message)) return "misconfigured";
  return "unknown";
}

/** Maps provider failures to friendly, retryable messages. */
export function handleGeminiError(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Gemini request failed:", message);

  const kind = classifyError(error);
  if (kind === "provider_rate_limit") {
    return NextResponse.json({ error: RATE_LIMIT_REPLY }, { status: 429 });
  }
  if (kind === "misconfigured") {
    return NextResponse.json(
      { error: "The concierge isn't configured yet. See the README." },
      { status: 500 },
    );
  }
  return NextResponse.json(
    { error: "Something went wrong at the desk. Please try that once more." },
    { status: 500 },
  );
}
