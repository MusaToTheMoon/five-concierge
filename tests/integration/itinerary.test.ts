import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureFsMock, ORTHOGONAL_QUERY_VECTOR, QUERY_VECTOR } from "../fixtures/embeddings";

/**
 * Integration tests for POST /api/itinerary.
 *
 * Same mocking shape as tests/integration/chat.test.ts: Gemini and the
 * Redis-backed rate limiter are mocked, lib/retrieval.ts runs for real over
 * the fixture store. embedTexts always returns the same vector regardless of
 * which interest query it was called with, so every gatherContext() query
 * hits the identical fixture ranking, which makes the resulting chunk order
 * (and therefore each stop's source_index resolution) predictable.
 */

const { embedTextsMock, generateContentMock, limitMock } = vi.hoisted(() => ({
  embedTextsMock: vi.fn(),
  generateContentMock: vi.fn(),
  limitMock: vi.fn(),
}));

vi.mock("node:fs", () => fixtureFsMock());

vi.mock("@/lib/gemini", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gemini")>("@/lib/gemini");
  return {
    ...actual,
    embedTexts: embedTextsMock,
    getGemini: vi.fn(() => ({ models: { generateContent: generateContentMock } })),
  };
});

vi.mock("@vercel/functions", () => ({ ipAddress: vi.fn(() => "1.2.3.4") }));
vi.mock("@upstash/redis", () => ({ Redis: vi.fn() }));
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow() {
      return () => {};
    }
    limit = limitMock;
  },
}));

const VALID_PREFS = {
  vibe: "romantic",
  destination: "Ibiza",
  group: "couple",
  interests: ["pool", "dining"],
};

