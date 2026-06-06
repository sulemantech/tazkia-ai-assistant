#!/usr/bin/env ts-node
/**
 * Local ingestion pipeline — run this ONCE (or incrementally) to populate Supabase.
 *
 *   npm run ingest            # ingest everything (Quran + Hadith + Tafsir)
 *   npm run ingest:quran      # only Quran
 *   npm run ingest:hadith     # only Hadith (all 7 collections)
 *   npm run ingest:tafsir     # only Tafsir Ibn Kathir
 *
 * Prerequisites:
 *   cp .env.local.example .env.local   (fill in your keys)
 *   npm install
 *
 * Cost: FREE — uses Jina embeddings (1M free tokens/month)
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { fetchQuranDocuments } from './fetch-quran';
import { fetchHadithDocuments } from './fetch-hadith';
import { fetchTafsirDocuments } from './fetch-tafsir';
import type { ParsedDocument } from './fetch-quran';

// ── Config ────────────────────────────────────────────────────────────────────

const EMBED_BATCH = 50;    // chunks per progress line (embedding is sequential inside)
const DB_BATCH   = 200;    // rows per Supabase insert
const MIN_CHARS  =  30;    // skip extremely short chunks

// ── Clients ───────────────────────────────────────────────────────────────────

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing environment variable: ${key}`);
  return v;
}

const supabase = createClient(
  requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
  requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  { auth: { persistSession: false }, realtime: { transport: ws as any } }
);

const JINA_URL = 'https://api.jina.ai/v1/embeddings';
const JINA_API_KEY = requireEnv('JINA_API_KEY');

async function embedTexts(texts: string[], attempt = 1): Promise<number[][]> {
  const MAX_ATTEMPTS = 5;

  try {
    const res = await fetch(JINA_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${JINA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'jina-embeddings-v3',
        input: texts,
      }),
    });

    const data = await res.json() as {
      data?: Array<{ embedding: number[] }>;
      error?: string;
      detail?: string;
    };

    if (!res.ok) {
      const msg = data.error ?? data.detail ?? `HTTP ${res.status}`;
      if (attempt < MAX_ATTEMPTS) {
        const wait = attempt * 10_000;
        process.stdout.write(`\n  [HTTP ${res.status} — retrying in ${wait / 1000}s] `);
        await new Promise((r) => setTimeout(r, wait));
        return embedTexts(texts, attempt + 1);
      }
      throw new Error(`Jina embed error: ${msg}`);
    }

    return (data.data ?? []).map((d) => d.embedding);

  } catch (err) {
    // Network-level failure (fetch failed, ECONNRESET, timeout, etc.)
    if (attempt < MAX_ATTEMPTS) {
      const wait = attempt * 5_000; // 5s, 10s, 15s, 20s
      process.stdout.write(`\n  [network error — retrying in ${wait / 1000}s] `);
      await new Promise((r) => setTimeout(r, wait));
      return embedTexts(texts, attempt + 1);
    }
    throw err;
  }
}

// ── Chunking ──────────────────────────────────────────────────────────────────

/**
 * Split long texts into overlapping chunks (word-based approximation).
 * 600 words ≈ 800 tokens.  Overlap of 80 words ≈ 100 tokens.
 */
function chunkText(text: string, maxWords = 600, overlapWords = 80): string[] {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return [text];

  const chunks: string[] = [];
  let i = 0;
  while (i < words.length) {
    chunks.push(words.slice(i, i + maxWords).join(' '));
    i += maxWords - overlapWords;
  }
  return chunks;
}

// ── Ingestion ─────────────────────────────────────────────────────────────────

interface Row {
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
  source_type: string;
  language: string;
}

async function ingest(documents: ParsedDocument[]): Promise<void> {
  // Expand documents into chunks
  const chunks: Omit<Row, 'embedding'>[] = [];
  for (const doc of documents) {
    for (const chunk of chunkText(doc.content)) {
      if (chunk.length < MIN_CHARS) continue;
      chunks.push({
        content: chunk,
        metadata: doc.metadata,
        source_type: doc.source_type,
        language: doc.language,
      });
    }
  }

  console.log(`\n  Chunks to embed: ${chunks.length}`);
  const totalBatches = Math.ceil(chunks.length / EMBED_BATCH);
  let inserted = 0;

  for (let b = 0; b < chunks.length; b += EMBED_BATCH) {
    const batch = chunks.slice(b, b + EMBED_BATCH);
    const batchNum = Math.floor(b / EMBED_BATCH) + 1;
    process.stdout.write(`  Batch ${batchNum}/${totalBatches} — embedding... `);

    let vectors: number[][];
    try {
      vectors = await embedTexts(batch.map((c) => c.content));
    } catch (err) {
      console.log(`SKIPPED (embed error: ${err instanceof Error ? err.message : err})`);
      continue;
    }

    // Validate: surface empty/null vectors immediately
    const firstVec = vectors[0];
    if (!firstVec || firstVec.length === 0) {
      console.log(`SKIPPED (embedding returned empty vector — check GOOGLE_API_KEY and run Supabase migration)`);
      console.log(`  → Run supabase/migrate-to-gemini.sql in Supabase SQL Editor first`);
      process.exit(1);
    }
    if (batchNum === 1) {
      console.log(`\n  Embedding dims: ${firstVec.length} ✓`);
    }

    const rows: Row[] = batch.map((c, i) => ({ ...c, embedding: vectors[i] }));

    // Upsert on content_hash — idempotent, safe to re-run any collection
    for (let d = 0; d < rows.length; d += DB_BATCH) {
      const dbSlice = rows.slice(d, d + DB_BATCH);
      const { error } = await supabase
        .from('documents')
        .upsert(dbSlice, { onConflict: 'content_hash', ignoreDuplicates: true });
      if (error) {
        console.error(`\n  DB upsert error: ${error.message}`);
      } else {
        inserted += dbSlice.length;
      }
    }

    console.log(`done (+${rows.length})`);
    // Brief pause to respect Gemini rate limits
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`  Inserted ${inserted} rows.`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Tazkia Knowledge Ingestion Pipeline ===');
  console.log(`Supabase: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`);
  console.log(`Model:    jina-embeddings-v3 (1024 dims)\n`);

  const argv = process.argv.slice(2);
  const args = new Set(argv);
  // --only bukhari,nasai  →  target specific hadith collections
  const onlyIdx = argv.indexOf('--only');
  const onlyCollections = onlyIdx !== -1
    ? argv[onlyIdx + 1]?.split(',').map((s) => s.trim()) ?? []
    : [];
  const all = args.size === 0;

  if (all || args.has('--quran')) {
    console.log('── Quran ──────────────────────────────────────────');
    const docs = await fetchQuranDocuments();
    await ingest(docs);
  }

  if (all || args.has('--hadith')) {
    console.log('\n── Hadith ─────────────────────────────────────────');
    const docs = await fetchHadithDocuments(onlyCollections.length ? onlyCollections : undefined);
    await ingest(docs);
  }

  if (all || args.has('--tafsir')) {
    console.log('\n── Tafsir Ibn Kathir ──────────────────────────────');
    const docs = await fetchTafsirDocuments();
    await ingest(docs);
  }

  console.log('\nNote: vector index was dropped in favour of exact search (30K rows).');
  console.log('If you re-create an IVFFlat/HNSW index, rebuild it here after bulk insert.');

  console.log('\n=== Ingestion complete ===');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
