/**
 * Statistics helpers shared by every bench tier.
 *
 * Plain relative imports only, no `@/` alias: this file is used both from
 * Vitest bench files (Tier A, Tier C) and from plain tsx scripts (Tier B,
 * the report generator), and only the Vitest side has alias resolution
 * configured.
 */

/** Full statistical summary used by Tier A and Tier C, both high volume. */
export interface FullStats {
  n: number;
  min: number;
  max: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
}

/**
 * Summary used by Tier B only. Deliberately no percentile fields: at n = 20
 * a p95 is just the second-slowest sample and a p99 is the maximum wearing a
 * costume, so this tier reports min, max, median and mean and nothing else.
 */
export interface LiveStats {
  n: number;
  min: number;
  max: number;
  mean: number;
  median: number;
}

function sortAsc(values: number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

/** Linear-interpolation percentile over an already-sorted-ascending array. */
export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) throw new Error("percentile of an empty sample");
  if (sortedAsc.length === 1) return sortedAsc[0];
  const rank = (p / 100) * (sortedAsc.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sortedAsc[lower];
  const weight = rank - lower;
  return sortedAsc[lower] * (1 - weight) + sortedAsc[upper] * weight;
}

export function mean(values: number[]): number {
  if (values.length === 0) throw new Error("mean of an empty sample");
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** For Tier A and Tier C: p50, p95, p99, min, max, mean. */
export function summarizeFull(values: number[]): FullStats {
  const sorted = sortAsc(values);
  return {
    n: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: mean(sorted),
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

/** For Tier B only: min, max, median, mean. No percentile vocabulary. */
export function summarizeLive(values: number[]): LiveStats {
  const sorted = sortAsc(values);
  return {
    n: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: mean(sorted),
    median: percentile(sorted, 50),
  };
}
