import fs from "node:fs";
import path from "node:path";
import { embedTexts } from "./gemini";
import type { EmbeddedChunk, EmbeddingStore, Source } from "./types";

/**
 * Chunks scoring below this cosine similarity are treated as irrelevant.
 * With unit-length gemini-embedding-001 vectors, on-topic matches for this
 * corpus land well above it and off-topic queries fall below.
 */
const MIN_SIMILARITY = 0.55;

/** A retrieved chunk with its similarity score. */
export interface ScoredChunk extends EmbeddedChunk {
  score: number;
}

let store: EmbeddingStore | null = null;

/** Loads and caches the embedding store (tiny corpus — a few hundred KB). */
function getStore(): EmbeddingStore {
  if (!store) {
    const file = path.join(process.cwd(), "data", "embeddings.json");
    if (!fs.existsSync(file)) {
      throw new Error(
        "data/embeddings.json not found. Run `npm run ingest` first.",
      );
    }
    store = JSON.parse(fs.readFileSync(file, "utf8")) as EmbeddingStore;
  }
  return store;
}

/** Both vectors are unit-length, so the dot product is cosine similarity. */
function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

/**
 * Embeds the query and returns the top-K most similar chunks above the
 * relevance threshold, best first. An empty result means the corpus has
 * nothing on-topic and the caller should decline to answer.
 */
export async function retrieve(query: string, k = 6): Promise<ScoredChunk[]> {
  const [queryVector] = await embedTexts([query], "RETRIEVAL_QUERY");
  return getStore()
    .chunks.map((chunk) => ({ ...chunk, score: dot(queryVector, chunk.embedding) }))
    .filter((chunk) => chunk.score >= MIN_SIMILARITY)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/** Dedupes chunks into the citable source pages, preserving rank order. */
export function toSources(chunks: ScoredChunk[]): Source[] {
  const seen = new Set<string>();
  const sources: Source[] = [];
  for (const chunk of chunks) {
    if (!seen.has(chunk.source_url)) {
      seen.add(chunk.source_url);
      sources.push({ title: chunk.title, url: chunk.source_url });
    }
  }
  return sources;
}

/**
 * Formats chunks into the CONTEXT block injected into prompts. Each chunk is
 * labelled with its source so the model can attribute what it uses.
 */
export function formatContext(chunks: ScoredChunk[]): string {
  return chunks
    .map(
      (chunk, i) =>
        `[${i + 1}] "${chunk.title}" (${chunk.source_url})\n${chunk.text}`,
    )
    .join("\n\n---\n\n");
}
