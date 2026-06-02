-- ============================================================
-- Tazkia AI Assistant — Row Level Security Policies
-- Run AFTER schema.sql in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ─── documents table ────────────────────────────────────────
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Public read: anyone can read documents (Islamic knowledge is public)
CREATE POLICY "documents_public_read"
  ON documents FOR SELECT
  USING (true);

-- Write restricted to service role only (ingestion pipeline)
-- The anon/authenticated keys cannot insert/update/delete
CREATE POLICY "documents_service_insert"
  ON documents FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "documents_service_update"
  ON documents FOR UPDATE
  USING (auth.role() = 'service_role');

CREATE POLICY "documents_service_delete"
  ON documents FOR DELETE
  USING (auth.role() = 'service_role');

-- ─── query_logs table ───────────────────────────────────────
ALTER TABLE query_logs ENABLE ROW LEVEL SECURITY;

-- Logs are write-only from the API (service role) — no public read
CREATE POLICY "query_logs_service_insert"
  ON query_logs FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Analytics read for service role only
CREATE POLICY "query_logs_service_read"
  ON query_logs FOR SELECT
  USING (auth.role() = 'service_role');

-- ─── Restrict RPC functions to authenticated callers ─────────
-- The hybrid_search and match_documents functions are SECURITY DEFINER-free
-- (they run as the calling role). The service role key is never exposed
-- client-side, so anon callers can only SELECT documents (read-only).
-- This is enforced by the policies above.

-- ─── API rate limiting (optional — requires pg_net / edge function) ──
-- Rate limiting is handled at the Vercel Edge layer (middleware.ts).
-- No additional DB-level throttling is needed for the free tier.
