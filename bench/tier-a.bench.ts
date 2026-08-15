/**
 * Tier A: retrieval scoring, offline, high volume.
 *
 * Measures the real retrieve() from lib/retrieval.ts with only the Gemini
 * embedding call mocked out (to a cached vector, resolved synchronously), so
 * what gets timed is the real scoring path: dot products over the real
 * store, threshold filter, sort, slice. node:fs is NOT mocked; this reads
 * the real data/embeddings.json, not a test fixture.
 *
 * Zero Google API calls. Run with: npm run bench (also runs Tier C).
 */
import { it, vi } from "vitest";
import { readCorpusInfo, readSampleQueryVector } from "./support/corpus";
import { collectEnvironment } from "./support/environment";
import { summarizeFull } from "./support/stats";
import { writeResult } from "./support/results";

const ITERATIONS = 10_000;
const WARMUP = 500;
const TEST_TIMEOUT_MS = 5 * 60 * 1000;

vi.mock("@/lib/gemini", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gemini")>("@/lib/gemini");
  const queryVector = readSampleQueryVector();
  return {
    ...actual,
    embedTexts: vi.fn(async () => [queryVector]),
  };
});

it(
  "tier A: retrieval scoring benchmark (offline, real store)",
  async () => {
    const { retrieve } = await import("@/lib/retrieval");
    const query = "Tell me about the spa, pool clubs and dining at FIVE Palm Jumeirah";

    for (let i = 0; i < WARMUP; i++) {
      await retrieve(query);
    }

    const durations: number[] = [];
    const runStart = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      const start = performance.now();
      await retrieve(query);
      durations.push(performance.now() - start);
    }
    const totalMs = performance.now() - runStart;

    const stats = summarizeFull(durations);
    const opsPerSecond = ITERATIONS / (totalMs / 1000);

    const resultPath = writeResult("tier-a.json", {
      tier: "A",
      description:
        "Retrieval scoring only: dot products over the real embedding store, threshold filter, sort, slice. The Gemini embedding call is mocked to return a cached query vector synchronously; everything after that (lib/retrieval.ts's retrieve()) runs for real against the real data/embeddings.json store.",
      measuredAt: new Date().toISOString(),
      touchedGoogleApi: false,
      apiCalls: 0,
      environment: collectEnvironment(),
      corpus: readCorpusInfo(),
      config: { iterations: ITERATIONS, warmup: WARMUP },
      stats,
      opsPerSecond,
    });

    console.log(`Tier A: wrote ${resultPath}`);
  },
  TEST_TIMEOUT_MS,
);
