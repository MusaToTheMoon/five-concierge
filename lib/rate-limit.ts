import { NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Sliding-window rate limiter backed by Upstash Redis.
 *
 * The counter lives in Redis, not in the function instance, so the limit
 * holds no matter which instance serves a request. An earlier in-memory Map
 * did not: Fluid Compute spreads requests across many instances, so each one
 * saw its own count and the real limit was multiplied by the instance count.
 *
 * The limit-and-check runs as an atomic Lua script inside Redis, so
 * concurrent requests cannot both slip under the threshold.
 */

const WINDOW = "1 m";
const MAX_REQUESTS = 10;

/**
 * Skip the Redis round trip for identifiers already blocked in this window.
 * Shared across requests because the Ratelimit instance is a module-level
 * singleton that Fluid Compute keeps warm. Raising the limit will not unblock
 * a cached identifier until its window rolls over.
 */
const ephemeralCache = new Map<string, number>();

let ratelimit: Ratelimit | null = null;

/**
 * Built lazily so `next build` does not construct the Redis client at module
 * load: it throws when the connection env vars are absent, which would crash
 * the build. On Vercel the vars are injected, so the first request wins.
 *
 * The Vercel Upstash integration exposes the REST endpoint as KV_REST_API_*
 * (the legacy @vercel/kv names), not UPSTASH_REDIS_REST_*, so we cannot use
 * Redis.fromEnv() and pass them explicitly instead.
 */
function getRatelimit(): Ratelimit {
  if (!ratelimit) {
    ratelimit = new Ratelimit({
      redis: new Redis({
        url: process.env.KV_REST_API_URL!,
        token: process.env.KV_REST_API_TOKEN!,
      }),
      limiter: Ratelimit.slidingWindow(MAX_REQUESTS, WINDOW),
      ephemeralCache,
      prefix: "ratelimit",
      analytics: false,
    });
  }
  return ratelimit;
}

/** First hop of x-forwarded-for; Vercel sets it to the real client IP. */
export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/** Records a hit for `key` and reports whether it is over the limit. */
export async function isRateLimited(key: string): Promise<boolean> {
  try {
    const { success } = await getRatelimit().limit(key);
    return !success;
  } catch (error) {
    // Fail open: a Redis outage should not take down the endpoint. Briefly
    // allowing unthrottled traffic is better than rejecting every request.
    console.error("Rate limit check failed, allowing request:", error);
    return false;
  }
}

export function rateLimitedResponse(): NextResponse {
  return NextResponse.json(
    {
      error:
        "You're moving faster than the desk can keep up. Give it a moment and try again.",
    },
    { status: 429, headers: { "Retry-After": "60" } },
  );
}
