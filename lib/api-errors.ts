import { NextResponse } from "next/server";

const RATE_LIMIT_REPLY =
  "The concierge desk is a little overwhelmed right now. Give it a moment and ask again.";

/** Maps provider failures to friendly, retryable messages. */
export function handleGeminiError(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : String(error);
  const status = (error as { status?: number })?.status;
  console.error("Gemini request failed:", message);

  if (status === 429 || /RESOURCE_EXHAUSTED|429/.test(message)) {
    return NextResponse.json({ error: RATE_LIMIT_REPLY }, { status: 429 });
  }
  if (/GEMINI_API_KEY|embeddings\.json/.test(message)) {
    return NextResponse.json(
      { error: "The concierge isn't configured yet — see the README." },
      { status: 500 },
    );
  }
  return NextResponse.json(
    { error: "Something went wrong at the desk. Please try that once more." },
    { status: 500 },
  );
}
