/**
 * Unit tests for lib/rate-limit.ts.
 *
 * `@vercel/functions`, `@upstash/redis`, and `@upstash/ratelimit` are all
 * mocked, so no network call and no real Redis are involved. The mocked
 * `Ratelimit.limit()` delegates to `state.limitImpl`, a value the tests
 * reassign per scenario.
 *
 * `getRatelimit()` in the module under test builds its `Ratelimit` instance
 * lazily and caches it at module scope, so any test that needs different
 * limiter behavior resets the module registry and re-imports the module to
 * get a clean instance.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  ipAddressImpl: (_request: Request): string | undefined => undefined,
  limitImpl: async (_key: string): Promise<{ success: boolean }> => ({
    success: true,
  }),
  ratelimitConfig: null as unknown,
}));

vi.mock("@vercel/functions", () => ({
  ipAddress: (request: Request) => state.ipAddressImpl(request),
}));

vi.mock("@upstash/redis", () => ({
  Redis: class {
    constructor(_config: { url?: string; token?: string }) {}
  },
}));

vi.mock("@upstash/ratelimit", () => {
  class Ratelimit {
    static slidingWindow(limit: number, window: string) {
      return { limit, window };
    }
    constructor(config: unknown) {
      state.ratelimitConfig = config;
    }
    limit(key: string) {
      return state.limitImpl(key);
    }
  }
  return { Ratelimit };
});

/** Resets the module registry and re-imports lib/rate-limit.ts fresh. */
async function loadRateLimit() {
  vi.resetModules();
  return import("@/lib/rate-limit");
}

beforeEach(() => {
  state.ipAddressImpl = () => undefined;
  state.limitImpl = async () => ({ success: true });
  state.ratelimitConfig = null;
});

describe("clientIp", () => {
  it("returns exactly what ipAddress() returns", async () => {
    state.ipAddressImpl = () => "203.0.113.7";
    const { clientIp } = await loadRateLimit();

    const request = new Request("https://example.com/api/chat");

    expect(clientIp(request)).toBe("203.0.113.7");
  });

  it('returns "unknown" when ipAddress() returns undefined', async () => {
    state.ipAddressImpl = () => undefined;
    const { clientIp } = await loadRateLimit();

    const request = new Request("https://example.com/api/chat");

    expect(clientIp(request)).toBe("unknown");
  });

  it("does not fall back to a spoofed x-forwarded-for header when ipAddress() returns undefined (regression guard for commit 2cd4de4)", async () => {
    state.ipAddressImpl = () => undefined;
    const { clientIp } = await loadRateLimit();

    const request = new Request("https://example.com/api/chat", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });

    expect(clientIp(request)).toBe("unknown");
  });

  it("ignores a spoofed x-forwarded-for header and uses ipAddress()'s value instead (regression guard for commit 2cd4de4)", async () => {
    state.ipAddressImpl = () => "9.9.9.9";
    const { clientIp } = await loadRateLimit();

    const request = new Request("https://example.com/api/chat", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });

    expect(clientIp(request)).toBe("9.9.9.9");
  });
});

describe("isRateLimited", () => {
  it("returns false when the limiter reports success: true", async () => {
    state.limitImpl = async () => ({ success: true });
    const { isRateLimited } = await loadRateLimit();

    await expect(isRateLimited("chat:1.1.1.1")).resolves.toBe(false);
  });

  it("returns true when the limiter reports success: false", async () => {
    state.limitImpl = async () => ({ success: false });
    const { isRateLimited } = await loadRateLimit();

    await expect(isRateLimited("chat:1.1.1.1")).resolves.toBe(true);
  });

  it("fails open and logs the error when the limiter throws", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const redisError = new Error("Redis outage");
    state.limitImpl = async () => {
      throw redisError;
    };
    const { isRateLimited } = await loadRateLimit();

    await expect(isRateLimited("chat:1.1.1.1")).resolves.toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Rate limit check failed, allowing request:",
      redisError,
    );

    consoleErrorSpy.mockRestore();
  });

  it("does not memoize, batch, dedupe or short-circuit concurrent in-flight calls for the same key: isRateLimited reports one limiter verdict per call", async () => {
    // This test establishes only that isRateLimited calls through to the
    // (mocked) limiter once per invocation, with no memoization, batching,
    // deduplication or short-circuiting of concurrent in-flight calls sharing
    // a key: each of the 15 concurrent callers gets the verdict computed for
    // its own call. It does NOT establish that the real limiter is atomic
    // under concurrency. JavaScript is single-threaded, and this mock's
    // counter increment happens before its only await, so no interleaving
    // between callers is possible here regardless of what isRateLimited
    // does; the counter, the increment and the cutoff all live in this
    // test's own mock, not in the code under test. Real sliding-window
    // atomicity lives in Upstash's Lua script running inside Redis, which
    // this unit test mocks away entirely and therefore cannot exercise.
    let counter = 0;
    state.limitImpl = async () => {
      counter += 1;
      const success = counter <= 10;
      await Promise.resolve();
      return { success };
    };
    const { isRateLimited } = await loadRateLimit();

    const results = await Promise.all(
      Array.from({ length: 15 }, () => isRateLimited("chat:concurrent")),
    );

    const allowedCount = results.filter((limited) => limited === false).length;
    const limitedCount = results.filter((limited) => limited === true).length;

    expect(allowedCount).toBe(10);
    expect(limitedCount).toBe(5);
    expect(counter).toBe(15);
  });

  it("gives distinct keys independent budgets: 10 calls on one key do not limit another key", async () => {
    const counters: Record<string, number> = {};
    state.limitImpl = async (key: string) => {
      counters[key] = (counters[key] ?? 0) + 1;
      return { success: counters[key] <= 10 };
    };
    const { isRateLimited } = await loadRateLimit();

    const firstKeyResults: boolean[] = [];
    for (let i = 0; i < 10; i += 1) {
      firstKeyResults.push(await isRateLimited("chat:1.1.1.1"));
    }
    const secondKeyResult = await isRateLimited("chat:2.2.2.2");

    expect(firstKeyResults).toEqual(new Array(10).fill(false));
    expect(secondKeyResult).toBe(false);
  });
});

describe("getRatelimit configuration", () => {
  it("builds the limiter via Ratelimit.slidingWindow with exactly 10 requests and window \"1 m\", prefix \"ratelimit\", analytics false, and an ephemeralCache", async () => {
    const { isRateLimited } = await loadRateLimit();

    // getRatelimit() builds lazily on first use, so the constructor only
    // runs once isRateLimited() is called.
    await isRateLimited("chat:1.1.1.1");

    const config = state.ratelimitConfig as {
      limiter: { limit: number; window: string };
      prefix: string;
      analytics: boolean;
      ephemeralCache: unknown;
    };

    expect(config.limiter).toEqual({ limit: 10, window: "1 m" });
    expect(config.prefix).toBe("ratelimit");
    expect(config.analytics).toBe(false);
    expect(config.ephemeralCache).toBeInstanceOf(Map);
  });
});

describe("rateLimitedResponse", () => {
  it("returns a 429 with a Retry-After: 60 header", async () => {
    const { rateLimitedResponse } = await loadRateLimit();

    const response = rateLimitedResponse();

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
  });

  it("returns a JSON body with the exact rate-limited copy", async () => {
    const { rateLimitedResponse } = await loadRateLimit();

    const response = rateLimitedResponse();
    const body = await response.json();

    expect(body.error).toBe(
      "You're moving faster than the desk can keep up. Give it a moment and try again.",
    );
  });
});
