# Tazkia AI Assistant

A production-ready Islamic Knowledge RAG (Retrieval-Augmented Generation) system that answers questions using **only** verified sources — Quran, Hadith, and Tafsir. Zero hallucination by design.

Built for the **Tazkia365 mobile app** as a serverless backend on Vercel + Supabase, entirely on free tiers.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [How the RAG Pipeline Works](#4-how-the-rag-pipeline-works)
5. [Guardrails System](#5-guardrails-system)
6. [API Reference](#6-api-reference)
7. [SSE Event Stream Protocol](#7-sse-event-stream-protocol)
8. [Local Development Setup](#8-local-development-setup)
9. [Data Ingestion Pipeline](#9-data-ingestion-pipeline)
10. [Supabase Setup (DevOps)](#10-supabase-setup-devops)
11. [Vercel Deployment (DevOps)](#11-vercel-deployment-devops)
12. [Environment Variables Reference](#12-environment-variables-reference)
13. [Performance & Free Tier Limits](#13-performance--free-tier-limits)
14. [Cost Breakdown](#14-cost-breakdown)
15. [Monitoring & Observability](#15-monitoring--observability)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. Architecture Overview

```
  ┌─────────────────────────────────────────────────────────────────┐
  │                    TAZKIA AI ASSISTANT                          │
  │              100% Free Tier · Serverless · Streaming            │
  └─────────────────────────────────────────────────────────────────┘

  Mobile App (Flutter / React Native)
       │
       │  POST /api/ask      → SSE stream (tokens + sources + confidence)
       │  POST /api/search   → JSON (paginated results)
       │  GET  /api/sources  → JSON (source catalog, cached 1h)
       │  GET  /api/health   → JSON (liveness probe)
       │
       ▼
  ╔═══════════════════════════════════════════════════════╗
  ║              VERCEL  (Free Tier)                      ║
  ║                                                       ║
  ║  ┌─────────────────────────────────────────────────┐  ║
  ║  │  Edge Middleware  (middleware.ts)               │  ║
  ║  │  • IP-based rate limiting: 20 req/min          │  ║
  ║  │  • CORS headers for mobile app                 │  ║
  ║  └───────────────────┬─────────────────────────────┘  ║
  ║                      │                                ║
  ║  ┌───────────────────▼─────────────────────────────┐  ║
  ║  │  Next.js API Routes  (Edge Runtime)             │  ║
  ║  │                                                 │  ║
  ║  │  /api/ask                                       │  ║
  ║  │   ├─ 1. Validate input (≤500 chars)             │  ║
  ║  │   ├─ 2. Rewrite query  (LLM, lightweight)      │  ║──────► OpenAI
  ║  │   ├─ 3. Dual embed    (orig + rewritten)       │  ║        text-embedding
  ║  │   ├─ 4. hybridSearch() → Supabase RPC          │  ║        -3-small
  ║  │   ├─ 5. checkSources() [Gate 1]                │  ║
  ║  │   ├─ 6. streamAnswer() → LLM stream            │  ║──────► gpt-4o-mini
  ║  │   ├─ 7. detectFatwas() [Gate 2]                │  ║        (streaming)
  ║  │   └─ 8. groundingScore() + confidence [Gate 3] │  ║
  ║  │                                                 │  ║
  ║  │  /api/search  → embed + hybridSearch()         │  ║
  ║  │  /api/sources → Supabase count (cached 1h)     │  ║
  ║  │  /api/health  → Supabase ping                  │  ║
  ║  └───────────────────┬─────────────────────────────┘  ║
  ║                      │  Vercel Edge Cache             ║
  ║                      │  /api/sources TTL=1h           ║
  ╚══════════════════════╪═══════════════════════════════╝
                         │
                         ▼
  ╔═══════════════════════════════════════════════════════╗
  ║          SUPABASE  (Free Tier · 500 MB)               ║
  ║                                                       ║
  ║  ┌─────────────────────────────────────────────────┐  ║
  ║  │  documents                                      │  ║
  ║  │  ├─ id            UUID (PK)                     │  ║
  ║  │  ├─ content       TEXT                          │  ║
  ║  │  ├─ embedding     vector(1536)  ← pgvector      │  ║
  ║  │  ├─ metadata      JSONB         ← surah/hadith  │  ║
  ║  │  ├─ source_type   TEXT          ← quran/hadith  │  ║
  ║  │  └─ language      TEXT          ← en/ar         │  ║
  ║  │                                                 │  ║
  ║  │  Indexes:                                       │  ║
  ║  │  • IVFFlat(embedding) → ANN vector search       │  ║
  ║  │  • GIN(to_tsvector)  → full-text search         │  ║
  ║  │  • GIN(metadata)     → filter by surah/book     │  ║
  ║  └─────────────────────────────────────────────────┘  ║
  ║                                                       ║
  ║  ┌─────────────────────────────────────────────────┐  ║
  ║  │  hybrid_search() RPC                            │  ║
  ║  │  = semantic(70%) + full-text(30%) fusion        │  ║
  ║  └─────────────────────────────────────────────────┘  ║
  ║                                                       ║
  ║  ┌─────────────────────────────────────────────────┐  ║
  ║  │  query_logs  (analytics)                        │  ║
  ║  │  RLS: service_role write-only, no public read   │  ║
  ║  └─────────────────────────────────────────────────┘  ║
  ╚═══════════════════════════════════════════════════════╝

  LOCAL MACHINE ONLY  (never runs on Vercel)
  ┌─────────────────────────────────────────────────────┐
  │  scripts/ingest.ts                                  │
  │   ├─ fetchQuranDocuments()  → QuranCDN free API     │
  │   ├─ fetchHadithDocuments() → fawazahmed0 CDN       │
  │   ├─ chunkText()            → 600-word chunks       │
  │   ├─ embedDocuments()       → OpenAI batch embed    │
  │   └─ supabase.insert()      → bulk upload           │
  └─────────────────────────────────────────────────────┘
```

### Data Flow Summary

```
User query
  → Edge Middleware (rate limit)
    → Validate input
      → Rewrite query (LLM)        ~200ms
        → Embed (×2, averaged)     ~300ms
          → hybrid_search (SQL)    ~100ms
            → Gate 1: source check
              → Stream LLM answer  ~2-5s
                → Gate 2: fatwa detection
                  → Gate 3: grounding score
                    → SSE [DONE] to client
```

---

## 2. Tech Stack

| Layer | Technology | Why |
|---|---|---|
| **Runtime** | Next.js 14 (App Router) | Native Vercel serverless + Edge Runtime |
| **Language** | TypeScript (strict) | Type safety across the full RAG pipeline |
| **LLM Orchestration** | LangChain.js v0.3 | Chains, streaming, prompt templates |
| **LLM Provider** | OpenAI `gpt-4o-mini` | Best accuracy/cost for citation tasks |
| **Embeddings** | OpenAI `text-embedding-3-small` | 1536 dims, $0.02/1M tokens |
| **Vector DB** | Supabase pgvector | Free 500 MB, SQL filters, no extra service |
| **Full-text Search** | PostgreSQL `tsvector` | Built into Supabase, zero cost |
| **Hosting** | Vercel (free tier) | Native Next.js, Edge CDN, 10s functions |
| **Caching** | Vercel Edge Cache | TTL headers on `/api/sources` |
| **Rate Limiting** | Edge Middleware (in-memory) | No Redis needed, IP-keyed sliding window |
| **Auth** | Supabase RLS | Service-role key never exposed to client |
| **Streaming** | Server-Sent Events (SSE) | Vercel-compatible, no WebSocket needed |

---

## 3. Project Structure

```
tazkia-ai-assistant/
│
├── app/
│   └── api/                        # Vercel serverless API routes
│       ├── ask/
│       │   └── route.ts            # POST — SSE streaming RAG endpoint
│       ├── search/
│       │   └── route.ts            # POST — paginated document search
│       ├── sources/
│       │   └── route.ts            # GET  — source catalog (1h cache)
│       └── health/
│           └── route.ts            # GET  — liveness probe
│
├── lib/                            # Shared server-side modules
│   ├── types.ts                    # All TypeScript interfaces + SSE event types
│   ├── supabase.ts                 # Admin client (service-role, server-only)
│   ├── embeddings.ts               # OpenAI embeddings singleton
│   ├── vectorstore.ts              # hybridSearch() — Supabase RPC wrapper
│   ├── guardrails.ts               # 3-gate guardrail system
│   └── rag-chain.ts                # Query rewrite → retrieve → stream
│
├── scripts/                        # Run locally once to populate DB
│   ├── ingest.ts                   # Main pipeline (chunk → embed → insert)
│   ├── fetch-quran.ts              # QuranCDN API → 6,236 verses
│   └── fetch-hadith.ts             # fawazahmed0 CDN → ~19K hadiths
│
├── supabase/
│   ├── schema.sql                  # Tables, indexes, hybrid_search RPC
│   └── rls.sql                     # Row Level Security policies
│
├── middleware.ts                   # Edge rate limiting + CORS
├── next.config.ts                  # Webpack + experimental server packages
├── vercel.json                     # Function limits, cache rules, env refs
├── tsconfig.json                   # App TypeScript config
├── tsconfig.scripts.json           # Scripts TypeScript config (CommonJS)
├── package.json
└── .env.local.example              # Template — copy to .env.local
```

### Module Dependency Graph

```
route.ts (ask)
  ├── lib/rag-chain.ts
  │     ├── lib/embeddings.ts   → OpenAI SDK
  │     ├── lib/vectorstore.ts  → lib/supabase.ts → Supabase
  │     └── lib/guardrails.ts
  └── lib/supabase.ts           (analytics write)

scripts/ingest.ts
  ├── scripts/fetch-quran.ts    → QuranCDN API (free)
  ├── scripts/fetch-hadith.ts   → fawazahmed0 CDN (free)
  └── @langchain/openai         → OpenAI embeddings
```

---

## 4. How the RAG Pipeline Works

### Step 1 — Query Rewrite
The user's raw query is rewritten by a lightweight LLM call to include relevant Islamic terminology. Both the original and rewritten queries are embedded and averaged into a single vector for better recall.

```
"what does islam say about being patient"
  ↓ rewrite
"Quranic verses and hadith about sabr (patience) and perseverance in Islam"
  ↓ embed (both, then average)
[0.023, -0.451, 0.871, ...]  ← 1536-dim vector
```

### Step 2 — Hybrid Search
The `hybrid_search` Postgres function fuses two signals:

```sql
similarity = semantic_score × 0.70
           + keyword_score  × 0.30
```

- **Semantic (pgvector):** cosine similarity between query vector and document embeddings — finds conceptually related passages even with different words
- **Keyword (tsvector):** PostgreSQL full-text search rank — finds exact term matches (important for Arabic transliterations like "sabr", "tawakkul")

Results below similarity `0.25` are discarded.

### Step 3 — Context Building
Retrieved documents are formatted into a numbered, cited context block injected into the LLM prompt:

```
[1] [Quran 2:153]
O you who have believed, seek help through patience and prayer...

---

[2] [Bukhari #1400]
The Prophet (ﷺ) said: "No fatigue, illness, anxiety, sorrow...
```

### Step 4 — Guarded Generation
The LLM prompt has hard constraints baked in (see [lib/rag-chain.ts](lib/rag-chain.ts)):
- Must cite every claim with a reference tag
- Must not add information beyond the provided sources
- Must redirect fatwa questions to a scholar

### Step 5 — Post-generation Guardrails
After streaming, the full response is checked for fatwa patterns. If found, a disclaimer is appended to the SSE stream before `[DONE]`.

---

## 5. Guardrails System

The system has three independent gates in [lib/guardrails.ts](lib/guardrails.ts):

```
┌──────────────────────────────────────────────────────┐
│                   GUARDRAIL GATES                    │
│                                                      │
│  Gate 1 — checkSources()        [pre-generation]    │
│  ├─ sources.length ≥ 1                              │
│  ├─ top source similarity > 0.28                    │
│  └─ FAIL → return LOW_CONFIDENCE_RESPONSE           │
│             (no LLM call made — saves cost + time)  │
│                                                      │
│  Gate 2 — detectFatwas()        [post-generation]   │
│  ├─ regex: "it is permissible/forbidden/obligatory" │
│  ├─ regex: "you must / you should"                  │
│  ├─ regex: "sharia ruling / fatwa / fiqh ruling"    │
│  └─ MATCH → append SCHOLAR_REFERRAL disclaimer      │
│                                                      │
│  Gate 3 — groundingScore()      [post-generation]   │
│  ├─ word-overlap between answer and source texts    │
│  ├─ combined with retrieval similarity              │
│  └─ → confidence score 0.0–1.0 sent in SSE         │
└──────────────────────────────────────────────────────┘
```

**Confidence scoring formula:**
```
confidence = retrieval_similarity × 0.60
           + grounding_ratio      × 0.40
```

The mobile app should surface the confidence score to the user (e.g., "Answer based on 3 sources, confidence: 82%").

---

## 6. API Reference

### `POST /api/ask`

Streams an answer to an Islamic knowledge question via Server-Sent Events.

**Request:**
```json
{
  "query": "What does the Quran say about patience?",
  "language": "en",
  "source_types": ["quran", "hadith"],
  "top_k": 5
}
```

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `query` | string | Yes | — | Max 500 characters |
| `language` | `"en"` \| `"ar"` | No | `"en"` | Filter sources by language |
| `source_types` | array | No | all types | `"quran"`, `"hadith"`, `"tafsir"` |
| `top_k` | number | No | `5` | Max `8` (prompt budget limit) |

**Response:** `text/event-stream` — see [Section 7](#7-sse-event-stream-protocol)

**Error responses (JSON, not SSE):**
```json
{ "error": "query is required" }                     // 400
{ "error": "query must be ≤ 500 characters" }        // 400
{ "error": "Search service unavailable" }             // 503
```

---

### `POST /api/search`

Returns paginated raw search results without LLM generation. Use for browse/explore features.

**Request:**
```json
{
  "query": "sabr patience",
  "source_types": ["quran"],
  "language": "en",
  "page": 1,
  "page_size": 10
}
```

**Response:**
```json
{
  "results": [
    {
      "id": "uuid",
      "content": "Al-Baqarah (البقرة), Verse 153: O you who...",
      "metadata": {
        "source_type": "quran",
        "surah_number": 2,
        "surah_name": "Al-Baqarah",
        "verse_number": 153,
        "reference": "2:153"
      },
      "similarity": 0.87
    }
  ],
  "pagination": {
    "page": 1,
    "page_size": 10,
    "total": 23,
    "has_more": true
  }
}
```

---

### `GET /api/sources`

Returns the catalog of available source collections. **Cached for 1 hour** at the Vercel Edge.

**Response:**
```json
{
  "sources": {
    "quran": {
      "available": true,
      "document_count": 6236,
      "languages": ["en"]
    },
    "hadith": {
      "available": true,
      "document_count": 19800,
      "languages": ["en"],
      "collections": ["bukhari", "muslim", "abudawud", "tirmidhi"]
    },
    "tafsir": {
      "available": false,
      "document_count": 0,
      "languages": [],
      "authors": []
    }
  },
  "total_documents": 26036,
  "last_checked": "2026-06-02T10:00:00.000Z"
}
```

---

### `GET /api/health`

Liveness probe. Returns `200` when DB is reachable, `503` when degraded.

**Response (healthy):**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "database": {
    "status": "connected",
    "document_count": 26036
  },
  "latency_ms": 42,
  "timestamp": "2026-06-02T10:00:00.000Z"
}
```

**Response (degraded):**
```json
{
  "status": "degraded",
  "error": "Database unreachable",
  "latency_ms": 5001,
  "timestamp": "2026-06-02T10:00:00.000Z"
}
```

---

## 7. SSE Event Stream Protocol

The `/api/ask` endpoint streams events in this fixed order:

```
data: {"type":"sources", ...}     ← always first
data: {"type":"token", ...}       ← 0 to N times
data: {"type":"disclaimer", ...}  ← only if fatwa detected
data: {"type":"done", ...}        ← always last before [DONE]
data: [DONE]                      ← stream terminator
```

### Event Shapes

```typescript
// 1. Sources — arrives before any tokens
{
  type: "sources",
  sources: [{
    id: "uuid",
    metadata: { source_type, surah_number, verse_number, ... },
    similarity: 0.87,
    excerpt: "First 200 chars of the document..."
  }]
}

// 2. Token — one per LLM output chunk (~1-5 words each)
{
  type: "token",
  token: "The Quran states in "
}

// 3. Disclaimer — only sent when fatwa-like content is detected
{
  type: "disclaimer",
  message: "This topic involves religious rulings. Please consult a qualified Islamic scholar..."
}

// 4. Done — confidence is 0.0–1.0
{
  type: "done",
  confidence: 0.76
}

// 5. Error — replaces the sources/token/done sequence on failure
{
  type: "error",
  message: "No relevant sources were found for your query..."
}
```

### Flutter / Dart SSE Client Example

```dart
final client = http.Client();
final request = http.Request('POST', Uri.parse('$baseUrl/api/ask'));
request.headers['Content-Type'] = 'application/json';
request.body = jsonEncode({'query': userQuery});

final response = await client.send(request);
final stream = response.stream.transform(utf8.decoder).transform(const LineSplitter());

await for (final line in stream) {
  if (!line.startsWith('data: ') || line == 'data: [DONE]') continue;
  final json = jsonDecode(line.substring(6));

  switch (json['type']) {
    case 'sources':
      setState(() => sources = json['sources']);
    case 'token':
      setState(() => answer += json['token']);
    case 'disclaimer':
      setState(() => disclaimer = json['message']);
    case 'done':
      setState(() => confidence = json['confidence']);
    case 'error':
      setState(() => errorMessage = json['message']);
  }
}
```

---

## 8. Local Development Setup

### Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | ≥ 18.17 | [nodejs.org](https://nodejs.org) |
| npm | ≥ 9 | bundled with Node |
| Git | any | [git-scm.com](https://git-scm.com) |
| ts-node | latest | `npm install` (in devDeps) |

### Steps

```bash
# 1. Clone and install
git clone <repo-url> tazkia-ai-assistant
cd tazkia-ai-assistant
npm install

# 2. Configure environment
cp .env.local.example .env.local
# Fill in the 4 required values (see Section 12)

# 3. Set up Supabase (see Section 10) — must be done before running

# 4. Start dev server
npm run dev
# → http://localhost:3000

# 5. Test health endpoint
curl http://localhost:3000/api/health

# 6. Test a query
curl -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -d '{"query":"What does the Quran say about patience?"}' \
  --no-buffer
```

---

## 9. Data Ingestion Pipeline

The ingestion pipeline runs **locally once** (or incrementally when new sources are added). It never runs on Vercel.

### Data Sources (All Free)

| Source | API | Documents | Notes |
|---|---|---|---|
| Quran | [QuranCDN API](https://api.qurancdn.com) | 6,236 verses | Sahih International translation (ID 131) |
| Hadith | [fawazahmed0/hadith-api](https://github.com/fawazahmed0/hadith-api) | ~19,800 entries | Bukhari, Muslim, Abu Dawud, Tirmidhi |

### Running the Pipeline

```bash
# Ingest everything (Quran + all Hadith)
npm run ingest

# Ingest only Quran
npm run ingest:quran

# Ingest only Hadith
npm run ingest:hadith
```

### Pipeline Stages

```
1. Fetch raw text from free APIs
   ↓
2. chunkText() — 600-word chunks, 80-word overlap
   (prevents single verse/hadith from being cut mid-sentence)
   ↓
3. embedDocuments() — OpenAI batch embed (100 texts/call)
   Rate-limited: 300ms pause between batches
   ↓
4. supabase.insert() — 200 rows/DB batch
   ↓
5. REINDEX documents_embedding_idx  ← rebuild IVFFlat after bulk load
```

### Ingestion Time Estimates

| Source | Documents | Chunks | Embed Time | Upload Time |
|---|---|---|---|---|
| Quran | 6,236 | ~6,300 | ~3 min | ~2 min |
| Hadith (4 books) | ~19,800 | ~22,000 | ~10 min | ~6 min |
| **Total** | **~26,000** | **~28,300** | **~13 min** | **~8 min** |

### Post-ingestion: Rebuild Vector Index

After bulk insert, run this in the **Supabase SQL Editor** for best ANN search quality:

```sql
REINDEX INDEX documents_embedding_idx;
```

This is a one-time operation. Without it, the IVFFlat index was built on an empty table and needs to be rebuilt against the actual data distribution.

### Adding New Sources (e.g., Tafsir)

```typescript
// scripts/fetch-tafsir.ts  — create this file
export async function fetchTafsirDocuments(): Promise<ParsedDocument[]> {
  // Fetch from your source
  return [{
    content: "...",
    metadata: {
      source_type: 'tafsir',
      tafsir_name: 'Ibn Kathir',
      author: 'Ibn Kathir',
      surah_number: 1,
      verse_number: 1,
      reference: 'tafsir-ik:1:1',
    },
    source_type: 'tafsir',
    language: 'en',
  }];
}
```

Then add to `scripts/ingest.ts`:
```typescript
import { fetchTafsirDocuments } from './fetch-tafsir';
// ... inside main()
if (all || args.has('--tafsir')) {
  const docs = await fetchTafsirDocuments();
  await ingest(docs);
}
```

---

## 10. Supabase Setup (DevOps)

### Step 1 — Create Project

1. Go to [supabase.com](https://supabase.com) → **New project**
2. Choose a region close to your users (e.g., `ap-southeast-1` for Middle East/South Asia)
3. Note the database password — you'll need it if you connect via `psql` directly

### Step 2 — Run SQL Migrations

In **Supabase Dashboard → SQL Editor**, run these files in order:

```sql
-- File 1: supabase/schema.sql
-- Creates: documents table, indexes, hybrid_search() RPC, query_logs table

-- File 2: supabase/rls.sql
-- Enables RLS, adds read/write policies
```

> **Order matters.** RLS policies reference the tables created in schema.sql.

### Step 3 — Verify Setup

```sql
-- In SQL Editor, verify the hybrid_search function exists:
SELECT routine_name FROM information_schema.routines
WHERE routine_name = 'hybrid_search';

-- Verify RLS is enabled:
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';
-- Expected: documents → true, query_logs → true

-- Check indexes:
SELECT indexname FROM pg_indexes
WHERE tablename = 'documents';
-- Expected: documents_embedding_idx, documents_fts_idx, documents_metadata_idx
```

### Step 4 — Collect API Keys

Go to **Supabase Dashboard → Project Settings → API**:

| Key | Where Used | Exposure |
|---|---|---|
| **Project URL** | Both client + server | Public (safe) |
| **anon public key** | Frontend only (not used here) | Public (safe) |
| **service_role key** | Server only (`lib/supabase.ts`) | **SECRET — never expose** |

### Storage Limits (Free Tier)

| Item | Size | Budget Used |
|---|---|---|
| Quran embeddings (6.3K × 6KB) | ~38 MB | 7.6% |
| Hadith embeddings (19.8K × 6KB) | ~119 MB | 23.8% |
| Text content + metadata | ~15 MB | 3% |
| Indexes overhead | ~30 MB | 6% |
| **Total** | **~202 MB** | **~40%** |

This leaves ~300 MB headroom for Tafsir collections.

### Backup Strategy

Supabase free tier includes **daily backups retained for 7 days**. For the ingestion data specifically, the source scripts are idempotent — you can re-run them to repopulate from scratch. Keep your `.env.local` backed up securely.

---

## 11. Vercel Deployment (DevOps)

### Prerequisites

```bash
npm install -g vercel
vercel login   # authenticate with your Vercel account
```

### Step 1 — Add Environment Secrets

```bash
# Each command prompts for the value
vercel env add NEXT_PUBLIC_SUPABASE_URL        production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY   production
vercel env add SUPABASE_SERVICE_ROLE_KEY       production
vercel env add OPENAI_API_KEY                  production

# These have defaults in vercel.json but can be overridden:
vercel env add OPENAI_MODEL      production   # default: gpt-4o-mini
vercel env add RATE_LIMIT_RPM    production   # default: 20
```

> Add the same vars to `preview` and `development` environments if needed:
> `vercel env add VAR_NAME preview`

### Step 2 — Deploy

```bash
# Preview deploy (for testing)
vercel

# Production deploy
vercel --prod
```

Output: `https://tazkia-ai-assistant.vercel.app` (or your custom domain)

### Step 3 — Verify Deployment

```bash
# Health check
curl https://your-app.vercel.app/api/health

# Full query test
curl -X POST https://your-app.vercel.app/api/ask \
  -H "Content-Type: application/json" \
  -d '{"query":"What is the meaning of Surah Al-Fatiha?"}' \
  --no-buffer
```

### Step 4 — Custom Domain (Optional)

In **Vercel Dashboard → Project → Domains** → add your domain (e.g., `api.tazkia365.com`). Vercel handles SSL automatically.

Update the mobile app's base URL to the custom domain.

### Continuous Deployment

Vercel auto-deploys on every push to `main`. Configure branch protection rules in GitHub so only reviewed PRs merge to `main`.

### Function Limits (Free Tier)

| Limit | Value | Impact |
|---|---|---|
| Max function duration | 10 seconds | Set in `vercel.json` + `maxDuration` export |
| Invocations/month | 100,000 | ~3,333/day — sufficient for MVP |
| Bandwidth/month | 100 GB | Streaming responses are small (~5 KB each) |
| Edge Middleware | 1 MB bundle size | Our middleware is well under this |

### Rollback

```bash
# List deployments
vercel ls

# Promote a previous deployment to production
vercel promote <deployment-url>
```

---

## 12. Environment Variables Reference

All variables go in `.env.local` for development, and as Vercel secrets for production.

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL (safe to expose) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key (safe to expose) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | **Secret.** Never expose client-side. |
| `OPENAI_API_KEY` | Yes | **Secret.** Your OpenAI API key. |
| `OPENAI_MODEL` | No | LLM model name. Default: `gpt-4o-mini` |
| `RATE_LIMIT_RPM` | No | Requests per IP per minute. Default: `20` |
| `NEXT_PUBLIC_APP_URL` | No | App URL for CORS. Default: `*` |

### Security Notes

- `SUPABASE_SERVICE_ROLE_KEY` bypasses all RLS policies — treat it like a database root password
- `OPENAI_API_KEY` — set a monthly spend limit in your OpenAI dashboard (recommended: $20)
- Neither secret is ever accessed client-side; both are used only in Edge Runtime API routes

---

## 13. Performance & Free Tier Limits

### Vercel Cold Start Mitigation

The API routes use `export const runtime = 'edge'` which means:
- Edge Runtime (not Node.js) — starts in ~5ms vs ~500ms for Node
- No filesystem access — all dependencies must be edge-compatible
- LangChain.js is compatible; heavy Node-only packages are excluded via `next.config.ts`

### Timeout Budget Breakdown (10s Vercel limit)

```
Query rewrite (LLM)       ~200ms
Dual embedding            ~300ms
Hybrid search (SQL RPC)   ~100ms
LLM stream (first token)  ~800ms
LLM stream (total)        ~4-6s
Guardrail checks          ~10ms
SSE overhead              ~20ms
─────────────────────────────────
Total                     ~6-8s  ← safely under 10s
```

### Supabase Query Performance

For 26,000 documents with `lists=100` IVFFlat index:
- Vector ANN search: ~20-50ms
- Full-text search: ~10-30ms
- Hybrid RPC (both): ~80-120ms

If response time degrades, increase `lists` in the IVFFlat index:
```sql
DROP INDEX documents_embedding_idx;
CREATE INDEX documents_embedding_idx
  ON documents USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 200);
```

### Free Tier Guardrails

| Service | Limit | Current Usage | Buffer |
|---|---|---|---|
| Supabase DB | 500 MB | ~202 MB | 60% remaining |
| Supabase egress | 2 GB/month | ~1 KB/query × 3K queries = 3 MB | 99%+ remaining |
| Vercel invocations | 100K/month | 3,333/day capacity | — |
| Vercel bandwidth | 100 GB/month | ~5 KB/response | Negligible |

---

## 14. Cost Breakdown

### One-time Ingestion Cost

| Task | Tokens | Cost |
|---|---|---|
| Quran embedding (6.3K chunks) | ~50K | $0.001 |
| Hadith embedding (22K chunks) | ~750K | $0.015 |
| **Total ingestion** | **~800K** | **~$0.02** |

### Monthly Operational Cost (1,000 queries)

| Service | Detail | Monthly Cost |
|---|---|---|
| Vercel | Free tier | $0.00 |
| Supabase | Free tier | $0.00 |
| OpenAI Embeddings | 1K queries × 2 embeds × ~100 tokens × $0.02/1M | ~$0.004 |
| OpenAI Query Rewrite | 1K × ~150 tokens in/out × $0.15/$0.60 per 1M | ~$0.001 |
| OpenAI gpt-4o-mini | 1K queries × ~1.5K tokens in × $0.15/1M | ~$0.23 |
| OpenAI gpt-4o-mini | 1K queries × ~600 tokens out × $0.60/1M | ~$0.36 |
| **Total** | | **~$0.60/month** |

### Scaling Cost

| Monthly Queries | Est. Cost |
|---|---|
| 1,000 | ~$0.60 |
| 5,000 | ~$3.00 |
| 10,000 | ~$6.00 |
| 50,000 | ~$30 + Vercel Pro ($20) |

> Switch to `gpt-3.5-turbo` to halve LLM costs if needed. Switch to `gpt-4o` for better quality at ~10× the cost.

---

## 15. Monitoring & Observability

### Built-in: Query Logs

Every successful `/api/ask` call is logged to `query_logs`:

```sql
-- Most common queries
SELECT query, COUNT(*), AVG(confidence), AVG(response_time_ms)
FROM query_logs
GROUP BY query
ORDER BY COUNT(*) DESC
LIMIT 20;

-- Low-confidence queries (potential gaps in knowledge base)
SELECT query, confidence, sources_found, created_at
FROM query_logs
WHERE confidence < 0.5
ORDER BY created_at DESC;

-- Response time percentiles
SELECT
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY response_time_ms) AS p50,
  PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY response_time_ms) AS p90,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY response_time_ms) AS p99
FROM query_logs
WHERE created_at > now() - INTERVAL '24 hours';
```

### Vercel Dashboard

- **Functions** tab → invocation count, error rate, duration p50/p99
- **Analytics** tab → request volume, bandwidth (enable Vercel Analytics for free)

### Health Check Integration

Point your uptime monitor (UptimeRobot free tier, BetterStack free, etc.) at:
```
GET https://your-app.vercel.app/api/health
Expected: { "status": "ok" }  HTTP 200
```

### Alerts to Set Up

| Alert | Threshold | Action |
|---|---|---|
| Health check fails | Any 503 | Investigate Supabase status |
| OpenAI spend | $15/month | Review query volume |
| Supabase DB size | 400 MB | Plan ingestion freeze or Tafsir trim |
| Vercel invocations | 80K/month | Tighten rate limiting |

---

## 16. Troubleshooting

### "hybrid_search RPC failed"

```
Cause:  The hybrid_search function doesn't exist in Supabase yet.
Fix:    Run supabase/schema.sql in Supabase SQL Editor.
Check:  SELECT routine_name FROM information_schema.routines
        WHERE routine_name = 'hybrid_search';
```

### "No relevant sources were found"

```
Cause A: Database is empty — ingestion hasn't been run.
Fix A:   npm run ingest

Cause B: Vector index built before data was inserted.
Fix B:   REINDEX INDEX documents_embedding_idx;  (in SQL Editor)

Cause C: Query is unrelated to Islamic knowledge.
Fix C:   Expected behavior — the guardrail is working correctly.
```

### Cold start timeout (first request after idle)

```
Cause:  Edge functions still have a warm-up period on first request.
Fix:    Set up a cron ping to /api/health every 5 minutes
        (use UptimeRobot free tier monitor).
Note:   Edge Runtime cold starts are ~5ms — timeout is likely Supabase
        connection establishment (~200ms on first connection).
```

### SSE stream cuts off mid-response

```
Cause A: Vercel 10s limit hit.
Fix A:   Reduce top_k (fewer sources = shorter context = faster LLM).
         Or switch OPENAI_MODEL to gpt-3.5-turbo (faster generation).

Cause B: OpenAI timeout (8.5s set in rag-chain.ts).
Fix B:   Already handled — response will include partial tokens
         followed by an error event.
```

### Rate limit errors from OpenAI during ingestion

```
Cause:  OpenAI tier-1 limit is 3,500 RPM / 1M TPM for embeddings.
Fix:    Increase the delay in scripts/ingest.ts:
        await new Promise((r) => setTimeout(r, 600)); // 600ms instead of 300ms
```

### Supabase RLS blocking API calls

```
Cause:  Using the anon key instead of service_role key in lib/supabase.ts.
Fix:    Verify SUPABASE_SERVICE_ROLE_KEY is set in .env.local / Vercel env.
Check:  console.log(process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 10))
        Should print "eyJhbGciO" (start of a JWT), not undefined.
```

### IVFFlat index not used by planner

```
Cause:  PostgreSQL query planner skips IVFFlat when the table has too few rows
        (it prefers a sequential scan for < ~1000 rows).
Fix:    This resolves itself once the full ingestion is complete.
        Force index use during testing:
        SET enable_seqscan = off;  -- in SQL Editor only, for debugging
```

---

## Non-Negotiable Design Principles

1. **No fatwas** — if fatwa patterns are detected post-generation, a scholar referral disclaimer is appended. The LLM prompt also instructs the model to redirect such questions.

2. **No hallucination** — Gate 1 blocks the LLM call entirely if retrieved sources are insufficient. The LLM prompt forbids adding information beyond the provided context.

3. **Every answer is cited** — the LLM prompt requires citation tags (`[Quran 2:255]`, `[Bukhari #1]`) for every factual claim. Sources are also sent to the client as structured metadata before tokens stream.

4. **Confidence transparency** — every successful response includes a `confidence` score (0–1) computed from retrieval similarity and answer grounding. The mobile app should display this.

5. **Sources first** — the `sources` SSE event is sent before any tokens. The mobile app can show "Searching in Quran and Hadith..." while the LLM warms up.

---

*Built by the Tazkia365 team. For questions, open an issue or contact the backend team.*
