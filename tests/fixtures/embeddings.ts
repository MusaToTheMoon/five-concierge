/**
 * A deterministic stand-in for data/embeddings.json.
 *
 * The real store is gitignored and rebuilt with `npm run ingest`, so it cannot
 * be relied on in tests or CI. This fixture is hand-built instead, and its
 * vectors are constructed so that every similarity score is an exact,
 * readable number rather than something that has to be recomputed to be
 * checked.
 *
 * Construction: with QUERY_VECTOR = e0, a chunk vector built as
 * `s * e0 + sqrt(1 - s^2) * e1` is unit length and has a dot product with the
 * query of exactly `s`. So each chunk's `score` below IS its expected
 * similarity, and the relevance threshold (0.55) can be probed from both
 * sides.
 */
import { vi } from "vitest";
import { EMBEDDING_DIM } from "@/lib/gemini";
import type { EmbeddedChunk, EmbeddingStore } from "@/lib/types";

/** Path the retrieval module reads, relative to the process working directory. */
const EMBEDDINGS_SUFFIX = ["data", "embeddings.json"].join("/");

/** Builds a unit vector whose dot product with QUERY_VECTOR is exactly `s`. */
function vectorWithScore(s: number): number[] {
  const vector = new Array<number>(EMBEDDING_DIM).fill(0);
  vector[0] = s;
  vector[1] = Math.sqrt(1 - s * s);
  return vector;
}

/** The query every retrieval test embeds to, i.e. the e0 basis vector. */
export const QUERY_VECTOR: number[] = (() => {
  const vector = new Array<number>(EMBEDDING_DIM).fill(0);
  vector[0] = 1;
  return vector;
})();

/** A query orthogonal to every fixture chunk, so nothing clears the threshold. */
export const ORTHOGONAL_QUERY_VECTOR: number[] = (() => {
  const vector = new Array<number>(EMBEDDING_DIM).fill(0);
  vector[EMBEDDING_DIM - 1] = 1;
  return vector;
})();

interface FixtureSpec {
  id: string;
  title: string;
  source_url: string;
  category: string;
  text: string;
  /** Exact cosine similarity against QUERY_VECTOR. */
  score: number;
}

/**
 * Ordered by descending score on purpose, but the store is deliberately
 * shuffled below so tests cannot pass by accident of insertion order.
 */
export const FIXTURE_SPECS: FixtureSpec[] = [
  {
    id: "chunk-palm-suites",
    title: "FIVE Palm Jumeirah",
    source_url: "https://fivehotelsandresorts.com/five-palm-jumeirah",
    category: "property",
    text: "FIVE Palm Jumeirah sits on its own stretch of beach with private pool suites.",
    score: 1.0,
  },
  {
    id: "chunk-spa",
    title: "The Spa at FIVE",
    source_url: "https://fivehotelsandresorts.com/spa",
    category: "spa",
    text: "The Spa at FIVE offers hammam rituals and couples treatment rooms.",
    score: 0.95,
  },
  {
    id: "chunk-pool",
    title: "Beach and Pool Clubs",
    source_url: "https://fivehotelsandresorts.com/pool-clubs",
    category: "pool",
    text: "The pool club runs day-to-night sessions with resident DJs.",
    score: 0.9,
  },
  {
    id: "chunk-dining",
    title: "Dining at FIVE",
    source_url: "https://fivehotelsandresorts.com/dining",
    category: "dining",
    text: "Signature restaurants span Japanese robatayaki and coastal Mediterranean.",
    score: 0.85,
  },
  {
    id: "chunk-palm-beach",
    title: "FIVE Palm Jumeirah",
    source_url: "https://fivehotelsandresorts.com/five-palm-jumeirah",
    category: "property",
    text: "The beachfront at FIVE Palm Jumeirah faces the Dubai Marina skyline.",
    score: 0.8,
  },
  {
    id: "chunk-nightlife",
    title: "Nightlife at FIVE",
    source_url: "https://fivehotelsandresorts.com/nightlife",
    category: "nightlife",
    text: "Late sets run through the night at the rooftop and beach venues.",
    score: 0.75,
  },
  {
    id: "chunk-luxe",
    title: "FIVE LUXE JBR",
    source_url: "https://fivehotelsandresorts.com/five-luxe",
    category: "property",
    text: "FIVE LUXE JBR overlooks the Ain Dubai wheel from Jumeirah Beach Residence.",
    score: 0.6,
  },
  {
    id: "chunk-zurich",
    title: "FIVE Zurich",
    source_url: "https://fivehotelsandresorts.com/five-zurich",
    category: "property",
    text: "FIVE Zurich blends an alpine setting with the group's signature nightlife.",
    // Deliberately just above MIN_SIMILARITY (0.55).
    score: 0.56,
  },
  {
    id: "chunk-ibiza",
    title: "Destino FIVE Ibiza",
    source_url: "https://fivehotelsandresorts.com/destino-ibiza",
    category: "property",
    text: "Destino FIVE Ibiza looks over Talamanca bay from the cliffs.",
    // Deliberately just below MIN_SIMILARITY (0.55), so it must be excluded.
    score: 0.54,
  },
  {
    id: "chunk-offtopic",
    title: "Careers at FIVE",
    source_url: "https://fivehotelsandresorts.com/careers",
    category: "corporate",
    text: "Open roles across the group's properties and head office.",
    // Orthogonal to the query, the clearest possible exclusion.
    score: 0.0,
  },
];