function itineraryRequest(body: unknown): Request {
  return new Request("http://localhost/api/itinerary", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function geminiItinerary(payload: unknown) {
  return { text: JSON.stringify(payload) };
}

let consoleLogSpy: ReturnType<typeof vi.spyOn>;

/** Parses the single request_complete line logged for the request. */
function loggedRequest(): Record<string, unknown> {
  const lines = consoleLogSpy.mock.calls
    .map((call) => call[0] as string)
    .filter((line) => typeof line === "string");
  expect(lines).toHaveLength(1);
  return JSON.parse(lines[0]);
}

beforeEach(() => {
  embedTextsMock.mockReset();
  generateContentMock.mockReset();
  limitMock.mockReset();
  embedTextsMock.mockImplementation(async () => [QUERY_VECTOR]);
  limitMock.mockResolvedValue({ success: true });
  consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  consoleLogSpy.mockRestore();
});

describe("POST /api/itinerary", () => {
  it("returns 200 with title, subtitle, stops, and each stop's source resolved from source_index", async () => {
    generateContentMock.mockResolvedValue(
      geminiItinerary({
        title: "Sunset to Sunrise",
        subtitle: "An evening across the island",
        stops: [
          {
            time: "7:30 PM",
            venue: "The Pool Club",
            property: "FIVE Palm Jumeirah",
            blurb: "Golden hour settles over the water.",
            category: "pool",
            source_index: 1,
          },
          {
            time: "9:00 PM",
            venue: "Robatayaki Table",
            property: "FIVE Palm Jumeirah",
            blurb: "Smoke and citrus fill the room.",
            category: "dining",
            source_index: 4,
          },
        ],
      }),
    );
    const { POST } = await import("@/app/api/itinerary/route");

    const response = await POST(itineraryRequest(VALID_PREFS));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.itinerary.title).toBe("Sunset to Sunrise");
    expect(body.itinerary.subtitle).toBe("An evening across the island");
    expect(body.itinerary.stops).toHaveLength(2);
    expect(body.itinerary.stops[0].source).toEqual({
      title: "FIVE Palm Jumeirah",
      url: "https://fivehotelsandresorts.com/five-palm-jumeirah",
    });
    expect(body.itinerary.stops[1].source).toEqual({
      title: "Dining at FIVE",
      url: "https://fivehotelsandresorts.com/dining",
    });
    expect(limitMock).toHaveBeenCalledWith("itinerary:1.2.3.4");
    expect(response.headers.get("x-request-id")).toEqual(expect.any(String));

    // gatherContext runs one retrieve() per interest and merges by chunk id, so
    // the logged count is the deduped merged list, not the sum of both calls.
    const line = loggedRequest();
    expect(line.outcome).toBe("ok");
    expect(line.status).toBe(200);
    expect(line.level).toBe("info");
    expect(line.chunks).toBe(5);
    expect(typeof line.retrievalMs).toBe("number");
    expect(typeof line.generationMs).toBe("number");
  });

  it("resolves an out-of-range source_index to source: null instead of throwing", async () => {
    generateContentMock.mockResolvedValue(
      geminiItinerary({
        title: "Sunset to Sunrise",
        subtitle: "An evening across the island",
        stops: [
          {
            time: "7:30 PM",
            venue: "The Pool Club",
            property: "FIVE Palm Jumeirah",
            blurb: "Golden hour settles over the water.",
            category: "pool",
            source_index: 42,
          },
        ],
      }),
    );
    const { POST } = await import("@/app/api/itinerary/route");

    const response = await POST(itineraryRequest(VALID_PREFS));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.itinerary.stops[0].source).toBeNull();
  });

  it("returns 400 for an invalid vibe", async () => {
    const { POST } = await import("@/app/api/itinerary/route");

    const response = await POST(itineraryRequest({ ...VALID_PREFS, vibe: "unhinged" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid preferences.");
    expect(response.headers.get("x-request-id")).toEqual(expect.any(String));

    const line = loggedRequest();
    expect(line.outcome).toBe("bad_request");
    expect(line.status).toBe(400);
    expect(line).not.toHaveProperty("retrievalMs");
    expect(line).not.toHaveProperty("generationMs");
    expect(line).not.toHaveProperty("chunks");
  });

  it("returns 400 for an invalid destination", async () => {
    const { POST } = await import("@/app/api/itinerary/route");

    const response = await POST(itineraryRequest({ ...VALID_PREFS, destination: "Paris" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid preferences.");
  });

  it("returns 400 for an invalid group", async () => {
    const { POST } = await import("@/app/api/itinerary/route");

    const response = await POST(itineraryRequest({ ...VALID_PREFS, group: "family reunion" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid preferences.");
  });

  it("returns 400 for empty interests", async () => {
    const { POST } = await import("@/app/api/itinerary/route");

    const response = await POST(itineraryRequest({ ...VALID_PREFS, interests: [] }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid preferences.");
  });

  it("returns 422 when retrieval yields no chunks", async () => {
    embedTextsMock.mockImplementation(async () => [ORTHOGONAL_QUERY_VECTOR]);
    const { POST } = await import("@/app/api/itinerary/route");

    const response = await POST(itineraryRequest(VALID_PREFS));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toBe(
      "I couldn't find grounded venues for that combination. Try different preferences.",
    );
    expect(generateContentMock).not.toHaveBeenCalled();

    const line = loggedRequest();
    expect(line.outcome).toBe("no_context");
    expect(line.status).toBe(422);
    expect(line.chunks).toBe(0);
    expect(typeof line.retrievalMs).toBe("number");
    expect(line).not.toHaveProperty("generationMs");
  });

  it("returns 429 when the rate limiter reports the caller is limited, without calling Gemini", async () => {
    limitMock.mockResolvedValue({ success: false });
    const { POST } = await import("@/app/api/itinerary/route");

    const response = await POST(itineraryRequest(VALID_PREFS));

    expect(response.status).toBe(429);
    expect(generateContentMock).not.toHaveBeenCalled();
    expect(response.headers.get("x-request-id")).toEqual(expect.any(String));

    const line = loggedRequest();
    expect(line.outcome).toBe("rate_limited");
    expect(line.status).toBe(429);
    expect(line).not.toHaveProperty("retrievalMs");
    expect(line).not.toHaveProperty("generationMs");
    expect(line).not.toHaveProperty("chunks");
  });

  it("returns 500 and logs an error outcome when the model call rejects", async () => {
    generateContentMock.mockRejectedValue(new Error("boom"));
    const { POST } = await import("@/app/api/itinerary/route");

    const response = await POST(itineraryRequest(VALID_PREFS));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Something went wrong at the desk. Please try that once more.");

    const line = loggedRequest();
    expect(line.outcome).toBe("error");
    expect(line.status).toBe(500);
    expect(line.level).toBe("error");
    expect(line.errorKind).toBe("unknown");
    expect(line.chunks).toBe(5);
    expect(typeof line.retrievalMs).toBe("number");
    expect(line).not.toHaveProperty("generationMs");
  });

  it("never logs guest-supplied preference-derived venue or blurb text", async () => {
    const distinctiveBlurb = "zzITINERARYSECRETzz golden hour on the terrace";
    generateContentMock.mockResolvedValue(
      geminiItinerary({
        title: "Sunset to Sunrise",
        subtitle: "An evening across the island",
        stops: [
          {
            time: "7:30 PM",
            venue: "The Pool Club",
            property: "FIVE Palm Jumeirah",
            blurb: distinctiveBlurb,
            category: "pool",
            source_index: 1,
          },
        ],
      }),
    );
    const { POST } = await import("@/app/api/itinerary/route");

    await POST(itineraryRequest(VALID_PREFS));

    const loggedText = consoleLogSpy.mock.calls.map((call) => call[0]).join("\n");
    expect(loggedText).not.toContain(distinctiveBlurb);
    expect(loggedText).not.toContain("zzITINERARYSECRETzz");
  });
});
