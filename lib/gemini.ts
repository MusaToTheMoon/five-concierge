import { GoogleGenAI } from "@google/genai";

/** Chat + embedding models, pinned per project spec (free tier). */
export const CHAT_MODEL = "gemini-2.5-flash";
export const EMBEDDING_MODEL = "gemini-embedding-001";

/**
 * gemini-embedding-001 natively outputs 3072 dims; we truncate to 768 to keep
 * the JSON store small. Truncated vectors are no longer unit-length, so every
 * embedding is re-normalised before use (see `l2Normalize`).
 */
export const EMBEDDING_DIM = 768;

let client: GoogleGenAI | null = null;

/** Lazily constructs the singleton Gemini client. Server-side only. */
export function getGemini(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to .env.local (see .env.example).",
    );
  }
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

/**
 * Scales a vector to unit length. Exported so the renormalization that makes
 * truncated embeddings comparable is directly testable.
 */
export function l2Normalize(vector: number[]): number[] {
  const norm = Math.hypot(...vector);
  return norm === 0 ? vector : vector.map((v) => v / norm);
}

/**
 * Embeds a batch of texts and returns unit-length vectors, so cosine
 * similarity reduces to a plain dot product at query time.
 */
export async function embedTexts(
  texts: string[],
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
): Promise<number[][]> {
  const response = await getGemini().models.embedContent({
    model: EMBEDDING_MODEL,
    contents: texts,
    config: { taskType, outputDimensionality: EMBEDDING_DIM },
  });
  const embeddings = response.embeddings ?? [];
  if (embeddings.length !== texts.length) {
    throw new Error(
      `Expected ${texts.length} embeddings, got ${embeddings.length}`,
    );
  }
  return embeddings.map((e) => l2Normalize(e.values ?? []));
}
