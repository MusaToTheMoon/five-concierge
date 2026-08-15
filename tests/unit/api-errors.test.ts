import { describe, expect, it } from "vitest";
import { classifyError, handleGeminiError } from "@/lib/api-errors";

describe("lib/api-errors handleGeminiError()", () => {
  it("returns 429 with the overwhelmed-desk copy when error.status is 429", async () => {
    const error = Object.assign(new Error("some upstream failure"), {
      status: 429,
    });

    const response = handleGeminiError(error);
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body).toEqual({
      error:
        "The concierge desk is a little overwhelmed right now. Give it a moment and ask again.",
    });
  });

  it("returns 429 with the overwhelmed-desk copy when the message matches RESOURCE_EXHAUSTED|429", async () => {
    const error = new Error("429 RESOURCE_EXHAUSTED: quota exceeded");

    const response = handleGeminiError(error);
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body).toEqual({
      error:
        "The concierge desk is a little overwhelmed right now. Give it a moment and ask again.",
    });
  });

  it("returns 500 with the not-configured copy when the message mentions GEMINI_API_KEY", async () => {
    const error = new Error(
      "GEMINI_API_KEY is not set. Add it to .env.local (see .env.example).",
    );

    const response = handleGeminiError(error);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "The concierge isn't configured yet. See the README.",
    });
  });

  it("returns 500 with the not-configured copy when the message mentions embeddings.json", async () => {
    const error = new Error(
      "data/embeddings.json not found. Run `npm run ingest` first.",
    );

    const response = handleGeminiError(error);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "The concierge isn't configured yet. See the README.",
    });
  });

  it("returns 500 with the generic retry copy for any other error", async () => {
    const error = new Error("totally unexpected failure");

    const response = handleGeminiError(error);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Something went wrong at the desk. Please try that once more.",
    });
  });
});

describe("lib/api-errors classifyError()", () => {
  it("returns provider_rate_limit when error.status is 429", () => {
    const error = Object.assign(new Error("some upstream failure"), { status: 429 });

    expect(classifyError(error)).toBe("provider_rate_limit");
  });

  it("returns provider_rate_limit when the message matches RESOURCE_EXHAUSTED|429", () => {
    const error = new Error("429 RESOURCE_EXHAUSTED: quota exceeded");

    expect(classifyError(error)).toBe("provider_rate_limit");
  });

  it("returns misconfigured when the message mentions GEMINI_API_KEY", () => {
    const error = new Error(
      "GEMINI_API_KEY is not set. Add it to .env.local (see .env.example).",
    );

    expect(classifyError(error)).toBe("misconfigured");
  });

  it("returns misconfigured when the message mentions embeddings.json", () => {
    const error = new Error("data/embeddings.json not found. Run `npm run ingest` first.");

    expect(classifyError(error)).toBe("misconfigured");
  });

  it("returns unknown for any other error", () => {
    const error = new Error("totally unexpected failure");

    expect(classifyError(error)).toBe("unknown");
  });
});
