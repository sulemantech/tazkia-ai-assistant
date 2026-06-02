-- ============================================================
-- Tazkia AI Assistant — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- 2. Core documents table
--    Free-tier budget: 1536 dims × 4 bytes = 6 KB/row
--    ~83,000 documents fit in 500 MB before text/metadata overhead
--    Practical limit with content: ~30,000–40,000 rows
-- ============================================================
CREATE TABLE IF NOT EXISTS documents (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  content      TEXT        NOT NULL,
  embedding    vector(1536) NOT NULL,
  metadata     JSONB       NOT NULL DEFAULT '{}',
  source_type  TEXT        NOT NULL CHECK (source_type IN ('quran', 'hadith', 'tafsir')),
  language     TEXT        NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'ar')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Indexes
-- Approximate nearest-neighbour index (IVFFlat). lists=100 is good for ≤1M rows.
-- Build AFTER bulk insert for better index quality.
CREATE INDEX IF NOT EXISTS documents_embedding_idx
  ON documents USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Metadata filters
CREATE INDEX IF NOT EXISTS documents_source_type_idx ON documents (source_type);
CREATE INDEX IF NOT EXISTS documents_language_idx    ON documents (language);
CREATE INDEX IF NOT EXISTS documents_metadata_idx    ON documents USING GIN (metadata);

-- Full-text search (PostgreSQL tsvector)
CREATE INDEX IF NOT EXISTS documents_fts_idx
  ON documents USING GIN (to_tsvector('english', content));

-- ============================================================
-- 4. Query logs — lightweight analytics
-- ============================================================
CREATE TABLE IF NOT EXISTS query_logs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  query            TEXT        NOT NULL,
  sources_found    INT         NOT NULL DEFAULT 0,
  confidence       FLOAT,
  response_time_ms INT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-prune logs older than 90 days to stay within free tier
CREATE INDEX IF NOT EXISTS query_logs_created_at_idx ON query_logs (created_at);

-- ============================================================
-- 5. Hybrid search RPC function
--    Combines pgvector semantic search + PostgreSQL full-text search
--    Weight: 70% semantic, 30% keyword
-- ============================================================
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding  vector(1536),
  match_threshold  FLOAT   DEFAULT 0.3,
  match_count      INT     DEFAULT 10
)
RETURNS TABLE (
  id          UUID,
  content     TEXT,
  metadata    JSONB,
  source_type TEXT,
  language    TEXT,
  similarity  FLOAT
)
LANGUAGE SQL STABLE
AS $$
  SELECT
    id, content, metadata, source_type, language,
    1 - (embedding <=> query_embedding) AS similarity
  FROM documents
  WHERE 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Hybrid search: semantic + full-text with optional filters
CREATE OR REPLACE FUNCTION hybrid_search(
  query_text         TEXT,
  query_embedding    vector(1536),
  match_count        INT      DEFAULT 10,
  filter_source_types TEXT[]  DEFAULT NULL,
  filter_language    TEXT     DEFAULT NULL
)
RETURNS TABLE (
  id          UUID,
  content     TEXT,
  metadata    JSONB,
  source_type TEXT,
  language    TEXT,
  similarity  FLOAT
)
LANGUAGE SQL STABLE
AS $$
  WITH semantic AS (
    SELECT
      id, content, metadata, source_type, language,
      1 - (embedding <=> query_embedding) AS sem_score
    FROM documents
    WHERE
      (filter_source_types IS NULL OR source_type = ANY(filter_source_types))
      AND (filter_language IS NULL OR language = filter_language)
    ORDER BY embedding <=> query_embedding
    LIMIT match_count * 2
  ),
  keyword AS (
    SELECT
      id,
      ts_rank_cd(
        to_tsvector('english', content),
        plainto_tsquery('english', query_text)
      ) AS kw_score
    FROM documents
    WHERE
      to_tsvector('english', content) @@ plainto_tsquery('english', query_text)
      AND (filter_source_types IS NULL OR source_type = ANY(filter_source_types))
      AND (filter_language IS NULL OR language = filter_language)
    LIMIT match_count * 2
  )
  SELECT
    s.id,
    s.content,
    s.metadata,
    s.source_type,
    s.language,
    -- RRF-inspired fusion: weight semantic 70%, keyword 30%
    COALESCE(s.sem_score, 0) * 0.7
      + COALESCE(k.kw_score / NULLIF((SELECT MAX(kw_score) FROM keyword), 0), 0) * 0.3
      AS similarity
  FROM semantic s
  LEFT JOIN keyword k ON s.id = k.id

  UNION

  -- Include keyword-only matches not in semantic results
  SELECT
    d.id, d.content, d.metadata, d.source_type, d.language,
    k.kw_score / NULLIF((SELECT MAX(kw_score) FROM keyword), 0) * 0.3 AS similarity
  FROM keyword k
  JOIN documents d ON d.id = k.id
  WHERE k.id NOT IN (SELECT id FROM semantic)

  ORDER BY similarity DESC
  LIMIT match_count;
$$;

-- ============================================================
-- 6. Scheduled cleanup — runs via pg_cron if enabled
--    (Enable pg_cron in Supabase: Database → Extensions → pg_cron)
-- ============================================================
-- SELECT cron.schedule('prune-query-logs', '0 3 * * *',
--   'DELETE FROM query_logs WHERE created_at < now() - INTERVAL ''90 days''');
