import { NextResponse } from "next/server";

/**
 * Sliding-window rate limiter, in memory, keyed per client and route.
 *
 * State lives in the function instance, which Fluid Compute reuses across
 * requests, so this holds up well for a single-region deployment. It is
 * best-effort across multiple instances; if traffic ever justifies it,
 * swap the Map for a shared store (e.g. Upstash Redis) behind the same API.
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;

/** Keep the map bounded; prune dead windows once it grows past this. */
const PRUNE_THRESHOLD = 1_000;

const hits = new Map<string, number[]>();

function prune(now: number) {
  for (const [key, timestamps] of hits) {
    if (timestamps[timestamps.length - 1] < now - WINDOW_MS) hits.delete(key);
  }
}

/** First hop of x-forwarded-for; Vercel sets it to the real client IP. */
export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/**
 * Records a hit for `key` and reports whether it is over the limit.
 * Over-limit requests are not recorded, so a client that backs off
 * recovers as soon as its window drains.
 */
export function isRateLimited(key: string): boolean {
  const now = Date.now();
  if (hits.size > PRUNE_THRESHOLD) prune(now);

  const windowStart = now - WINDOW_MS;
  const recent = (hits.get(key) ?? []).filter((t) => t > windowStart);
  if (recent.length >= MAX_REQUESTS) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  return false;
}

export function rateLimitedResponse(): NextResponse {
  return NextResponse.json(
    {
      error:
        "You're moving faster than the desk can keep up. Give it a moment and try again.",
    },
    { status: 429, headers: { "Retry-After": String(WINDOW_MS / 1000) } },
  );
}
