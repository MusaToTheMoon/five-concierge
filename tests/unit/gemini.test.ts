import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A hoisted mock so it exists before the vi.mock factory below runs (vi.mock
 * calls are hoisted above regular declarations, so anything they close over
 * must be created through vi.hoisted).
 */
const mockEmbedContent = vi.hoisted(() => vi.fn());

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: { embedContent: mockEmbedContent },
  })),
}));

describe("lib/gemini", () => {
  beforeEach(() => {
    vi.resetModules();
    mockEmbedContent.mockReset();
    process.env.GEMINI_API_KEY = "test-key";
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  it("EMBEDDING_DIM is exactly 768", async () => {
    const { EMBEDDING_DIM } = await import("@/lib/gemini");
    expect(EMBEDDING_DIM).toBe(768);
  });

  it("embedTexts passes outputDimensionality 768 and the caller's taskType", async () => {
    mockEmbedContent.mockResolvedValueOnce({
      embeddings: [{ values: new Array(768).fill(0) }],
    });
    const { embedTexts, EMBEDDING_MODEL, EMBEDDING_DIM } = await import(
      "@/lib/gemini"
    );

    await embedTexts(["a query"], "RETRIEVAL_QUERY");

    expect(mockEmbedContent).toHaveBeenCalledWith({
      model: EMBEDDING_MODEL,
      contents: ["a query"],
      config: { taskType: "RETRIEVAL_QUERY", outputDimensionality: EMBEDDING_DIM },
    });
  });

  it("embedTexts L2-renormalizes what the API returns", async () => {
    mockEmbedContent.mockResolvedValueOnce({
      embeddings: [{ values: [3, 4] }],
    });
    const { embedTexts } = await import("@/lib/gemini");

    const [result] = await embedTexts(["doc"], "RETRIEVAL_DOCUMENT");

    expect(result).toEqual([0.6, 0.8]);
    const magnitude = Math.hypot(...result);
    expect(Math.abs(magnitude - 1)).toBeLessThan(1e-12);
  });

  it("l2Normalize on a zero vector returns the zero vector unchanged", async () => {
    const { l2Normalize } = await import("@/lib/gemini");

    const result = l2Normalize([0, 0, 0]);

    expect(result).toEqual([0, 0, 0]);
    expect(result.some((v) => Number.isNaN(v))).toBe(false);
  });

  it("embedTexts throws when the API returns a different embedding count than requested", async () => {
    mockEmbedContent.mockResolvedValueOnce({
      embeddings: [{ values: [1, 0] }],
    });
    const { embedTexts } = await import("@/lib/gemini");

    await expect(embedTexts(["one", "two"], "RETRIEVAL_QUERY")).rejects.toThrow(
      "Expected 2 embeddings, got 1",
    );
  });

  it("getGemini throws when GEMINI_API_KEY is unset", async () => {
    delete process.env.GEMINI_API_KEY;
    vi.resetModules();
    const { getGemini } = await import("@/lib/gemini");

    expect(() => getGemini()).toThrow(
      "GEMINI_API_KEY is not set. Add it to .env.local (see .env.example).",
    );
  });
});
