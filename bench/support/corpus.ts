/**
 * Reads the real data/embeddings.json store directly, so corpus size and a
 * realistic query vector always come from what is actually on disk rather
 * than a hardcoded guess.
 *
 * Plain relative imports only, no `@/` alias: used from both Vitest bench
 * files and plain tsx scripts.
 */
import fs from "node:fs";
import path from "node:path";
import type { EmbeddingStore } from "../../lib/types";

export interface CorpusInfo {
  model: string;
  dimensions: number;
  chunkCount: number;
  createdAt: string;
}

function storeFile(): string {
  return path.join(process.cwd(), "data", "embeddings.json");
}

function readStore(): EmbeddingStore {
  const file = storeFile();
  if (!fs.existsSync(file)) {
    throw new Error("data/embeddings.json not found. Run `npm run ingest` first.");
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as EmbeddingStore;
}

/** Corpus size and dimensionality, read live from the real store. */
export function readCorpusInfo(): CorpusInfo {
  const store = readStore();
  return {
    model: store.model,
    dimensions: store.dimensions,
    chunkCount: store.chunks.length,
    createdAt: store.createdAt,
  };
}

/**
 * A real chunk's own embedding vector, borrowed to stand in for a query
 * vector. Its dot product with itself is 1.0, so it reliably clears the
 * relevance threshold against the real store without needing an actual
 * Gemini call, and Tiers A and C both exercise the real scoring and filter
 * path rather than trivially retrieving nothing.
 */
export function readSampleQueryVector(): number[] {
  const store = readStore();
  const [first] = store.chunks;
  if (!first) throw new Error("data/embeddings.json has no chunks.");
  return first.embedding;
}
