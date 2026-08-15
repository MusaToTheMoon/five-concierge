/**
 * Tier C: concurrency and throughput, offline, high volume.
 *
 * Drives the real POST route handler from app/api/chat/route.ts, with
 * Gemini stubbed to resolve after Tier B's measured median embed and
 * generate latencies (read from bench/results/live.json). The rate limiter,
 * Redis client and ipAddress are mocked the way the existing integration
 * tests mock them, with a distinct IP per virtual user so the per-IP limiter
 * is not what gets measured. node:fs is NOT mocked; this reads the real
 * data/embeddings.json, not a test fixture.
 *
 * Zero Google API calls. Run with: npm run bench (also runs Tier A).
 * Requires bench/results/live.json (npm run bench:live) to already exist.
 */
import { it, vi } from "vitest";
import { readCorpusInfo, readSampleQueryVector } from "./support/corpus";
import { collectEnvironment } from "./support/environment";
import { summarizeFull, type FullStats, type LiveStats } from "./support/stats";
import { readResult, writeResult } from "./support/results";

interface LiveResultShape {
  embed: LiveStats;
  generate: LiveStats;
}

const CONCURRENCY_LEVELS = [1, 5, 20, 50] as const;
const REQUESTS_PER_LEVEL = 200;

// Mirrors the real, non-exported constants in lib/rate-limit.ts (WINDOW =
// "1 m", MAX_REQUESTS = 10). Kept here as documented configuration for the
// results file and report; lib/rate-limit.ts is not modified and does not
// export them.
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_REQUESTS = 10;

const TEST_TIMEOUT_MS = 30 * 60 * 1000;

const { embedTextsMock, generateContentMock, limitMock, ipAddressMock } = vi.hoisted(() => ({
  embedTextsMock: vi.fn(),
  generateContentMock: vi.fn(),
  limitMock: vi.fn(),
  ipAddressMock: vi.fn(),
}));

// Not inside vi.hoisted: that callback runs before this file's own imports
// are live-bound, so calling readSampleQueryVector() there throws a
// "before initialization" error. A plain top-level statement runs after
// imports resolve and well before the it() body below needs it.
const queryVector = readSampleQueryVector();

vi.mock("@/lib/gemini", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gemini")>("@/lib/gemini");
  return {
    ...actual,
    embedTexts: embedTextsMock,
    getGemini: vi.fn(() => ({ models: { generateContent: generateContentMock } })),
  };
});

vi.mock("@vercel/functions", () => ({ ipAddress: ipAddressMock }));
vi.mock("@upstash/redis", () => ({ Redis: vi.fn() }));
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow() {
      return () => {};
    }
    limit = limitMock;
  },
}));

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function geminiReply(): { text: string } {
  return {
    text: JSON.stringify({
      reply: "FIVE Palm Jumeirah has private pool suites right on the beach.",
      grounded: true,
    }),
  };
}

/** Each virtual user gets a stable, distinct fake IP across the whole run. */
function chatRequest(virtualUser: number): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "x-bench-vu": String(virtualUser) },
    body: JSON.stringify({ messages: [{ role: "user", content: "Tell me about FIVE Palm Jumeirah" }] }),
  });
}

interface LevelResult {
  concurrency: number;
  requests: number;
  errors: number;
  wallMs: number;
  stats: FullStats;
  requestsPerSecond: number;
}

async function runLevel(
  post: (request: Request) => Promise<Response>,
  concurrency: number,
  totalRequests: number,
): Promise<LevelResult> {
  const durations: number[] = [];
  let errors = 0;
  let dispatched = 0;
  const wallStart = performance.now();

  async function worker(virtualUser: number): Promise<void> {
    while (dispatched < totalRequests) {
      dispatched += 1;
      const reqStart = performance.now();
      try {
        const response = await post(chatRequest(virtualUser));
        await response.json();
        if (response.status === 200) {
          durations.push(performance.now() - reqStart);
        } else {
          errors += 1;
        }
      } catch {
        errors += 1;
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, (_, virtualUser) => worker(virtualUser)));

  const wallMs = performance.now() - wallStart;
  return {
    concurrency,
    requests: totalRequests,
    errors,
    wallMs,
    stats: summarizeFull(durations),
    requestsPerSecond: durations.length / (wallMs / 1000),
  };
}

it(
  "tier C: concurrency and throughput benchmark (offline, real store, calibrated stubs)",
  async () => {
    const calibration = readResult<LiveResultShape>(
      "live.json",
      "bench/results/live.json not found. Run `npm run bench:live` first.",
    );

    embedTextsMock.mockImplementation(async () => {
      await delay(calibration.embed.median);
      return [queryVector];
    });
    generateContentMock.mockImplementation(async () => {
      await delay(calibration.generate.median);
      return geminiReply();
    });
    limitMock.mockResolvedValue({ success: true });
    ipAddressMock.mockImplementation((request: Request) => `10.0.0.${request.headers.get("x-bench-vu") ?? "0"}`);

    // Each request emits a JSON line via lib/observability.ts. Thousands of
    // JSON.stringify calls plus stdout writes are real I/O that would skew
    // the numbers this tier measures, so console.log is stubbed for the
    // duration of the run.
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const { POST } = await import("@/app/api/chat/route");

    const levels: LevelResult[] = [];
    for (const concurrency of CONCURRENCY_LEVELS) {
      const level = await runLevel(POST, concurrency, REQUESTS_PER_LEVEL);
      levels.push(level);
    }

    consoleLogSpy.mockRestore();

    const resultPath = writeResult("tier-c.json", {
      tier: "C",
      description:
        "Concurrency and throughput against the real POST /api/chat handler and the real embedding store. Gemini is stubbed to resolve after Tier B's measured median embed and generate latencies; the rate limiter and Redis client are mocked, with a distinct IP per virtual user so the per-IP limiter is not what is measured.",
      measuredAt: new Date().toISOString(),
      touchedGoogleApi: false,
      apiCalls: 0,
      environment: collectEnvironment(),
      corpus: readCorpusInfo(),
      calibration: {
        sourceFile: "bench/results/live.json",
        embedMedianMs: calibration.embed.median,
        generateMedianMs: calibration.generate.median,
      },
      rateLimiter: {
        windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
        maxRequestsPerWindow: RATE_LIMIT_MAX_REQUESTS,
        note:
          "This is a stated policy ceiling from lib/rate-limit.ts, not a measured throughput number. The limiter is mocked to always allow in this tier, and each virtual user gets its own IP, so the per-IP limiter is never the thing under test here.",
      },
      measurementNotes: [
        "console.log was stubbed for the duration of this run to silence the per-request observability logging. Each request emits a JSON line; thousands of JSON.stringify calls plus stdout writes are real I/O that would skew the numbers being measured here.",
        "The Gemini stub resolves after a FIXED delay, so it contributes no variance of its own. The spread between p50 and p99 below therefore describes this application's own jitter under load, not the provider's. Real end to end percentiles against live Gemini would be materially wider, because provider latency varies run to run: the same embedding call measured a 385 ms median in one calibration run and 770 ms in another on the same machine.",
        "Latency here is dominated by the stub. Subtract the calibration total to read the application's own contribution: anything above the combined embed plus generate median is what this codebase added.",
      ],
      config: { concurrencyLevels: CONCURRENCY_LEVELS, requestsPerLevel: REQUESTS_PER_LEVEL },
      levels,
    });

    console.log(`Tier C: wrote ${resultPath}`);
  },
  TEST_TIMEOUT_MS,
);
