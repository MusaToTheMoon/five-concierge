import { NextResponse } from "next/server";
import { Type } from "@google/genai";
import { handleGeminiError } from "@/lib/api-errors";
import { CHAT_MODEL, getGemini } from "@/lib/gemini";
import { clientIp, isRateLimited, rateLimitedResponse } from "@/lib/rate-limit";
import { formatContext, retrieve, toSources, type ScoredChunk } from "@/lib/retrieval";
import type { Itinerary, ItineraryStop } from "@/lib/types";

export const maxDuration = 60;

const VIBES = ["chic dinner", "party", "relaxed", "romantic"] as const;
const DESTINATIONS = ["Dubai", "Zurich", "Ibiza"] as const;
const GROUPS = ["solo", "couple", "small group", "big group"] as const;
const INTERESTS = ["dining", "nightlife", "spa", "pool"] as const;

const SYSTEM_PROMPT = `You are the FIVE Concierge, curating one perfect evening across FIVE Hotels and Resorts venues for a Gen-Z/Millennial luxury guest.

Hard rules:
1. Use ONLY venues, properties and facts that appear in the CONTEXT block. Never invent a venue, event or perk.
2. Every stop must reference the context chunk it came from via source_index (the [n] labels).
3. 3 to 5 stops, in chronological order through the evening, with realistic flow (aperitivo, then dinner, then night). Use indicative times like "7:30 PM", but do not promise opening hours, since CONTEXT does not include them.
4. Keep all stops in the guest's chosen destination city.
5. Match the vibe and group: romantic means intimate venues and sunset moments, party means pool clubs and dancefloors, relaxed means spa/pool/casual dining, chic dinner centres on the strongest restaurant.
6. Never mention prices, rates or availability. No booking promises.
7. Blurbs: max two sentences, evocative and editorial, written for an Instagram caption, not a brochure. No emoji, no hashtags, and never use em dashes or en dashes.
8. title: a short evocative name for the night (max 6 words). subtitle: one line setting the scene.`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    subtitle: { type: Type.STRING },
    stops: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          time: { type: Type.STRING },
          venue: { type: Type.STRING },
          property: { type: Type.STRING },
          blurb: { type: Type.STRING },
          category: { type: Type.STRING, enum: [...INTERESTS, "other"] },
          source_index: { type: Type.INTEGER },
        },
        required: ["time", "venue", "property", "blurb", "category", "source_index"],
        propertyOrdering: ["time", "venue", "property", "blurb", "category", "source_index"],
      },
    },
  },
  required: ["title", "subtitle", "stops"],
  propertyOrdering: ["title", "subtitle", "stops"],
};

interface Preferences {
  vibe: (typeof VIBES)[number];
  destination: (typeof DESTINATIONS)[number];
  group: (typeof GROUPS)[number];
  interests: (typeof INTERESTS)[number][];
}

function parsePreferences(body: unknown): Preferences | null {
  const b = body as Record<string, unknown>;
  const interests = Array.isArray(b?.interests)
    ? b.interests.filter((i): i is Preferences["interests"][number] =>
        (INTERESTS as readonly string[]).includes(i as string),
      )
    : [];
  if (
    !VIBES.includes(b?.vibe as Preferences["vibe"]) ||
    !DESTINATIONS.includes(b?.destination as Preferences["destination"]) ||
    !GROUPS.includes(b?.group as Preferences["group"]) ||
    interests.length === 0
  ) {
    return null;
  }
  return {
    vibe: b.vibe as Preferences["vibe"],
    destination: b.destination as Preferences["destination"],
    group: b.group as Preferences["group"],
    interests,
  };
}

/** One retrieval per interest keeps every requested angle represented. */
async function gatherContext(prefs: Preferences): Promise<ScoredChunk[]> {
  const queries = prefs.interests.map(
    (interest) => `${prefs.destination} ${interest} ${prefs.vibe} FIVE hotel venues`,
  );
  const results = await Promise.all(queries.map((q) => retrieve(q, 5)));
  const seen = new Set<string>();
  const merged: ScoredChunk[] = [];
  for (const chunk of results.flat().sort((a, b) => b.score - a.score)) {
    if (!seen.has(chunk.id)) {
      seen.add(chunk.id);
      merged.push(chunk);
    }
  }
  return merged.slice(0, 10);
}

export async function POST(request: Request) {
  if (isRateLimited(`itinerary:${clientIp(request)}`)) return rateLimitedResponse();

  let prefs: Preferences | null = null;
  try {
    prefs = parsePreferences(await request.json());
  } catch {
    /* falls through to the 400 below */
  }
  if (!prefs) {
    return NextResponse.json({ error: "Invalid preferences." }, { status: 400 });
  }

  try {
    const chunks = await gatherContext(prefs);
    if (chunks.length === 0) {
      return NextResponse.json(
        { error: "I couldn't find grounded venues for that combination. Try different preferences." },
        { status: 422 },
      );
    }

    const prompt = `CONTEXT:\n${formatContext(chunks)}\n\nGUEST PREFERENCES:\n- Destination: ${prefs.destination}\n- Vibe: ${prefs.vibe}\n- Group: ${prefs.group}\n- Interests: ${prefs.interests.join(", ")}\n\nCurate the itinerary now.`;

    const response = await getGemini().models.generateContent({
      model: CHAT_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0.8,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    });

    const raw = JSON.parse(response.text ?? "") as {
      title: string;
      subtitle: string;
      stops: Array<Omit<ItineraryStop, "source"> & { source_index: number }>;
    };

    // Resolve each stop's source_index back to a citable page; drop bad refs.
    const stops: ItineraryStop[] = (raw.stops ?? []).map((stop) => {
      const chunk = chunks[stop.source_index - 1];
      return {
        time: stop.time,
        venue: stop.venue,
        property: stop.property,
        blurb: stop.blurb,
        category: stop.category,
        source: chunk ? { title: chunk.title, url: chunk.source_url } : null,
      };
    });
    if (stops.length === 0) throw new Error("Model returned no stops");

    const itinerary: Itinerary = { title: raw.title, subtitle: raw.subtitle, stops };
    return NextResponse.json({ itinerary, sources: toSources(chunks) });
  } catch (error) {
    return handleGeminiError(error);
  }
}
