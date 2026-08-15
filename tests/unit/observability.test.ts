import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logRequest, newRequestId, withRequestId } from "@/lib/observability";

describe("lib/observability", () => {
  describe("newRequestId", () => {
    it("returns a different value on every call", () => {
      const ids = new Set(Array.from({ length: 20 }, () => newRequestId()));
      expect(ids.size).toBe(20);
    });
  });

  describe("logRequest", () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    function loggedLine(): Record<string, unknown> {
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      return JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
    }

    it("emits exactly one JSON line via console.log", () => {
      logRequest({
        requestId: "req-1",
        route: "chat",
        outcome: "ok",
        status: 200,
        durationMs: 10,
      });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(typeof consoleLogSpy.mock.calls[0][0]).toBe("string");
      expect(() => JSON.parse(consoleLogSpy.mock.calls[0][0] as string)).not.toThrow();
    });

    it("emits keys in the documented order when every optional field is present", () => {
      logRequest({
        requestId: "req-1",
        route: "chat",
        outcome: "ok",
        status: 200,
        durationMs: 12.4,
        retrievalMs: 3.2,
        generationMs: 8.9,
        chunks: 5,
      });

      expect(Object.keys(loggedLine())).toEqual([
        "level",
        "event",
        "requestId",
        "route",
        "outcome",
        "status",
        "durationMs",
        "retrievalMs",
        "generationMs",
        "chunks",
      ]);
    });

    it("places errorKind last when present", () => {
      logRequest({
        requestId: "req-1",
        route: "chat",
        outcome: "error",
        status: 500,
        durationMs: 1,
        errorKind: "unknown",
      });

      expect(Object.keys(loggedLine())).toEqual([
        "level",
        "event",
        "requestId",
        "route",
        "outcome",
        "status",
        "durationMs",
        "errorKind",
      ]);
    });

    it("carries the requestId, route, outcome and status through unchanged", () => {
      logRequest({
        requestId: "req-abc",
        route: "itinerary",
        outcome: "no_context",
        status: 422,
        durationMs: 5,
      });

      const line = loggedLine();
      expect(line.event).toBe("request_complete");
      expect(line.requestId).toBe("req-abc");
      expect(line.route).toBe("itinerary");
      expect(line.outcome).toBe("no_context");
      expect(line.status).toBe(422);
    });

    it("rounds every millisecond field with Math.round", () => {
      logRequest({
        requestId: "req-1",
        route: "chat",
        outcome: "ok",
        status: 200,
        durationMs: 12.6,
        retrievalMs: 3.4,
        generationMs: 8.5,
        chunks: 2,
      });

      const line = loggedLine();
      expect(line.durationMs).toBe(13);
      expect(line.retrievalMs).toBe(3);
      expect(line.generationMs).toBe(9);
      expect(Number.isInteger(line.durationMs)).toBe(true);
      expect(Number.isInteger(line.retrievalMs)).toBe(true);
      expect(Number.isInteger(line.generationMs)).toBe(true);
    });

    it("sets level to error only when outcome is error", () => {
      logRequest({ requestId: "a", route: "chat", outcome: "error", status: 500, durationMs: 1 });
      expect(loggedLine().level).toBe("error");

      consoleLogSpy.mockClear();

      logRequest({ requestId: "b", route: "chat", outcome: "ok", status: 200, durationMs: 1 });
      expect(loggedLine().level).toBe("info");

      consoleLogSpy.mockClear();

      logRequest({ requestId: "c", route: "chat", outcome: "rate_limited", status: 429, durationMs: 1 });
      expect(loggedLine().level).toBe("info");
    });

    it("omits retrievalMs, generationMs, chunks and errorKind entirely when not supplied", () => {
      logRequest({
        requestId: "req-2",
        route: "itinerary",
        outcome: "rate_limited",
        status: 429,
        durationMs: 4,
      });

      const line = loggedLine();
      expect(line).not.toHaveProperty("retrievalMs");
      expect(line).not.toHaveProperty("generationMs");
      expect(line).not.toHaveProperty("chunks");
      expect(line).not.toHaveProperty("errorKind");
    });
  });

  describe("withRequestId", () => {
    it("sets the x-request-id header and returns the same response instance", () => {
      const response = new Response("body");

      const result = withRequestId(response, "req-123");

      expect(result).toBe(response);
      expect(result.headers.get("x-request-id")).toBe("req-123");
    });
  });
});
