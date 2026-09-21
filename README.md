# FIVE Concierge

Deployed at [https://fiveconcierge.vercel.app/](https://fiveconcierge.vercel.app/)

An AI guest concierge for [FIVE Hotels and Resorts](https://www.fivehotelsandresorts.com/),
the luxury lifestyle group behind FIVE Palm Jumeirah, FIVE LUXE JBR and FIVE
Jumeirah Village in Dubai, FIVE Zurich, and Destino FIVE Ibiza and Pacha Hotel
Ibiza. It answers guest questions grounded in FIVE's own public pages (with
cited sources under every answer) and curates personalised evening
itineraries with the **Plan My Night** flow.

> Unofficial demo and portfolio project. Not affiliated with FIVE Hotels and
> Resorts.

## How it works

- **Next.js (App Router) + TypeScript + Tailwind CSS**, deployed on Vercel's
  free tier. No database, no auth; chat history lives in the browser's
  localStorage.
- **RAG with a file-based vector store.** `npm run ingest` chunks the markdown
  corpus in [`content/`](content/), embeds it with Gemini
  (`gemini-embedding-001`, 768 dims) and writes `data/embeddings.json`.
  At query time the API embeds the question and runs in-memory cosine
  similarity; the corpus is tiny, so no vector DB is needed.
- **Grounded answers only.** `gemini-2.5-flash` answers strictly from the
  retrieved chunks and cites the FIVE pages it used. If retrieval finds
  nothing relevant, the concierge says so and points to the official site;
  it never invents prices, availability or bookings.
- The Gemini API key is used **only in server-side API routes** and is never
  exposed to the client.

## Running locally

```bash
npm install
cp .env.example .env.local   # then paste your Gemini API key
npm run ingest               # builds data/embeddings.json (one-time, ~30s)
npm run dev                  # http://localhost:3000
```

Get a free Gemini API key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
The free tier is enough for both ingestion and chat.

## Tests

```bash
npm test              # run the suite once
npm run test:watch    # re-run on change
npm run test:coverage # run with a coverage report
npm run typecheck     # tsc --noEmit
npm run lint
```

The suite needs no API keys, no Redis and no network: Gemini and Upstash are
mocked at the module boundary. It also does not need `data/embeddings.json`,
which is gitignored and rebuilt by `npm run ingest`. Retrieval tests read a
committed fixture (`tests/fixtures/embeddings.ts`) served through a `node:fs`
mock, so the real scoring, filtering and sorting stay under test while the
similarity scores remain exact and readable.

48 tests, roughly 0.7s wall clock. Coverage of `lib/` and `app/api/`:

| File | Stmts | Branch | Funcs | Lines |
| --- | --- | --- | --- | --- |
| All files | 98.86% | 89.32% | 100% | 98.86% |
| `app/api/chat/route.ts` | 100% | 93.10% | 100% | 100% |
| `app/api/itinerary/route.ts` | 96.74% | 80.64% | 100% | 96.74% |
| `lib/api-errors.ts` | 100% | 83.33% | 100% | 100% |
| `lib/gemini.ts` | 100% | 84.61% | 100% | 100% |
| `lib/rate-limit.ts` | 100% | 100% | 100% | 100% |
| `lib/retrieval.ts` | 100% | 100% | 100% | 100% |

`lib/types.ts` is excluded: it declares interfaces only and compiles to no
runtime code. There is no coverage threshold gate; the number above is
reported, not targeted.

## Adding or editing content

The knowledge base is plain markdown in [`content/`](content/). Each file
needs frontmatter:

```markdown
---
title: "FIVE Palm Jumeirah, Dubai"
source_url: "https://palmjumeirah.fivehotelsandresorts.com/"
category: "hotel" # hotel | dining | nightlife | spa | sustainability | faq
---

# Heading

Body text…
```

- `source_url` is what gets cited under answers, so point it at the real page.
- HTML comments (`<!-- VERIFY: … -->`) are stripped before embedding; they
  mark facts that should be re-checked against the live site.
- After any content change, re-run `npm run ingest` (and redeploy).

## Deploying to Vercel (CLI, no Git remote needed)

Deploy straight from this folder:

```bash
npm install -g vercel
vercel          # creates a preview deployment
vercel --prod   # promotes it to production
```

**Important:** `.env.local` is never uploaded to Vercel, so the live site
can't reach Gemini until you set the key on Vercel's side. Either:

- run `vercel env add GEMINI_API_KEY` and paste the key, **or**
- open [vercel.com/dashboard](https://vercel.com/dashboard) → your project →
  *Settings* → *Environment Variables* and add `GEMINI_API_KEY` there.

Then redeploy (`vercel --prod`) so the variable takes effect. Run
`npm run ingest` before deploying, since the CLI uploads `data/embeddings.json`
with the build (it's allowed through in `.vercelignore`).

## Project layout

```
content/               # markdown knowledge base (frontmatter + prose)
scripts/ingest.ts      # chunk → embed → data/embeddings.json
lib/gemini.ts          # Gemini client + embedding helper (server-only)
lib/retrieval.ts       # cosine similarity top-K + source dedupe
app/api/chat/          # grounded chat with citations
app/api/itinerary/     # Plan My Night: schema-constrained JSON
components/            # Chat, PlanMyNight, header/footer, source chips
```
