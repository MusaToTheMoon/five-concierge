/**
 * Tier B: live calibration, n = 20, the only tier that calls Google.
 *
 * Real embedTexts calls and real generateContent calls, run sequentially
 * with a pause between calls (free-tier Flash is roughly 10 requests per
 * minute; a parallel burst would just collect provider 429s and poison the
 * numbers). A failed call is recorded as a provider error and excluded from
 * the latency statistics; the run keeps going.
 *
 * This is the only tier that spends Google API quota. Run once, not on
 * every bench pass: npm run bench:live
 *
 * Sample size: env BENCH_SAMPLES, default 20.
 * Pause between calls: env BENCH_PAUSE_MS, default 1000.
 */
import fs from "node:fs";
import path from "node:path";
import { Type } from "@google/genai";
import { CHAT_MODEL, EMBEDDING_MODEL, embedTexts, getGemini } from "../lib/gemini";
import { collectEnvironment } from "./support/environment";
import { classifyFailure, type FailureCategory } from "./support/failures";
import { summarizeLive } from "./support/stats";
import { writeResult } from "./support/results";

const SAMPLES = Number(process.env.BENCH_SAMPLES) || 20;

/**
 * Free-tier gemini-2.5-flash allows roughly 10 generation requests per minute.
 * A 1000 ms pause attempts 60 per minute, and a real run at that setting lost
 * 13 of 20 generation calls to RESOURCE_EXHAUSTED while every embedding call
 * survived, since embedding carries a separate and higher quota. 6500 ms keeps
 * the generation stage just under the ceiling.
 */
const PAUSE_MS = Number(process.env.BENCH_PAUSE_MS) || 6500;

const SAMPLE_QUERY = "What can you tell me about the pool clubs and dining at FIVE Palm Jumeirah?";

/** A small, representative CONTEXT block, similar in shape to what retrieve() would hand the model. */
const SAMPLE_CONTEXT = `[1] "FIVE Palm Jumeirah" (https://fivehotelsandresorts.com/five-palm-jumeirah)
FIVE Palm Jumeirah sits on its own stretch of beach with private pool suites, resident DJs at the pool club, and a Japanese robatayaki restaurant.`;

/** Loads .env.local so the script works outside Next.js without extra deps. */
function loadEnvLocal(): void {
  if (process.env.GEMINI_API_KEY) return;
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function timeCall<T>(fn: () => Promise<T>): Promise<number> {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

interface SampleRun {
  raw: number[];
  failures: FailureCategory[];
}

async function runEmbedSamples(): Promise<SampleRun> {
  const raw: number[] = [];
  const failures: FailureCategory[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    try {
      raw.push(await timeCall(() => embedTexts([SAMPLE_QUERY], "RETRIEVAL_QUERY")));
    } catch (error) {
      // Classified immediately and the message dropped: it can carry a
      // request URL or a credential, and this result file is committed.
      failures.push(classifyFailure(error));
    }
    if (i < SAMPLES - 1) await sleep(PAUSE_MS);
  }
  return { raw, failures };
}

async function runGenerateSamples(): Promise<SampleRun> {
  const raw: number[] = [];
  const failures: FailureCategory[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    try {
      raw.push(
        await timeCall(() =>
          getGemini().models.generateContent({
            model: CHAT_MODEL,
            contents: [
              {
                role: "user",
                parts: [{ text: `CONTEXT:\n${SAMPLE_CONTEXT}\n\nGUEST QUESTION: ${SAMPLE_QUERY}` }],
              },
            ],
            config: {
              temperature: 0.6,
              thinkingConfig: { thinkingBudget: 0 },
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  reply: { type: Type.STRING },
                  grounded: { type: Type.BOOLEAN },
                },
                required: ["reply", "grounded"],
                propertyOrdering: ["reply", "grounded"],
              },
            },
          }),
        ),
      );
    } catch (error) {
      // Classified immediately and the message dropped: it can carry a
      // request URL or a credential, and this result file is committed.
      failures.push(classifyFailure(error));
    }
    if (i < SAMPLES - 1) await sleep(PAUSE_MS);
  }
  return { raw, failures };
}

async function main(): Promise<void> {
  loadEnvLocal();

  console.log(`Tier B: ${SAMPLES} embed calls, then ${SAMPLES} generate calls, ${PAUSE_MS} ms pause between calls.`);

  console.log("Running embedding calls...");
  const embedRun = await runEmbedSamples();
  console.log(`  ${embedRun.raw.length} succeeded, ${embedRun.failures.length} failed.`);

  console.log("Running generation calls...");
  const generateRun = await runGenerateSamples();
  console.log(`  ${generateRun.raw.length} succeeded, ${generateRun.failures.length} failed.`);

  if (embedRun.raw.length === 0) {
    throw new Error("Every embedding call failed. No latency data to calibrate Tier C with.");
  }
  if (generateRun.raw.length === 0) {
    throw new Error("Every generation call failed. No latency data to calibrate Tier C with.");
  }

  const resultPath = writeResult("live.json", {
    tier: "B",
    description:
      "Live calibration against the real Gemini API: real embedContent and real generateContent calls, run sequentially with a pause between calls so a burst does not just collect provider 429s. This is the only tier that spends Google API quota, and it is the calibration source for Tier C.",
    measuredAt: new Date().toISOString(),
    touchedGoogleApi: true,
    config: { samples: SAMPLES, pauseMs: PAUSE_MS, chatModel: CHAT_MODEL, embeddingModel: EMBEDDING_MODEL },
    environment: collectEnvironment(),
    apiCalls: {
      embedAttempted: SAMPLES,
      generateAttempted: SAMPLES,
      total: SAMPLES * 2,
      failed: embedRun.failures.length + generateRun.failures.length,
    },
    embed: { ...summarizeLive(embedRun.raw), raw: embedRun.raw },
    generate: { ...summarizeLive(generateRun.raw), raw: generateRun.raw },
    failures: { embed: embedRun.failures, generate: generateRun.failures },
  });

  console.log(`Wrote ${resultPath}`);
}

main().catch((error) => {
  console.error("Tier B failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
