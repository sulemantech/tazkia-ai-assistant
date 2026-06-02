#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# Tazkia AI Assistant — Demo Script
# Usage:  bash scripts/demo.sh [base_url]
# Default base_url: http://localhost:3000
# ──────────────────────────────────────────────────────────────

BASE="${1:-http://localhost:3000}"
DIVIDER="────────────────────────────────────────────────"

echo ""
echo "🕌  Tazkia AI Assistant — Demo"
echo "    API: $BASE"
echo ""

# ── 1. Health ─────────────────────────────────────────────────
echo "$DIVIDER"
echo "1.  GET /api/health"
echo "$DIVIDER"
curl -s "$BASE/api/health" | python3 -m json.tool 2>/dev/null || \
curl -s "$BASE/api/health"
echo ""

# ── 2. Sources catalog ────────────────────────────────────────
echo "$DIVIDER"
echo "2.  GET /api/sources"
echo "$DIVIDER"
curl -s "$BASE/api/sources" | python3 -m json.tool 2>/dev/null || \
curl -s "$BASE/api/sources"
echo ""

# ── 3. Search (no LLM — just retrieval) ──────────────────────
echo "$DIVIDER"
echo "3.  POST /api/search  (query: sabr patience)"
echo "$DIVIDER"
curl -s -X POST "$BASE/api/search" \
  -H "Content-Type: application/json" \
  -d '{"query":"sabr patience","source_types":["quran"],"page_size":3}' \
  | python3 -m json.tool 2>/dev/null || \
curl -s -X POST "$BASE/api/search" \
  -H "Content-Type: application/json" \
  -d '{"query":"sabr patience","source_types":["quran"],"page_size":3}'
echo ""

# ── 4. Ask (SSE stream) ───────────────────────────────────────
echo "$DIVIDER"
echo "4.  POST /api/ask  (streaming — press Ctrl+C to stop early)"
echo "    Query: What does the Quran say about patience?"
echo "$DIVIDER"
curl -s -X POST "$BASE/api/ask" \
  -H "Content-Type: application/json" \
  -d '{"query":"What does the Quran say about patience?","source_types":["quran","hadith"],"top_k":3}' \
  --no-buffer
echo ""
echo ""

# ── 5. Rate limit test ────────────────────────────────────────
echo "$DIVIDER"
echo "5.  Rate limit check (X-RateLimit headers)"
echo "$DIVIDER"
curl -sI "$BASE/api/health" | grep -i "x-ratelimit"
echo ""

echo "✅  Demo complete."
