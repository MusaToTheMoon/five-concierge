import { beforeEach, describe, expect, it, vi } from "vitest";
import { missingStoreFsMock } from "../fixtures/embeddings";

/**
 * A hoisted mock so it exists before the vi.mock factory below runs (vi.mock
 * calls are hoisted above regular declarations, so anything they close over
 * must be created through vi.hoisted).
 */
const mockEmbedTexts = vi.hoisted(() => vi.fn());

vi.mock("node:fs", () => missingStoreFsMock());
vi.mock("@/lib/gemini", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gemini")>(
    "@/lib/gemini",
  );
  return { ...actual, embedTexts: mockEmbedTexts };
});

beforeEach(() => {
  vi.resetModules();
  mockEmbedTexts.mockReset();
  mockEmbedTexts.mockImplementation(async () => [new Array(768).fill(0)]);
});

describe("lib/retrieval retrieve() with a missing embeddings store", () => {
  it("throws telling the caller to run npm run ingest", async () => {
    const { retrieve } = await import("@/lib/retrieval");

    await expect(retrieve("query", 6)).rejects.toThrow(
      "data/embeddings.json not found. Run `npm run ingest` first.",
    );
  });
});