/** Ids expected back for a QUERY_VECTOR search, in rank order, before `k`. */
export const EXPECTED_RANKED_IDS = FIXTURE_SPECS.filter((s) => s.score >= 0.55)
  .map((s) => s.id);

/** Insertion order that is NOT score order, so sorting has to actually happen. */
const SHUFFLED = [4, 9, 0, 7, 2, 8, 5, 1, 6, 3].map((i) => FIXTURE_SPECS[i]);

export const FIXTURE_CHUNKS: EmbeddedChunk[] = SHUFFLED.map((spec) => ({
  id: spec.id,
  title: spec.title,
  source_url: spec.source_url,
  category: spec.category,
  text: spec.text,
  embedding: vectorWithScore(spec.score),
}));

export const FIXTURE_STORE: EmbeddingStore = {
  model: "gemini-embedding-001",
  dimensions: EMBEDDING_DIM,
  createdAt: "2026-01-01T00:00:00.000Z",
  chunks: FIXTURE_CHUNKS,
};

/**
 * Factory for `vi.mock("node:fs", ...)` that serves the fixture store when the
 * retrieval module reads data/embeddings.json, and delegates every other call
 * to the real fs. Used as:
 *
 *     vi.mock("node:fs", () => fixtureFsMock());
 *
 * Mocking the filesystem rather than the retrieval module keeps the real
 * scoring, filtering and sorting under test.
 */
export async function fixtureFsMock(store: EmbeddingStore = FIXTURE_STORE) {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  const isEmbeddingsPath = (p: unknown) =>
    typeof p === "string" && p.replace(/\\/g, "/").endsWith(EMBEDDINGS_SUFFIX);

  const existsSync = (p: Parameters<typeof actual.existsSync>[0]) =>
    isEmbeddingsPath(p) ? true : actual.existsSync(p);

  const readFileSync = ((p: unknown, options?: unknown) =>
    isEmbeddingsPath(p)
      ? JSON.stringify(store)
      : (actual.readFileSync as (a: unknown, b: unknown) => unknown)(
          p,
          options,
        )) as unknown as typeof actual.readFileSync;

  const patched = { ...actual, existsSync, readFileSync };
  return { ...patched, default: patched };
}

/**
 * Same as `fixtureFsMock`, but reports data/embeddings.json as missing, so the
 * retrieval module takes its "run npm run ingest first" error path.
 */
export async function missingStoreFsMock() {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  const existsSync = (p: Parameters<typeof actual.existsSync>[0]) =>
    typeof p === "string" && p.replace(/\\/g, "/").endsWith(EMBEDDINGS_SUFFIX)
      ? false
      : actual.existsSync(p);
  const patched = { ...actual, existsSync };
  return { ...patched, default: patched };
}
