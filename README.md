# Tazkia AI — Islamic Knowledge Intelligence Platform

> *The world's most comprehensive AI-powered Islamic knowledge system — grounded in authentic scholarship, designed for the modern Muslim.*

A production-grade **Retrieval-Augmented Generation (RAG)** platform that answers Islamic questions using **only** verified, authenticated sources — Quran, Hadith, Tafsir, and Fiqh. Zero hallucination by design. Real-time streaming. Fully cited.

Built on **Vercel + Supabase + Jina AI + Gemini** — serverless, scalable, and deployable globally in minutes.

---

## Vision

Islamic scholarship spans over 1,400 years and millions of pages of authenticated texts. Today, that knowledge is scattered across libraries, difficult to search, and inaccessible to most Muslims worldwide. Tazkia AI is on a mission to change that.

We are building the **definitive Islamic knowledge retrieval engine** — starting with the Quran, Sunnah, and Tafsir, and expanding to cover the complete corpus of authenticated Islamic literature: all major Hadith collections, all four schools of Fiqh, classical Aqeedah, Seerah, and beyond. Every answer grounded. Every claim cited. Every response transparent.

---

## Table of Contents

1. [What's Indexed Today](#1-whats-indexed-today)
2. [Knowledge Base Roadmap](#2-knowledge-base-roadmap)
3. [Architecture Overview](#3-architecture-overview) — System Context · Query Sequence · Ingestion Flow · DB Schema · SSE Timeline · Module Map · Security
4. [Tech Stack](#4-tech-stack)
5. [RAG Pipeline — How It Works](#5-rag-pipeline--how-it-works)
6. [Guardrails System](#6-guardrails-system)
7. [API Reference](#7-api-reference)
8. [SSE Event Stream Protocol](#8-sse-event-stream-protocol)
9. [Local Development Setup](#9-local-development-setup)
10. [Data Ingestion Pipeline](#10-data-ingestion-pipeline)
11. [Supabase Setup](#11-supabase-setup)
12. [Vercel Deployment](#12-vercel-deployment)
13. [Environment Variables](#13-environment-variables)
14. [Performance & Scalability](#14-performance--scalability)
15. [Monitoring & Observability](#15-monitoring--observability)
16. [Troubleshooting](#16-troubleshooting)
17. [Design Principles](#17-design-principles)

---

## 1. What's Indexed Today

**44,193+ documents** embedded into a 1,024-dimensional vector space using Jina AI v3.

| Source | Collection | Documents | Coverage |
|---|---|---|---|
| **Quran** | Sahih International | 6,236 | 100% — all 114 Surahs, every ayah |
| **Hadith** | Sahih al-Bukhari | ~7,563 | Complete |
| **Hadith** | Sahih Muslim | ~7,470 | Complete |
| **Hadith** | Sunan Abu Dawud | ~5,274 | Complete |
| **Hadith** | Jami at-Tirmidhi | ~3,956 | Complete |
| **Hadith** | Sunan Ibn Majah | ~4,341 | Complete |
| **Hadith** | Sunan an-Nasai | ~5,758 | Complete |
| **Hadith** | Muwatta Malik | ~1,395 | Complete |
| **Tafsir** | Tafsir Ibn Kathir | ~6,200 | Every ayah, abridged English |
| | | **~44,193+** | |

**System metrics:**
- `~5M` tokens embedded into the vector database
- `1,024` embedding dimensions (Jina AI v3 — multilingual, 8k context window)
- `<500ms` average search latency (IVFFlat ANN + BM25 hybrid)
- `100%` of answers cited — no unsourced claims ever generated

---

## 2. Knowledge Base Roadmap

This is where Tazkia AI is going. Each phase expands the authenticated knowledge base and deepens the system's ability to serve Islamic scholarship.

### Phase 2 — Extended Hadith & Tafsir *(Next)*

| Source | Author | Est. Documents | Notes |
|---|---|---|---|
| Musnad Ahmad ibn Hanbal | Imam Ahmad | ~27,000+ | Largest classical Hadith collection |
| Sahih Ibn Hibban | Ibn Hibban | ~7,500 | Graded Sahih, widely referenced |
| Sahih Ibn Khuzaymah | Ibn Khuzaymah | ~3,000 | High-grade fiqh-related hadiths |
| Bulugh al-Maram | Ibn Hajar al-Asqalani | ~1,600 | Essential fiqh hadith reference |
| Riyad al-Salihin | Imam Nawawi | ~1,900 | Most widely read hadith compilation |
| Al-Adab al-Mufrad | Imam Bukhari | ~1,300 | Hadith on character and manners |
| Tafsir al-Tabari | Imam al-Tabari | ~10,000+ | The foundational classical tafsir |
| Tafsir al-Sa'di | Sheikh al-Sa'di | ~6,200 | Modern, accessible, widely trusted |

### Phase 3 — Fiqh (Islamic Jurisprudence) *(High Priority)*

The four major schools of Islamic law — all authenticated, covering every major topic of worship, transactions, family law, ethics, and daily life.

| Source | School | Author | Topic Coverage |
|---|---|---|---|
| **Reliance of the Traveller** *(Umdat al-Salik)* | Shafi'i | Ibn Naqib al-Misri | Complete Shafi'i manual — worship, family, transactions |
| **Al-Hidayah** | Hanafi | al-Marghinani | Comprehensive Hanafi fiqh |
| **Mukhtasar Khalil** | Maliki | Khalil ibn Ishaq | Core Maliki jurisprudence |
| **Al-Mughni** | Hanbali | Ibn Qudamah | Authoritative Hanbali reference |
| **Bidayat al-Mujtahid** | Cross-madhab | Ibn Rushd (Averroes) | Comparative fiqh across all schools |
| **Fiqh al-Sunnah** | Cross-madhab | Sayyid Sabiq | Widely-read accessible fiqh |
| **Al-Fiqh al-Islami wa Adillatuhu** | Cross-madhab | Wahbah al-Zuhayli | Modern encyclopedic reference (8 vols) |

### Phase 4 — Aqeedah, Seerah & Classical Scholarship *(Long-term)*

| Source | Author | Category |
|---|---|---|
| Al-Aqeedah al-Wasitiyyah | Ibn Taymiyyah | Creed / Theology |
| Al-Aqeedah al-Tahawiyyah | Imam al-Tahawi | Creed — cross-school consensus |
| Lum'at al-I'tiqad | Ibn Qudamah | Hanbali creed |
| Al-Aqeedah al-Sanusiyyah | Imam al-Sanusi | Ash'ari theology |
| Sirat Ibn Hisham | Ibn Hisham | Seerah (Prophetic biography) |
| Al-Rahiq al-Makhtum *(Sealed Nectar)* | Safiur-Rahman Mubarakpuri | Seerah — award-winning biography |
| Zad al-Ma'ad | Ibn al-Qayyim | Prophetic guidance for daily life |
| Al-Wabilus Sayyib | Ibn al-Qayyim | Remembrance and du'a |

### Phase 5 — Arabic Language & Multilingual *(Future)*

- Full Arabic text of all sources alongside English translations
- Arabic query support — search in Arabic script directly
- Urdu translations for South Asian users
- Indonesian / Malay for Southeast Asian markets
- Turkish for the Turkish-speaking world

> **Target:** 500,000+ authenticated Islamic documents across all phases — the most comprehensive Islamic AI knowledge base ever built.

---

## 3. Architecture Overview

### 3.1 — System Context

```
╔══════════════════════════════════════════════════════════════════╗
║                     TAZKIA AI PLATFORM                          ║
║          Serverless · Streaming · 44,193+ Documents             ║
╚══════════════════════════════════════════════════════════════════╝

  ┌───────────────────────────────────────────────────────────┐
  │  CLIENTS                                                  │
  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐  │
  │  │  Web Browser │  │  Flutter App │  │  API Consumer  │  │
  │  │  (Next.js)   │  │  (Tazkia365) │  │  (3rd party)   │  │
  │  └──────┬───────┘  └──────┬───────┘  └───────┬────────┘  │
  └─────────╪─────────────────╪──────────────────╪───────────┘
            │                 │                  │
            └─────────────────┴──────────────────┘
                              │  HTTPS
                              ▼
  ┌───────────────────────────────────────────────────────────┐
  │  VERCEL EDGE NETWORK                                      │
  │                                                           │
  │  middleware.ts  (runs at the edge, every region)          │
  │  ├─ IP sliding window → 20 req / 60s per IP              │
  │  ├─ CORS headers                                          │
  │  └─ passes to Node.js runtime ↓                          │
  │                                                           │
  │  Next.js 14 App Router  (Node.js runtime, maxDuration=30s)│
  │  ├─ POST /api/ask      → SSE stream                       │
  │  ├─ POST /api/search   → JSON (paginated)                 │
  │  ├─ GET  /api/sources  → JSON (cached 1h at edge)         │
  │  └─ GET  /api/health   → JSON liveness probe              │
  └──────────┬──────────────────┬──────────────────┬─────────┘
             │                  │                  │
             ▼                  ▼                  ▼
  ┌──────────────┐   ┌──────────────────┐  ┌──────────────┐
  │   JINA AI    │   │  SUPABASE        │  │  GOOGLE AI   │
  │              │   │  PostgreSQL      │  │              │
  │  v3 embed    │   │  + pgvector      │  │  Gemini 2.0  │
  │  1,024-dim   │   │  44,193+ docs    │  │  Flash       │
  │  8k context  │   │  hybrid_search() │  │  streaming   │
  └──────────────┘   └──────────────────┘  └──────────────┘

  LOCAL MACHINE ONLY  (never runs on Vercel)
  ┌───────────────────────────────────────────────────────────┐
  │  scripts/  — one-time ingestion, run by developer         │
  │  ├─ fetch-quran.ts    → QuranCDN free API                 │
  │  ├─ fetch-hadith.ts   → fawazahmed0 CDN                   │
  │  ├─ fetch-tafsir.ts   → IslamicStudies.info API           │
  │  └─ ingest.ts         → embed + bulk upload to Supabase   │
  └───────────────────────────────────────────────────────────┘
```

---

### 3.2 — Query Lifecycle Sequence  (`POST /api/ask`)

This is the complete sequence for every AI answer request, from the moment the user presses Ask to the last token arriving in the browser.

```
CLIENT                VERCEL EDGE        NODE.JS ROUTE       JINA AI    SUPABASE    GEMINI
  │                       │                    │                 │           │          │
  │── POST /api/ask ──────►│                    │                 │           │          │
  │   { query, top_k }    │                    │                 │           │          │
  │                       │─ rate limit check ─►                 │           │          │
  │                       │  (20 req/min/IP)   │                 │           │          │
  │◄─ 429 Too Many ───────│  [if exceeded]     │                 │           │          │
  │                       │                    │                 │           │          │
  │                       │── pass ────────────►                 │           │          │
  │◄══ SSE connection open ════════════════════│                 │           │          │
  │                       │                    │                 │           │          │
  │  ── ── ── ── ── ── STEP 1: Query Rewrite (~200ms) ── ── ── ── ── ── ── ── ── ──   │
  │◄─ {pipeline:1 active} ─────────────────────│                 │           │          │
  │                       │                    │──rewriteQuery()─────────────────────────►
  │                       │                    │                 │           │   rewrite │
  │                       │                    │◄─ "sabr, tawakkul, patience in Quran" ──│
  │◄─ {pipeline:1 done}  ──────────────────────│                 │           │          │
  │                       │                    │                 │           │          │
  │  ── ── ── ── ── ── STEP 2: Dual Embedding (~300ms) ── ── ── ── ── ── ── ── ── ──  │
  │◄─ {pipeline:2 active} ─────────────────────│                 │           │          │
  │                       │                    │── embedQuery(original) ─────►          │
  │                       │                    │── embedQuery(rewritten) ────►          │
  │                       │                    │◄── [vec_orig 1024-dim] ──────│          │
  │                       │                    │◄── [vec_rewr 1024-dim] ──────│          │
  │                       │                    │  avg = (vec_orig + vec_rewr) / 2        │
  │◄─ {pipeline:2 done}  ──────────────────────│                 │           │          │
  │                       │                    │                 │           │          │
  │  ── ── ── ── ── ── STEP 3: Hybrid Search (~100ms) ── ── ── ── ── ── ── ── ── ──   │
  │◄─ {pipeline:3 active} ─────────────────────│                 │           │          │
  │                       │                    │──── hybrid_search(avg_vec, query_text) ►│
  │                       │                    │     cosine×0.70 + bm25×0.30 │          │
  │                       │                    │◄─── [doc1..doc5, similarity] ───────────│
  │◄─ {pipeline:3 done}  ──────────────────────│                 │           │          │
  │                       │                    │                 │           │          │
  │  ── ── ── ── ── ── STEP 4: RAG Assembly + Gate 1 ── ── ── ── ── ── ── ── ── ──    │
  │◄─ {pipeline:4 active} ─────────────────────│                 │           │          │
  │                       │                    │  checkSources() — Gate 1    │          │
  │                       │                    │  ├─ sources.length ≥ 1      │          │
  │                       │                    │  └─ top similarity > 0.28   │          │
  │◄─ {pipeline:4 done}  ──────────────────────│                 │           │          │
  │◄─ {sources: [...]}  ───────────────────────│  sources event before any tokens       │
  │                       │                    │                 │           │          │
  │  ── ── ── ── ── ── STEP 5: LLM Streaming (~2–8s) ── ── ── ── ── ── ── ── ── ──   │
  │◄─ {pipeline:5 active} ─────────────────────│                 │           │          │
  │                       │                    │── streamAnswer(query, ctx) ───────────►│
  │◄─ {token:"The "}  ─────────────────────────│◄── token ────────────────────────────│
  │◄─ {token:"Quran "} ────────────────────────│◄── token ────────────────────────────│
  │◄─ {token:"states"} ────────────────────────│   ... N tokens ...          │         │
  │◄─ {pipeline:5 done}  ──────────────────────│                 │           │          │
  │                       │                    │                 │           │          │
  │  ── ── ── ── ── ── Post-generation Guardrails ── ── ── ── ── ── ── ── ── ── ──    │
  │◄─ {disclaimer}  ───────────────────────────│  detectFatwas() Gate 2 (if triggered)  │
  │◄─ {done: confidence} ──────────────────────│  groundingScore() Gate 3               │
  │◄─ [DONE] ──────────────────────────────────│                 │           │          │
  │                       │                    │                 │           │          │
  │                       │                    │── query_logs.insert() ──────►          │
  │                       │                    │   (fire-and-forget, async)  │          │
```

**Error paths:**

```
Gate 1 FAIL (no sources / low confidence):
  pipeline:4 done → {error: "No relevant sources…"} → [DONE]
  LLM is never called — no hallucination risk.

Rate limit exceeded:
  Edge middleware → 429 JSON → connection closed immediately.

Gemini timeout / error:
  {error: "An error occurred…"} → [DONE]
```

---

### 3.3 — Ingestion Pipeline Flow

Run once per source on a local machine. Never touches Vercel.

```
  ┌─────────────────────────────────────────────────────────────────┐
  │  npm run ingest[:quran|:hadith|:tafsir]                         │
  └───────────────────────────┬─────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │ fetch-quran  │  │ fetch-hadith │  │ fetch-tafsir │
    │              │  │              │  │              │
    │ QuranCDN API │  │ fawazahmed0  │  │ IslamicStudies│
    │ 6,236 ayahs  │  │ 7 books CDN  │  │ .info API    │
    │              │  │              │  │              │
    │ 1 doc        │  │ 1 doc        │  │ 1 doc        │
    │ per verse    │  │ per hadith   │  │ per verse    │
    └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
           └─────────────────┴─────────────────┘
                              │
                              ▼ ParsedDocument[]
  ┌─────────────────────────────────────────────────────────────────┐
  │  chunkText()                                                    │
  │                                                                 │
  │  IF doc.content.length > 800 words:                             │
  │    → split at 600-word boundaries, 80-word overlap             │
  │  ELSE:                                                          │
  │    → keep as single document (hadiths, short verses)           │
  └───────────────────────────┬─────────────────────────────────────┘
                              │ chunked Document[]
                              ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  embedDocuments()   [Jina AI v3]                                │
  │                                                                 │
  │  batch of 100 texts per API call                               │
  │  → POST https://api.jina.ai/v1/embeddings                      │
  │  → model: jina-embeddings-v3                                   │
  │  → task: retrieval.passage                                     │
  │  → dimensions: 1024                                            │
  │  ← float32[1024] per document                                  │
  │                                                                 │
  │  retry on 429: exponential backoff (1s, 2s, 4s)               │
  └───────────────────────────┬─────────────────────────────────────┘
                              │ { content, embedding, metadata }[]
                              ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  supabase.insert()  [Supabase service_role]                     │
  │                                                                 │
  │  batch of 200 rows per INSERT                                  │
  │  upsert: false (insert only — dedup by content_hash)           │
  │  table: documents                                              │
  └───────────────────────────┬─────────────────────────────────────┘
                              │
                              ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  REINDEX INDEX documents_embedding_idx                          │
  │                                                                 │
  │  IVFFlat index must be rebuilt after bulk load.                │
  │  Run once in Supabase SQL Editor after each ingestion batch.   │
  └─────────────────────────────────────────────────────────────────┘
```

---

### 3.4 — Database Architecture

```
╔═══════════════════════════════════════════════════════════════════╗
║  TABLE: documents                                                 ║
╠═══════════════════════════════════════════════════════════════════╣
║  id           UUID          PRIMARY KEY  DEFAULT gen_random_uuid()║
║  content      TEXT          NOT NULL   ← full source text         ║
║  embedding    vector(1024)  NOT NULL   ← Jina AI v3 float32       ║
║  metadata     JSONB         NOT NULL   ← source-specific fields   ║
║  source_type  TEXT          NOT NULL   ← quran/hadith/tafsir/fiqh ║
║  language     TEXT          DEFAULT 'en'                          ║
║  created_at   TIMESTAMPTZ   DEFAULT now()                         ║
╠═══════════════════════════════════════════════════════════════════╣
║  INDEXES                                                          ║
║                                                                   ║
║  documents_embedding_idx                                          ║
║    USING ivfflat (embedding vector_cosine_ops)                    ║
║    WITH (lists = 100)                                             ║
║    → approximate nearest-neighbour search                         ║
║    → probes = 10 at query time (set via SET ivfflat.probes = 10)  ║
║                                                                   ║
║  documents_fts_idx                                                ║
║    USING gin (to_tsvector('english', content))                    ║
║    → PostgreSQL full-text search, BM25 ranking                    ║
║                                                                   ║
║  documents_metadata_idx                                           ║
║    USING gin (metadata)                                           ║
║    → fast filter by source_type, book, surah_number, etc.         ║
╠═══════════════════════════════════════════════════════════════════╣
║  METADATA SHAPES                                                  ║
║                                                                   ║
║  quran:   { surah_number, surah_name, verse_number,               ║
║             juz_number, page_number }                             ║
║                                                                   ║
║  hadith:  { book, hadith_number, chapter, grade,                  ║
║             narrator_chain }                                      ║
║                                                                   ║
║  tafsir:  { reference, tafsir_name, author,                       ║
║             surah_number, verse_number }                          ║
║                                                                   ║
║  fiqh:    { book_name, author, school, chapter,                   ║
║             section, reference }                                  ║
╚═══════════════════════════════════════════════════════════════════╝

╔═══════════════════════════════════════════════════════════════════╗
║  TABLE: query_logs                                                ║
╠═══════════════════════════════════════════════════════════════════╣
║  id               UUID         PRIMARY KEY                        ║
║  query            TEXT         ← user's original query            ║
║  sources_found    INTEGER      ← retrieved document count         ║
║  confidence       FLOAT        ← grounding confidence 0.0–1.0     ║
║  response_time_ms INTEGER      ← total pipeline duration ms       ║
║  created_at       TIMESTAMPTZ  DEFAULT now()                      ║
╚═══════════════════════════════════════════════════════════════════╝

╔═══════════════════════════════════════════════════════════════════╗
║  FUNCTION: hybrid_search(...)   [PostgreSQL RPC]                  ║
╠═══════════════════════════════════════════════════════════════════╣
║  Parameters:                                                      ║
║    query_text          TEXT         ← for BM25 full-text          ║
║    query_embedding     vector(1024) ← for cosine similarity       ║
║    source_types        TEXT[]       ← filter, NULL = all          ║
║    lang                TEXT         ← filter, NULL = all          ║
║    match_count         INT          ← top-k                       ║
║    similarity_threshold FLOAT       ← default 0.25                ║
║                                                                   ║
║  Score formula:                                                   ║
║    score = (1 - (embedding <=> query_embedding)) × 0.70           ║
║          + ts_rank(to_tsvector(content), query) × 0.30            ║
║                                                                   ║
║  Returns rows WHERE score >= similarity_threshold                 ║
║  ORDER BY score DESC LIMIT match_count                            ║
╚═══════════════════════════════════════════════════════════════════╝
```

**Why IVFFlat over exact search:**
Exact cosine search over 44,193 vectors takes ~300ms. IVFFlat (lists=100, probes=10) scans ~10% of clusters and returns in ~30ms with 95%+ recall. At 500K+ documents (Phase 4), switch to HNSW for better recall at scale.

---

### 3.5 — SSE Event Timeline

Each `POST /api/ask` produces this exact sequence of events on the stream:

```
 Time →  0ms        200ms       500ms      600ms      700ms      2–8s         ~8s
          │           │           │          │          │          │            │
          ▼           ▼           ▼          ▼          ▼          ▼            ▼

pipeline  ●active─────●done
step 1    [Query Rewrite · Gemini AI]

pipeline              ●active────────────────●done
step 2                [Vector Embed · Jina AI × 2 averaged]

pipeline                                     ●active───●done
step 3                                       [Hybrid Search · Supabase RPC]

pipeline                                                ●active───●done
step 4                                                  [RAG Assembly · Gate 1]

sources                                                            ●──────────── (1 event)
event                                                              [doc1..doc5 full text]

pipeline                                                           ●active──────────────●done
step 5                                                             [AI Generation · Gemini]

tokens                                                             ●tok●tok●tok●tok●tok●tok●

disclaimer                                                                                ◇
                                                                              (if fatwa detected)

done                                                                                      ●
event                                                                          { confidence: 0.76 }

[DONE]                                                                                    ■
                                                                                  stream closed
```

**Key invariants:**
- `sources` event always arrives **before** any `token` events — UI can show cited sources while the answer streams
- `pipeline` step N `done` always arrives before step N+1 `active`
- `disclaimer` only appears when `detectFatwas()` returns `true`
- `[DONE]` terminates the stream — client should close the connection after this

---

### 3.6 — Code Module Map

```
app/
├── page.tsx              ← UI: HeroSearch, SourceCard, PipelineViz, stats strip
├── globals.css           ← dark theme CSS variables + keyframe animations
└── api/
    ├── ask/route.ts      ← SSE streaming RAG endpoint (the core)
    ├── search/route.ts   ← paginated semantic search, no LLM
    ├── sources/route.ts  ← source catalog, cached 1h at Vercel edge
    └── health/route.ts   ← liveness probe

lib/
├── rag-chain.ts          ← rewriteQuery(), formatContext(), streamAnswer()
│                            PIPELINE_STEPS constant
├── vectorstore.ts        ← hybridSearch() — calls Supabase hybrid_search RPC
├── embeddings.ts         ← getEmbeddings() lazy singleton → Jina AI v3
├── supabase.ts           ← getSupabaseAdmin() lazy singleton → service_role client
├── guardrails.ts         ← checkSources(), detectFatwas(), groundingScore(),
│                            computeConfidence(), SCHOLAR_REFERRAL
├── detect-source.ts      ← detectSourceTypes() — infers quran/hadith/tafsir
│                            from query keywords when no filter is set
└── types.ts              ← AskRequest, SearchRequest, SSEEvent, SourceType

scripts/  (local dev only — never deployed)
├── ingest.ts             ← orchestrator: parse args, call fetchers, embed, upload
├── fetch-quran.ts        ← QuranCDN API → ParsedDocument[]
├── fetch-hadith.ts       ← fawazahmed0 CDN (7 books) → ParsedDocument[]
└── fetch-tafsir.ts       ← IslamicStudies.info API → ParsedDocument[]

middleware.ts             ← Vercel edge: IP rate limiting, CORS

supabase/
├── schema.sql            ← CREATE TABLE documents, query_logs, indexes,
│                            hybrid_search() RPC
└── rls.sql               ← Row Level Security policies

Call graph for POST /api/ask:
  route.ts
    → rewriteQuery()         [rag-chain.ts → Gemini API]
    → getEmbeddings()        [embeddings.ts → Jina AI API]
    → hybridSearch()         [vectorstore.ts → Supabase RPC]
    → checkSources()         [guardrails.ts]
    → formatContext()        [rag-chain.ts]
    → streamAnswer()         [rag-chain.ts → Gemini API stream]
    → detectFatwas()         [guardrails.ts]
    → groundingScore()       [guardrails.ts]
    → computeConfidence()    [guardrails.ts]
    → getSupabaseAdmin()     [supabase.ts → query_logs insert]
```

---

### 3.7 — Security Boundary

```
  PUBLIC (safe to expose in client code / browser)
  ┌─────────────────────────────────────────────────────────────┐
  │  NEXT_PUBLIC_SUPABASE_URL         project URL               │
  │  NEXT_PUBLIC_SUPABASE_ANON_KEY    read-only, RLS enforced   │
  └─────────────────────────────────────────────────────────────┘

  SECRET (server-only — never in client bundles)
  ┌─────────────────────────────────────────────────────────────┐
  │  SUPABASE_SERVICE_ROLE_KEY   bypasses RLS — DB root equiv.  │
  │  GOOGLE_API_KEY              Gemini + query rewrite access  │
  │  JINA_API_KEY                embedding generation access    │
  └─────────────────────────────────────────────────────────────┘
  Only accessed in:  lib/supabase.ts  lib/embeddings.ts
                     lib/rag-chain.ts  (all server-side only)

  ENFORCEMENT
  ├─ Next.js: NEXT_PUBLIC_ prefix = bundled into client JS
  │           all other env vars = server only, never in bundle
  ├─ Supabase RLS: anon key can only SELECT, no INSERT/UPDATE/DELETE
  ├─ service_role key only used in lib/supabase.ts server module
  └─ API routes: runtime = 'nodejs' (not edge) — secrets stay server-side
```

---

## 4. Tech Stack

| Layer | Technology | Why |
|---|---|---|
| **Runtime** | Next.js 14 App Router | Native Vercel serverless, SSE streaming |
| **Language** | TypeScript (strict) | Type safety across the full RAG pipeline |
| **LLM — Generation** | Google Gemini 2.0 Flash | Fast, free-tier available, multilingual |
| **LLM — Query Rewrite** | Google Gemini 2.0 Flash | Enriches queries with Islamic terminology |
| **Embeddings** | Jina AI v3 | 1,024-dim, multilingual, 8k token context |
| **Vector DB** | Supabase pgvector | PostgreSQL-native, no extra service needed |
| **Full-text Search** | PostgreSQL tsvector (BM25) | Zero cost, built-in to Supabase |
| **Hybrid Search** | pgvector + tsvector fusion | Semantic 70% + keyword 30% |
| **Hosting** | Vercel | Edge CDN, serverless functions, auto-deploy |
| **Streaming** | Server-Sent Events (SSE) | Real-time token streaming, Vercel-compatible |
| **Rate Limiting** | Edge Middleware (in-memory) | IP-keyed sliding window, no Redis needed |
| **Auth** | Supabase RLS | Service-role key server-only, never client-exposed |

---

## 5. RAG Pipeline — How It Works

### Step 1 — Query Rewrite

The user's raw query is rewritten by Gemini AI to include relevant Islamic terminology, transliterations, and scholarly language. Both the original and rewritten queries are embedded and averaged for maximum recall.

```
"what does islam say about being patient"
  ↓  Gemini rewrite
"Quranic verses and hadith about sabr (patience), perseverance,
 tawakkul (reliance on Allah), and steadfastness in Islam"
  ↓  Jina AI embed × 2, then average
[0.023, -0.451, 0.871, ...]  ← 1,024-dim vector
```

### Step 2 — Hybrid Search

The `hybrid_search` Postgres function fuses two retrieval signals:

```sql
similarity = cosine_similarity × 0.70
           + bm25_rank         × 0.30
```

- **Semantic (pgvector):** cosine similarity between the averaged query vector and all 44,193+ document embeddings — finds conceptually related passages even with different wording
- **Keyword (tsvector BM25):** PostgreSQL full-text search rank — finds exact matches for Arabic transliterations like "sabr", "tawakkul", "zakat", "Alhamdulillah"

Results below similarity threshold `0.25` are discarded.

### Step 3 — Context Assembly

Retrieved documents are formatted into a numbered, cited context block:

```
[1] [Quran 2:153]
O you who have believed, seek help through patience and prayer.
Indeed, Allah is with the patient.

[2] [Bukhari #1400]
The Prophet (ﷺ) said: "No fatigue, nor disease, nor anxiety, nor
sorrow, nor hurt, nor distress befalls a Muslim, even if it were
the prick he receives from a thorn, but that Allah expiates some
of his sins for that."

[3] [Tafsir Ibn Kathir — 2:153]
Allah commands the believers to seek His help through patience
and prayer...
```

### Step 4 — Guarded Generation

The Gemini prompt enforces strict constraints:
- Must cite every claim with a reference tag
- Must not add information beyond the provided context
- Must redirect fatwa or ruling questions to a qualified scholar
- Must acknowledge uncertainty rather than fabricate

### Step 5 — Post-generation Guardrails

After streaming, the full response passes through three gates (see [Section 6](#6-guardrails-system)) before `[DONE]` is sent.

---

## 6. Guardrails System

Three independent gates in `lib/guardrails.ts`:

```
┌──────────────────────────────────────────────────────┐
│                   GUARDRAIL GATES                    │
│                                                      │
│  Gate 1 — checkSources()        [pre-generation]    │
│  ├─ sources.length ≥ 1                              │
│  ├─ top source similarity > 0.28                    │
│  └─ FAIL → return error event (no LLM call made)   │
│                                                      │
│  Gate 2 — detectFatwas()        [post-generation]   │
│  ├─ regex: "it is permissible/forbidden/obligatory" │
│  ├─ regex: "you must / you should"                  │
│  ├─ regex: "sharia ruling / fatwa / fiqh ruling"    │
│  └─ MATCH → append SCHOLAR_REFERRAL disclaimer      │
│                                                      │
│  Gate 3 — groundingScore()      [post-generation]   │
│  ├─ word-overlap: answer vs source texts            │
│  ├─ combined with retrieval similarity score        │
│  └─ → confidence score 0.0–1.0 sent in SSE done    │
└──────────────────────────────────────────────────────┘
```

**Confidence scoring:**
```
confidence = retrieval_similarity × 0.60
           + grounding_ratio      × 0.40
```

---

## 7. API Reference

### `POST /api/ask`

Streams an answer via Server-Sent Events.

**Request:**
```json
{
  "query": "What does the Quran say about patience?",
  "language": "en",
  "source_types": ["quran", "hadith", "tafsir"],
  "top_k": 5
}
```

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `query` | string | Yes | — | Max 500 characters |
| `language` | `"en"` \| `"ar"` | No | `"en"` | Filter sources by language |
| `source_types` | array | No | all | `"quran"`, `"hadith"`, `"tafsir"`, `"fiqh"` |
| `top_k` | number | No | `5` | Max `8` (context budget limit) |

**Response:** `text/event-stream` — see [Section 8](#8-sse-event-stream-protocol)

---

### `POST /api/search`

Returns paginated semantic search results without LLM generation.

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
  "results": [{
    "id": "uuid",
    "content": "Al-Baqarah (البقرة), Verse 153: O you who believed...",
    "metadata": {
      "source_type": "quran",
      "surah_number": 2,
      "surah_name": "Al-Baqarah",
      "verse_number": 153
    },
    "similarity": 0.87
  }],
  "pagination": { "page": 1, "page_size": 10, "total": 23, "has_more": true }
}
```

---

### `GET /api/sources`

Source catalog. **Cached 1 hour** at Vercel Edge.

---

### `GET /api/health`

Liveness probe. Returns `200` when DB reachable, `503` when degraded.

---

## 8. SSE Event Stream Protocol

Events arrive in this order:

```
data: {"type":"pipeline", ...}    ← 0→active→done for each of 5 steps
data: {"type":"sources", ...}     ← retrieved source list
data: {"type":"token", ...}       ← 0 to N token chunks
data: {"type":"disclaimer", ...}  ← only if fatwa detected
data: {"type":"done", ...}        ← confidence score
data: [DONE]                      ← stream terminator
```

### Event Shapes

```typescript
// Pipeline step update (5 steps, each gets active then done)
{ type: "pipeline", step: 1, label: "Query Rewrite", tech: "Gemini AI",
  status: "active" | "done", duration_ms?: number }

// Sources — arrives before any tokens
{ type: "sources", sources: [{
    id: "uuid",
    metadata: { source_type, surah_number, verse_number, book, ... },
    similarity: 0.87,
    excerpt: "Full document content (complete stored text)"
}]}

// Token — one per generation chunk
{ type: "token", token: "The Quran states in " }

// Disclaimer — only when fatwa content detected
{ type: "disclaimer", message: "This topic involves religious rulings..." }

// Done
{ type: "done", confidence: 0.76 }

// Error
{ type: "error", message: "No relevant sources found..." }
```

### Flutter / Dart Client Example

```dart
final request = http.Request('POST', Uri.parse('$baseUrl/api/ask'));
request.headers['Content-Type'] = 'application/json';
request.body = jsonEncode({'query': userQuery});

final response = await http.Client().send(request);
final stream = response.stream
  .transform(utf8.decoder)
  .transform(const LineSplitter());

await for (final line in stream) {
  if (!line.startsWith('data: ') || line == 'data: [DONE]') continue;
  final evt = jsonDecode(line.substring(6));
  switch (evt['type']) {
    case 'pipeline':  updatePipelineStep(evt); break;
    case 'sources':   setState(() => sources = evt['sources']); break;
    case 'token':     setState(() => answer += evt['token']); break;
    case 'disclaimer':setState(() => disclaimer = evt['message']); break;
    case 'done':      setState(() => confidence = evt['confidence']); break;
  }
}
```

---

## 9. Local Development Setup

### Prerequisites

| Tool | Version |
|---|---|
| Node.js | ≥ 18.17 |
| npm | ≥ 9 |

### Steps

```bash
# 1. Clone and install
git clone <repo-url> tazkia-ai-assistant
cd tazkia-ai-assistant
npm install

# 2. Configure environment
cp .env.local.example .env.local
# Fill in required values (see Section 13)

# 3. Set up Supabase — run supabase/schema.sql and supabase/rls.sql

# 4. Start dev server
npm run dev
# → http://localhost:3000

# 5. Verify
curl http://localhost:3000/api/health
curl -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -d '{"query":"What does the Quran say about patience?"}' \
  --no-buffer
```

---

## 10. Data Ingestion Pipeline

Runs locally once per source. Never runs on Vercel.

### Current Data Sources

| Source | API / Dataset | Documents |
|---|---|---|
| Quran | QuranCDN (free) | 6,236 verses |
| Hadith (7 books) | fawazahmed0 CDN (free) | 31,757 hadiths |
| Tafsir Ibn Kathir | IslamicStudies.info | ~6,200 entries |

### Commands

```bash
npm run ingest          # all sources
npm run ingest:quran    # Quran only
npm run ingest:hadith   # Hadith only
npm run ingest:tafsir   # Tafsir only
```

### Pipeline Stages

```
1. Fetch raw text from APIs
2. chunkText() — 600-word chunks, 80-word overlap
3. embedDocuments() — Jina AI batch embed (100 texts/call)
4. supabase.insert() — 200 rows/batch
5. REINDEX documents_embedding_idx  ← rebuild IVFFlat after bulk load
```

### Adding a New Source (e.g., Fiqh)

```typescript
// scripts/fetch-fiqh.ts
export async function fetchFiqhDocuments(): Promise<ParsedDocument[]> {
  return [{
    content: "...",
    metadata: {
      source_type: 'fiqh',
      book_name: 'Reliance of the Traveller',
      author: 'Ibn Naqib al-Misri',
      school: 'shafii',
      chapter: 'Purification',
      reference: 'e1.0',
    },
    source_type: 'fiqh',
    language: 'en',
  }];
}
```

Add to `scripts/ingest.ts`:
```typescript
if (all || args.has('--fiqh')) {
  const docs = await fetchFiqhDocuments();
  await ingest(docs);
}
```

After any bulk insert, rebuild the vector index in Supabase SQL Editor:
```sql
REINDEX INDEX documents_embedding_idx;
```

---

## 11. Supabase Setup

### Step 1 — Create Project

Go to [supabase.com](https://supabase.com) → **New project**. Choose a region close to your users (`ap-southeast-1` for Middle East/South Asia).

### Step 2 — Run Migrations

In **Supabase Dashboard → SQL Editor**, run in order:
1. `supabase/schema.sql` — creates tables, indexes, `hybrid_search()` RPC, `query_logs`
2. `supabase/rls.sql` — enables RLS and adds read/write policies

### Step 3 — Verify

```sql
-- hybrid_search function exists
SELECT routine_name FROM information_schema.routines
WHERE routine_name = 'hybrid_search';

-- RLS enabled
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';

-- Indexes created
SELECT indexname FROM pg_indexes WHERE tablename = 'documents';
```

### Step 4 — API Keys

Go to **Supabase Dashboard → Project Settings → API**:

| Key | Exposure |
|---|---|
| Project URL | Public — safe |
| anon public key | Public — safe |
| service_role key | **SECRET — never expose client-side** |

### Storage Estimate

| Data | Size |
|---|---|
| 44K documents × 1024-dim float32 vectors | ~180 MB |
| Text content + metadata | ~20 MB |
| Index overhead | ~30 MB |
| **Current total** | **~230 MB / 500 MB** |
| **Remaining for Fiqh + more** | **~270 MB** |

---

## 12. Vercel Deployment

### Deploy

```bash
npm install -g vercel
vercel login
vercel --prod
```

### Required Environment Variables (Vercel Dashboard → Settings → Environment Variables)

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret — server only |
| `GOOGLE_API_KEY` | Gemini API key (free tier: new AI Studio project, no billing) |
| `JINA_API_KEY` | Jina AI API key (free tier available) |
| `GOOGLE_MODEL` | Default: `gemini-2.0-flash` |

### Verify

```bash
curl https://your-app.vercel.app/api/health
```

### Custom Domain

**Vercel Dashboard → Project → Domains** → add `api.tazkia365.com`. SSL automatic.

---

## 13. Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | **Secret.** Service role key. |
| `GOOGLE_API_KEY` | Yes | **Secret.** Gemini API key. |
| `JINA_API_KEY` | Yes | **Secret.** Jina AI API key. |
| `GOOGLE_MODEL` | No | Default: `gemini-2.0-flash` |
| `RATE_LIMIT_RPM` | No | Default: `20` requests/IP/minute |
| `NEXT_PUBLIC_APP_URL` | No | App URL for CORS |

**Security notes:**
- `SUPABASE_SERVICE_ROLE_KEY` bypasses all RLS — treat it like a DB root password
- `GOOGLE_API_KEY` — use a free-tier AI Studio project (no billing attached) to avoid quota depletion
- Neither secret is ever accessed client-side

---

## 14. Performance & Scalability

### Timeout Budget (30s Vercel limit, Node.js runtime)

```
Query rewrite (Gemini)        ~200ms
Dual embedding (Jina AI ×2)   ~600ms
Hybrid search (SQL RPC)       ~100ms
LLM stream first token        ~800ms
LLM stream total              ~4–8s
Guardrail checks              ~10ms
──────────────────────────────────────
Total                         ~6–10s  ← under 30s maxDuration
```

### Search Performance (44K documents, IVFFlat lists=100)

| Operation | Latency |
|---|---|
| ANN vector search | ~20–60ms |
| Full-text BM25 | ~10–30ms |
| Hybrid RPC (combined) | ~80–150ms |

Scaling for 500K documents (Phase 4+): increase `lists` to 500, use HNSW index.

```sql
-- Upgrade index for larger collections
DROP INDEX documents_embedding_idx;
CREATE INDEX documents_embedding_idx
  ON documents USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

---

## 15. Monitoring & Observability

### Query Logs (Supabase)

```sql
-- Most common queries
SELECT query, COUNT(*), AVG(confidence), AVG(response_time_ms)
FROM query_logs
GROUP BY query ORDER BY COUNT(*) DESC LIMIT 20;

-- Low-confidence queries (knowledge gaps)
SELECT query, confidence, sources_found, created_at
FROM query_logs WHERE confidence < 0.5 ORDER BY created_at DESC;

-- p50/p90/p99 latency
SELECT
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY response_time_ms) AS p50,
  PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY response_time_ms) AS p90,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY response_time_ms) AS p99
FROM query_logs WHERE created_at > now() - INTERVAL '24 hours';
```

### Health Check

Point an uptime monitor at:
```
GET https://your-app.vercel.app/api/health
Expected: { "status": "ok" }  HTTP 200
```

---

## 16. Troubleshooting

### "Gemini 429 — prepayment credits depleted"

```
Cause:  API key belongs to a project with billing enabled.
        Free-tier quota is 0 when billing is attached.
Fix:    Create a new project at aistudio.google.com with NO billing account.
        Generate a new API key from that project.
        Update GOOGLE_API_KEY in Vercel dashboard → redeploy.
```

### "Jina embed error: Invalid API key"

```
Cause:  JINA_API_KEY missing from Vercel environment variables.
Fix:    Vercel dashboard → Settings → Environment Variables →
        add JINA_API_KEY → redeploy.
```

### "hybrid_search RPC failed"

```
Cause:  hybrid_search function doesn't exist in Supabase.
Fix:    Run supabase/schema.sql in Supabase SQL Editor.
```

### "No relevant sources found"

```
Cause A: Database empty — ingestion not yet run.
Fix A:   npm run ingest

Cause B: IVFFlat index built before data was loaded.
Fix B:   REINDEX INDEX documents_embedding_idx;

Cause C: Query unrelated to Islamic knowledge.
Fix C:   Expected behavior — guardrail working correctly.
```

### SSE stream cuts off mid-response

```
Cause:  maxDuration (30s) exceeded.
Fix:    Reduce top_k, or switch GOOGLE_MODEL to a faster model.
```

### Supabase RLS blocking queries

```
Cause:  Using anon key instead of service_role key in lib/supabase.ts.
Fix:    Verify SUPABASE_SERVICE_ROLE_KEY is set correctly.
Check:  The key should start with "eyJhbGciO" (a JWT).
```

---

## 17. Design Principles

**1. Authenticity above all**
Every document in the system is from authenticated, peer-reviewed Islamic scholarship. No Wikipedia. No blogs. No unverified content. Every answer traceable to a primary source.

**2. No hallucination**
Gate 1 blocks the LLM entirely if retrieved sources are insufficient. The generation prompt forbids adding information beyond the provided context. If we don't know, we say so.

**3. No fatwas**
The system is a knowledge retrieval tool, not a mufti. When fatwa-like content is detected, a mandatory disclaimer redirects the user to a qualified Islamic scholar.

**4. Every answer is cited**
Answers include inline references (`[Quran 2:153]`, `[Bukhari #1400]`). Source metadata is sent to the client as structured data before tokens stream so the UI can display provenance immediately.

**5. Transparency on confidence**
Every response includes a grounded confidence score (0–1). Clients should display this — honesty about uncertainty is a form of integrity.

**6. Sources first, always**
The `sources` SSE event arrives before any tokens. The UI should show "Searching in Quran and Hadith…" while the LLM warms up — never a blank screen.

**7. Expanding, never shrinking**
The knowledge base only grows. Every new phase adds more authenticated texts, more languages, more coverage. The goal is the complete authenticated corpus of Islamic scholarship — accessible, searchable, and understandable by everyone.

---

*Built with the intention that authentic Islamic knowledge should be accessible to every Muslim on earth, in any language, at any time.*

*For questions, open a GitHub issue or contact the team.*
