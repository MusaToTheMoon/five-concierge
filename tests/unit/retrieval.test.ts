import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  EXPECTED_RANKED_IDS,
  FIXTURE_SPECS,
  ORTHOGONAL_QUERY_VECTOR,
  QUERY_VECTOR,
  fixtureFsMock,
} from "../fixtures/embeddings";

/**
 * A hoisted mock so it exists before the vi.mock factory below runs (vi.mock
 * calls are hoisted above regular declarations, so anything they close over
 * must be created through vi.hoisted). Its resolved value is set per test.
 */
const mockEmbedTexts = vi.hoisted(() => vi.fn());

vi.mock("node:fs", () => fixtureFsMock());
vi.mock("@/lib/gemini", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gemini")>(
    "@/lib/gemini",
  );
  return { ...actual, embedTexts: mockEmbedTexts };
});

/** Expected cosine score for a fixture id, by construction of the fixture. */
const scoreOf = (id: string): number =>
  FIXTURE_SPECS.find((s) => s.id === id)!.score;

beforeEach(() => {
  vi.resetModules();
  mockEmbedTexts.mockReset();
  mockEmbedTexts.mockImplementation(async () => [QUERY_VECTOR]);
});

describe("lib/retrieval retrieve()", () => {
  it("returns results sorted by descending score, each equal to the dot product to within 1e-12", async () => {
    const { retrieve } = await import("@/lib/retrieval");

    const results = await retrieve("query", 10);

    expect(results.map((c) => c.id)).toEqual(EXPECTED_RANKED_IDS);
    for (const chunk of results) {
      expect(Math.abs(chunk.score - scoreOf(chunk.id))).toBeLessThan(1e-12);
    }
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it("excludes chunks scoring below 0.55, keeping the one just over and dropping the one just under", async () => {
    const { retrieve } = await import("@/lib/retrieval");

    const results = await retrieve("query", 10);
    const ids = results.map((c) => c.id);

    expect(ids).toContain("chunk-zurich"); // score 0.56, just over the threshold
    expect(ids).not.toContain("chunk-ibiza"); // score 0.54, just under the threshold
    expect(ids).not.toContain("chunk-offtopic"); // score 0.0
    expect(ids).toEqual(EXPECTED_RANKED_IDS);
  });

  it("returns an empty array for a query orthogonal to every chunk", async () => {
    mockEmbedTexts.mockImplementation(async () => [ORTHOGONAL_QUERY_VECTOR]);
    const { retrieve } = await import("@/lib/retrieval");

    const results = await retrieve("off topic query");

    expect(results).toEqual([]);
  });

  it("defaults k to 6", async () => {
    const { retrieve } = await import("@/lib/retrieval");

    const results = await retrieve("query");

    expect(results).toHaveLength(6);
    expect(results.map((c) => c.id)).toEqual(EXPECTED_RANKED_IDS.slice(0, 6));
  });

  it("caps the result count at the given k", async () => {
    const { retrieve } = await import("@/lib/retrieval");

    const results = await retrieve("query", 3);

    expect(results).toHaveLength(3);
    expect(results.map((c) => c.id)).toEqual(EXPECTED_RANKED_IDS.slice(0, 3));
  });
});

describe("lib/retrieval toSources()", () => {
  it("dedupes by source_url, keeps first-seen rank order, and returns {title, url} objects", async () => {
    const { retrieve, toSources } = await import("@/lib/retrieval");

    const chunks = await retrieve("query", 10);
    const sources = toSources(chunks);

    // chunk-palm-suites (score 1.0) and chunk-palm-beach (score 0.8) share a
    // source_url, so the second occurrence must be dropped and the first
    // occurrence's title must win.
    expect(sources).toEqual([
      { title: "FIVE Palm Jumeirah", url: "https://fivehotelsandresorts.com/five-palm-jumeirah" },
      { title: "The Spa at FIVE", url: "https://fivehotelsandresorts.com/spa" },
      { title: "Beach and Pool Clubs", url: "https://fivehotelsandresorts.com/pool-clubs" },
      { title: "Dining at FIVE", url: "https://fivehotelsandresorts.com/dining" },
      { title: "Nightlife at FIVE", url: "https://fivehotelsandresorts.com/nightlife" },
      { title: "FIVE LUXE JBR", url: "https://fivehotelsandresorts.com/five-luxe" },
      { title: "FIVE Zurich", url: "https://fivehotelsandresorts.com/five-zurich" },
    ]);
  });
});

describe("lib/retrieval formatContext()", () => {
  it("numbers chunks from [1] and includes each chunk's title, source url, and text", async () => {
    const { retrieve, formatContext } = await import("@/lib/retrieval");

    const chunks = await retrieve("query", 2);
    const context = formatContext(chunks);

    expect(context).toBe(
      '[1] "FIVE Palm Jumeirah" (https://fivehotelsandresorts.com/five-palm-jumeirah)\n' +
        "FIVE Palm Jumeirah sits on its own stretch of beach with private pool suites." +
        "\n\n---\n\n" +
        '[2] "The Spa at FIVE" (https://fivehotelsandresorts.com/spa)\n' +
        "The Spa at FIVE offers hammam rituals and couples treatment rooms.",
    );
  });
});
