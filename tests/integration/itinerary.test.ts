import { beforeEach, describe, expect, it, vi } from "vitest";
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

beforeEach(() => {
  embedTextsMock.mockReset();
  generateContentMock.mockReset();
  limitMock.mockReset();
  embedTextsMock.mockImplementation(async () => [QUERY_VECTOR]);
  limitMock.mockResolvedValue({ success: true });
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
  });

  it("returns 429 when the rate limiter reports the caller is limited, without calling Gemini", async () => {
    limitMock.mockResolvedValue({ success: false });
    const { POST } = await import("@/app/api/itinerary/route");

    const response = await POST(itineraryRequest(VALID_PREFS));

    expect(response.status).toBe(429);
    expect(generateContentMock).not.toHaveBeenCalled();
  });
});
