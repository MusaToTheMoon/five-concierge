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
    constructor(_config: unknown) {}
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

  it("resolves exactly 10 of 15 concurrent calls as allowed and 5 as limited, with the shared counter ending at 15", async () => {
    let counter = 0;
    state.limitImpl = async () => {
      // The increment and the allow/deny decision happen before the only
      // await in this function, so every concurrent caller that reaches this
      // line reads and updates the counter with no other caller interleaved
      // in between. If two callers could both read a stale count, this test
      // would see fewer than 5 limited or a final counter below 15.
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

describe("rateLimitedResponse", () => {
  it("returns a 429 with a Retry-After: 60 header", async () => {
    const { rateLimitedResponse } = await loadRateLimit();

    const response = rateLimitedResponse();

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
  });

  it("returns a JSON body with an error message", async () => {
    const { rateLimitedResponse } = await loadRateLimit();

    const response = rateLimitedResponse();
    const body = await response.json();

    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
  });
});
