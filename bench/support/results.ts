/**
 * Reads and writes bench/results/*.json.
 *
 * Plain relative imports only, no `@/` alias: used from both Vitest bench
 * files and plain tsx scripts.
 */
import fs from "node:fs";
import path from "node:path";

function resultsDir(): string {
  return path.join(process.cwd(), "bench", "results");
}

/** Writes `data` as pretty-printed JSON under bench/results/<filename>. */
export function writeResult(filename: string, data: unknown): string {
  const dir = resultsDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, filename);
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
  return file;
}

/**
 * Reads bench/results/<filename>. Throws `missingMessage` verbatim if the
 * file is absent, so a missing calibration file fails with a clear
 * instruction instead of a benchmark silently inventing a latency.
 */
export function readResult<T>(filename: string, missingMessage?: string): T {
  const file = path.join(resultsDir(), filename);
  if (!fs.existsSync(file)) {
    throw new Error(missingMessage ?? `bench/results/${filename} not found.`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}
