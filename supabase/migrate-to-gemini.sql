-- ============================================================
-- Switch from OpenAI (1536 dims) → Gemini text-embedding-004 (768 dims)
-- Run in: Supabase Dashboard → SQL Editor
-- Safe to run on an empty table (document_count = 0)
-- ============================================================

DROP INDEX IF EXISTS documents_embedding_idx;

ALTER TABLE documents
  ALTER COLUMN embedding TYPE vector(768);

CREATE INDEX documents_embedding_idx
  ON documents USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Update match_documents helper
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding  vector(768),
  match_threshold  FLOAT DEFAULT 0.3,
  match_count      INT   DEFAULT 10
)
RETURNS TABLE (id UUID, content TEXT, metadata JSONB, source_type TEXT, language TEXT, similarity FLOAT)
LANGUAGE SQL STABLE AS $$
  SELECT id, content, metadata, source_type, language,
    1 - (embedding <=> query_embedding) AS similarity
  FROM documents
  WHERE 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Update hybrid_search
CREATE OR REPLACE FUNCTION hybrid_search(
  query_text          TEXT,
  query_embedding     vector(768),
  match_count         INT    DEFAULT 10,
  filter_source_types TEXT[] DEFAULT NULL,
  filter_language     TEXT   DEFAULT NULL
)
RETURNS TABLE (id UUID, content TEXT, metadata JSONB, source_type TEXT, language TEXT, similarity FLOAT)
LANGUAGE SQL STABLE AS $$
  WITH semantic AS (
    SELECT id, content, metadata, source_type, language,
      1 - (embedding <=> query_embedding) AS sem_score
    FROM documents
    WHERE
      (filter_source_types IS NULL OR source_type = ANY(filter_source_types))
      AND (filter_language IS NULL OR language = filter_language)
    ORDER BY embedding <=> query_embedding
    LIMIT match_count * 2
  ),
  keyword AS (
    SELECT id,
      ts_rank_cd(to_tsvector('english', content), plainto_tsquery('english', query_text)) AS kw_score
    FROM documents
    WHERE
      to_tsvector('english', content) @@ plainto_tsquery('english', query_text)
      AND (filter_source_types IS NULL OR source_type = ANY(filter_source_types))
      AND (filter_language IS NULL OR language = filter_language)
    LIMIT match_count * 2
  )
  SELECT s.id, s.content, s.metadata, s.source_type, s.language,
    COALESCE(s.sem_score, 0) * 0.7
      + COALESCE(k.kw_score / NULLIF((SELECT MAX(kw_score) FROM keyword), 0), 0) * 0.3 AS similarity
  FROM semantic s LEFT JOIN keyword k ON s.id = k.id
  UNION
  SELECT d.id, d.content, d.metadata, d.source_type, d.language,
    k.kw_score / NULLIF((SELECT MAX(kw_score) FROM keyword), 0) * 0.3
  FROM keyword k JOIN documents d ON d.id = k.id
  WHERE k.id NOT IN (SELECT id FROM semantic)
  ORDER BY similarity DESC LIMIT match_count;
$$;
