/**
 * Structured request logging and latency instrumentation for the API layer.
 *
 * Plain JSON lines to console.log, no vendor SDK: Vercel's log drains already
 * parse this. Never pass guest-supplied text into logRequest; only counts,
 * durations and the fixed enums below are allowed through.
 */

/** How a request finished. */
export type RequestOutcome = "ok" | "no_context" | "bad_request" | "rate_limited" | "error";

/** Coarse category for a provider failure, used only in the catch-block log line. */
export type ErrorKind = "provider_rate_limit" | "misconfigured" | "unknown";

/** Fields a route supplies to logRequest for the one request_complete line it emits. */
export interface RequestLogFields {
  requestId: string;
  route: "chat" | "itinerary";
  outcome: RequestOutcome;
  status: number;
  durationMs: number;
  retrievalMs?: number;
  generationMs?: number;
  chunks?: number;
  errorKind?: ErrorKind;
}

/** Per-request identifier for correlating a log line with its response header. */
export function newRequestId(): string {
  return crypto.randomUUID();
}

/**
 * Emits exactly one request_complete JSON line. Key order matches the
 * documented shape, and optional fields are left out entirely rather than
 * emitted as null or undefined.
 */
export function logRequest(fields: RequestLogFields): void {
  const line: Record<string, unknown> = {
    level: fields.outcome === "error" ? "error" : "info",
    event: "request_complete",
    requestId: fields.requestId,
    route: fields.route,
    outcome: fields.outcome,
    status: fields.status,
    durationMs: Math.round(fields.durationMs),
  };
  if (fields.retrievalMs !== undefined) line.retrievalMs = Math.round(fields.retrievalMs);
  if (fields.generationMs !== undefined) line.generationMs = Math.round(fields.generationMs);
  if (fields.chunks !== undefined) line.chunks = fields.chunks;
  if (fields.errorKind !== undefined) line.errorKind = fields.errorKind;
  console.log(JSON.stringify(line));
}

/** Stamps the request id on a response so it can be matched to its log line. */
export function withRequestId<T extends Response>(response: T, requestId: string): T {
  response.headers.set("x-request-id", requestId);
  return response;
}
