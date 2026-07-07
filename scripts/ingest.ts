/**
 * Ingestion pipeline: reads /content/*.md, chunks each doc to roughly 500
 * tokens, embeds the chunks with Gemini, and writes data/embeddings.json.
 *
 * Run with: npm run ingest  (requires GEMINI_API_KEY in .env.local)
 */
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { embedTexts, EMBEDDING_DIM, EMBEDDING_MODEL } from "../lib/gemini";
import type { EmbeddedChunk, EmbeddingStore } from "../lib/types";

const CONTENT_DIR = path.join(process.cwd(), "content");
const OUTPUT_FILE = path.join(process.cwd(), "data", "embeddings.json");

/** ~500 tokens at the usual ~4 chars/token for English prose. */
const MAX_CHUNK_CHARS = 2000;

/** Embedding requests per batch — small to stay friendly to free-tier limits. */
const BATCH_SIZE = 10;

/** Loads .env.local so the script works outside Next.js without extra deps. */
function loadEnvLocal(): void {
  if (process.env.GEMINI_API_KEY) return;
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

interface RawChunk {
  title: string;
  source_url: string;
  category: string;
  text: string;
}

/**
 * Splits a doc into chunks along heading boundaries, packing consecutive
 * sections together while they fit. Each chunk is prefixed with the doc
 * title so it stays self-describing after retrieval.
 */
function chunkDocument(body: string, title: string): string[] {
  // VERIFY-comments and other HTML comments are editorial notes, not content.
  const clean = body.replace(/<!--[\s\S]*?-->/g, "").trim();

  // Split on markdown headings, keeping the heading with its section.
  const sections = clean
    .split(/\n(?=#{1,3} )/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";
  for (const section of sections) {
    if (current && (current + "\n\n" + section).length > MAX_CHUNK_CHARS) {
      chunks.push(current);
      current = section;
    } else {
      current = current ? current + "\n\n" + section : section;
    }
  }
  if (current) chunks.push(current);

  // Hard-split any single oversized section on paragraph boundaries.
  return chunks
    .flatMap((chunk) => {
      if (chunk.length <= MAX_CHUNK_CHARS) return [chunk];
      const parts: string[] = [];
      let piece = "";
      for (const para of chunk.split(/\n\n+/)) {
        if (piece && (piece + "\n\n" + para).length > MAX_CHUNK_CHARS) {
          parts.push(piece);
          piece = para;
        } else {
          piece = piece ? piece + "\n\n" + para : para;
        }
      }
      if (piece) parts.push(piece);
      return parts;
    })
    .map((chunk) => `${title}\n\n${chunk}`);
}

function readCorpus(): RawChunk[] {
  const files = fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();
  if (files.length === 0) {
    throw new Error(`No markdown files found in ${CONTENT_DIR}`);
  }

  const raw: RawChunk[] = [];
  for (const file of files) {
    const { data, content } = matter(
      fs.readFileSync(path.join(CONTENT_DIR, file), "utf8"),
    );
    const { title, source_url, category } = data;
    if (!title || !source_url || !category) {
      throw new Error(`${file}: frontmatter needs title, source_url, category`);
    }
    const texts = chunkDocument(content, title);
    for (const text of texts) {
      raw.push({ title, source_url, category, text });
    }
    console.log(`  ${file} → ${texts.length} chunks`);
  }
  return raw;
}

async function main(): Promise<void> {
  loadEnvLocal();
  console.log("Reading content corpus…");
  const raw = readCorpus();
  console.log(`Embedding ${raw.length} chunks with ${EMBEDDING_MODEL}…`);

  const chunks: EmbeddedChunk[] = [];
  for (let i = 0; i < raw.length; i += BATCH_SIZE) {
    const batch = raw.slice(i, i + BATCH_SIZE);
    const vectors = await embedTexts(
      batch.map((c) => c.text),
      "RETRIEVAL_DOCUMENT",
    );
    batch.forEach((chunk, j) => {
      chunks.push({ id: `chunk-${i + j}`, ...chunk, embedding: vectors[j] });
    });
    console.log(`  embedded ${Math.min(i + BATCH_SIZE, raw.length)}/${raw.length}`);
  }

  const store: EmbeddingStore = {
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIM,
    createdAt: new Date().toISOString(),
    chunks,
  };
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(store));
  const sizeKb = Math.round(fs.statSync(OUTPUT_FILE).size / 1024);
  console.log(`Wrote ${chunks.length} chunks to data/embeddings.json (${sizeKb} KB)`);
}

main().catch((error) => {
  console.error("\nIngestion failed:", error.message ?? error);
  process.exit(1);
});
