import { beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureFsMock, ORTHOGONAL_QUERY_VECTOR, QUERY_VECTOR } from "../fixtures/embeddings";

/**
 * Integration tests for POST /api/chat.
 *
 * The Gemini layer (embedTexts, getGemini) and the Redis-backed rate limiter
 * are mocked, but lib/retrieval.ts runs for real over the fixture store, so
 * the grounded and refusal paths are decided by actual cosine similarity math
 * rather than a stubbed retrieve(). Switching between QUERY_VECTOR and
 * ORTHOGONAL_QUERY_VECTOR as the mocked embedding output is what flips
 * between "chunks retrieved" and "nothing retrieved".
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

const NO_INFO_REPLY =
  "That's not something I have reliable information on, I'm afraid, and I'd rather not guess. For the definitive answer, check fivehotelsandresorts.com or reach out to the property team directly; they'll take care of you.";

function chatRequest(body: unknown): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function geminiReply(reply: string, grounded: boolean) {
  return { text: JSON.stringify({ reply, grounded }) };
}

beforeEach(() => {
  embedTextsMock.mockReset();
  generateContentMock.mockReset();
  limitMock.mockReset();
  embedTextsMock.mockImplementation(async () => [QUERY_VECTOR]);
  limitMock.mockResolvedValue({ success: true });
});

describe("POST /api/chat", () => {
  it("returns the model's answer and sources on the grounded path", async () => {
    generateContentMock.mockResolvedValue(
      geminiReply("FIVE Palm Jumeirah has private pool suites right on the beach.", true),
    );
    const { POST } = await import("@/app/api/chat/route");

    const response = await POST(
      chatRequest({ messages: [{ role: "user", content: "Tell me about FIVE Palm Jumeirah" }] }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.reply).toBe("FIVE Palm Jumeirah has private pool suites right on the beach.");
    expect(body.sources).toEqual([
      { title: "FIVE Palm Jumeirah", url: "https://fivehotelsandresorts.com/five-palm-jumeirah" },
      { title: "The Spa at FIVE", url: "https://fivehotelsandresorts.com/spa" },
      { title: "Beach and Pool Clubs", url: "https://fivehotelsandresorts.com/pool-clubs" },
      { title: "Dining at FIVE", url: "https://fivehotelsandresorts.com/dining" },
      { title: "Nightlife at FIVE", url: "https://fivehotelsandresorts.com/nightlife" },
    ]);
    expect(limitMock).toHaveBeenCalledWith("chat:1.2.3.4");
  });

  it("declines with the no-info reply and empty sources when nothing is retrieved, without calling Gemini", async () => {
    embedTextsMock.mockImplementation(async () => [ORTHOGONAL_QUERY_VECTOR]);
    const { POST } = await import("@/app/api/chat/route");

    const response = await POST(
      chatRequest({ messages: [{ role: "user", content: "What's the weather like on Mars?" }] }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.reply).toBe(NO_INFO_REPLY);
    expect(body.sources).toEqual([]);
    expect(generateContentMock).not.toHaveBeenCalled();
  });

  it("returns the model's decline and empty sources when the model declines to ground, even though chunks were retrieved", async () => {
    generateContentMock.mockResolvedValue(
      geminiReply("I can't quote prices, please check fivehotelsandresorts.com.", false),
    );
    const { POST } = await import("@/app/api/chat/route");

    const response = await POST(
      chatRequest({ messages: [{ role: "user", content: "How much is a night at FIVE Palm Jumeirah?" }] }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.reply).toBe("I can't quote prices, please check fivehotelsandresorts.com.");
    expect(body.sources).toEqual([]);
    expect(generateContentMock).toHaveBeenCalledTimes(1);
  });

  it("folds the previous user turn into the retrieval query when the final message is under 80 characters", async () => {
    generateContentMock.mockResolvedValue(geminiReply("FIVE Zurich blends alpine calm with our nightlife.", true));
    const { POST } = await import("@/app/api/chat/route");

    const response = await POST(
      chatRequest({
        messages: [
          { role: "user", content: "Tell me about the pool club scene" },
          { role: "assistant", content: "The pool club runs day to night sessions with resident DJs." },
          { role: "user", content: "What about Zurich?" },
        ],
      }),
    );

    expect(response.status).toBe(200);
    expect(embedTextsMock).toHaveBeenCalledWith(
      ["Tell me about the pool club scene\nWhat about Zurich?"],
      "RETRIEVAL_QUERY",
    );
  });

  it("returns 400 when messages is not an array", async () => {
    const { POST } = await import("@/app/api/chat/route");

    const response = await POST(chatRequest({ messages: "not an array" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid request.");
  });

  it("returns 400 when messages is an empty array", async () => {
    const { POST } = await import("@/app/api/chat/route");

    const response = await POST(chatRequest({ messages: [] }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid request.");
  });

  it("returns 400 when the final message's role is not user", async () => {
    const { POST } = await import("@/app/api/chat/route");

    const response = await POST(
      chatRequest({
        messages: [
          { role: "user", content: "Hi there" },
          { role: "assistant", content: "Hello, how can I help?" },
        ],
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid request.");
  });

  it("returns 429 when the rate limiter reports the caller is limited, without calling Gemini", async () => {
    limitMock.mockResolvedValue({ success: false });
    const { POST } = await import("@/app/api/chat/route");

    const response = await POST(
      chatRequest({ messages: [{ role: "user", content: "Tell me about FIVE Palm Jumeirah" }] }),
    );

    expect(response.status).toBe(429);
    expect(generateContentMock).not.toHaveBeenCalled();
  });

  it("returns 500 when the model call rejects", async () => {
    generateContentMock.mockRejectedValue(new Error("boom"));
    const { POST } = await import("@/app/api/chat/route");

    const response = await POST(
      chatRequest({ messages: [{ role: "user", content: "Tell me about FIVE Palm Jumeirah" }] }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Something went wrong at the desk. Please try that once more.");
  });
});
