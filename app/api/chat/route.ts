import { NextResponse } from "next/server";
import { Type } from "@google/genai";
import { classifyError, handleGeminiError } from "@/lib/api-errors";
import { CHAT_MODEL, getGemini } from "@/lib/gemini";
import { logRequest, newRequestId, withRequestId } from "@/lib/observability";
import { clientIp, isRateLimited, rateLimitedResponse } from "@/lib/rate-limit";
import { formatContext, retrieve, toSources } from "@/lib/retrieval";
import type { ChatMessage } from "@/lib/types";

/** Gemini can be slow on cold starts; allow headroom beyond Vercel's default. */
export const maxDuration = 60;

/** Turns of history forwarded to the model (the client sends everything). */
const HISTORY_LIMIT = 10;

const SYSTEM_PROMPT = `You are the FIVE Concierge, the AI guest concierge for FIVE Hotels and Resorts, the luxury lifestyle group behind FIVE Palm Jumeirah, FIVE LUXE JBR and FIVE Jumeirah Village in Dubai, FIVE Zurich, and Destino FIVE Ibiza and Pacha Hotel Ibiza.

Voice: polished, warm and effortlessly glamorous, a knowing insider, never stiff, never gushing. Keep answers tight: two or three short paragraphs, or a brief hyphen list when comparing options.

Hard rules, in priority order:
1. Ground every factual claim in the CONTEXT block provided with the question. It is your only source of truth.
2. If the CONTEXT does not contain the answer, say so plainly and point the guest to fivehotelsandresorts.com or the property team. Never guess or fill gaps from general knowledge.
3. Never state, estimate or imply prices, room rates, availability, opening hours or dates that are not in CONTEXT, and never claim a booking has been made or can be made here. Direct booking requests to the official site.
4. Never invent venues, events, perks or policies.
5. Write plain conversational text: no markdown headings, no asterisks, no emoji, and never use em dashes or en dashes (use commas, colons, or separate sentences instead). Simple hyphen lists are fine.
6. If asked about something unrelated to FIVE, its destinations or a guest's stay, politely steer back to what you can help with.

Return JSON with two fields:
- "reply": your answer, following every rule above.
- "grounded": true ONLY when the reply's main purpose is to give the guest substantive FIVE information they asked for (details about the hotels, dining, nightlife, spa, and so on). Set it to false whenever the reply's main purpose is to decline, to redirect the guest to the website or property team, to refuse prices or bookings, or to steer an off-topic question back, even if that reply happens to mention a property or venue name. A refusal or redirect is never grounded.`;

/** Friendly fallback when retrieval finds nothing on-topic. */
const NO_INFO_REPLY =
  "That's not something I have reliable information on, I'm afraid, and I'd rather not guess. For the definitive answer, check fivehotelsandresorts.com or reach out to the property team directly; they'll take care of you.";

export async function POST(request: Request) {
  const requestId = newRequestId();
  const start = performance.now();

  if (await isRateLimited(`chat:${clientIp(request)}`)) {
    logRequest({
      requestId,
      route: "chat",
      outcome: "rate_limited",
      status: 429,
      durationMs: performance.now() - start,
    });
    return withRequestId(rateLimitedResponse(), requestId);
  }

  let messages: ChatMessage[];
  try {
    const body = await request.json();
    messages = body?.messages;
    if (!Array.isArray(messages) || messages.length === 0) throw new Error();
  } catch {
    logRequest({
      requestId,
      route: "chat",
      outcome: "bad_request",
      status: 400,
      durationMs: performance.now() - start,
    });
    return withRequestId(NextResponse.json({ error: "Invalid request." }, { status: 400 }), requestId);
  }

  const history = messages.slice(-HISTORY_LIMIT);
  const last = history[history.length - 1];
  if (last?.role !== "user" || typeof last.content !== "string") {
    logRequest({
      requestId,
      route: "chat",
      outcome: "bad_request",
      status: 400,
      durationMs: performance.now() - start,
    });
    return withRequestId(NextResponse.json({ error: "Invalid request." }, { status: 400 }), requestId);
  }

  let retrievalMs: number | undefined;
  let generationMs: number | undefined;
  let chunkCount: number | undefined;

  try {
    // Short follow-ups ("what about Zurich?") retrieve badly on their own,
    // so fold in the previous user turn for context.
    const userTurns = history.filter((m) => m.role === "user");
    const previous = userTurns[userTurns.length - 2];
    const query =
      last.content.length < 80 && previous
        ? `${previous.content}\n${last.content}`
        : last.content;

    const retrievalStart = performance.now();
    const chunks = await retrieve(query);
    retrievalMs = performance.now() - retrievalStart;
    chunkCount = chunks.length;

    if (chunks.length === 0) {
      const response = NextResponse.json({ reply: NO_INFO_REPLY, sources: [] });
      logRequest({
        requestId,
        route: "chat",
        outcome: "no_context",
        status: 200,
        durationMs: performance.now() - start,
        retrievalMs,
        chunks: chunkCount,
      });
      return withRequestId(response, requestId);
    }

    const contents = history.map((message, i) => ({
      role: message.role === "assistant" ? ("model" as const) : ("user" as const),
      parts: [
        {
          text:
            i === history.length - 1
              ? `CONTEXT:\n${formatContext(chunks)}\n\nGUEST QUESTION: ${message.content}`
              : message.content,
        },
      ],
    }));

    const generationStart = performance.now();
    const geminiResponse = await getGemini().models.generateContent({
      model: CHAT_MODEL,
      contents,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0.6,
        // Skip thinking: concierge answers need latency, not deliberation.
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reply: { type: Type.STRING },
            grounded: { type: Type.BOOLEAN },
          },
          required: ["reply", "grounded"],
          propertyOrdering: ["reply", "grounded"],
        },
      },
    });
    generationMs = performance.now() - generationStart;

    const parsed = JSON.parse(geminiResponse.text ?? "") as {
      reply: string;
      grounded: boolean;
    };
    const reply = parsed.reply?.trim();
    if (!reply) throw new Error("Empty model response");
    // Only cite sources when the model actually answered from them; a refusal
    // or off-topic steer shouldn't carry source chips.
    const response = NextResponse.json({
      reply,
      sources: parsed.grounded ? toSources(chunks) : [],
    });
    logRequest({
      requestId,
      route: "chat",
      outcome: "ok",
      status: 200,
      durationMs: performance.now() - start,
      retrievalMs,
      generationMs,
      chunks: chunkCount,
    });
    return withRequestId(response, requestId);
  } catch (error) {
    const response = handleGeminiError(error);
    logRequest({
      requestId,
      route: "chat",
      outcome: "error",
      status: response.status,
      durationMs: performance.now() - start,
      retrievalMs,
      generationMs,
      chunks: chunkCount,
      errorKind: classifyError(error),
    });
    return withRequestId(response, requestId);
  }
}
