#!/usr/bin/env ts-node
/**
 * Local ingestion pipeline — run this ONCE (or incrementally) to populate Supabase.
 *
 *   npm run ingest            # ingest everything
 *   npm run ingest:quran      # only Quran
 *   npm run ingest:hadith     # only Hadith
 *
 * Prerequisites:
 *   cp .env.local.example .env.local   (fill in your keys)
 *   npm install
 *
 * Cost estimate (text-embedding-3-small = $0.02 / 1M tokens):
 *   Quran 6,236 verses  ≈  50K tokens  → $0.001
 *   Hadith 19K entries  ≈ 750K tokens  → $0.015
 *   Total ingestion cost: ~$0.02 (one-time)
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { OpenAIEmbeddings } from '@langchain/openai';
import { fetchQuranDocuments } from './fetch-quran';
import { fetchHadithDocuments } from './fetch-hadith';
import type { ParsedDocument } from './fetch-quran';

// ── Config ────────────────────────────────────────────────────────────────────

const EMBED_BATCH = 100;   // texts per OpenAI embedding call (API limit: 2048)
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
  { auth: { persistSession: false } }
);

const embedder = new OpenAIEmbeddings({
  modelName: 'text-embedding-3-small',
  dimensions: 1536,
  openAIApiKey: requireEnv('OPENAI_API_KEY'),
  batchSize: EMBED_BATCH,
  stripNewLines: true,
});

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
      vectors = await embedder.embedDocuments(batch.map((c) => c.content));
    } catch (err) {
      console.log(`SKIPPED (embed error: ${err instanceof Error ? err.message : err})`);
      continue;
    }

    const rows: Row[] = batch.map((c, i) => ({ ...c, embedding: vectors[i] }));

    // Insert in DB batches
    for (let d = 0; d < rows.length; d += DB_BATCH) {
      const dbSlice = rows.slice(d, d + DB_BATCH);
      const { error } = await supabase.from('documents').insert(dbSlice);
      if (error) {
        console.error(`\n  DB insert error: ${error.message}`);
      } else {
        inserted += dbSlice.length;
      }
    }

    console.log(`done (+${rows.length})`);
    // Brief pause to respect OpenAI rate limits (3500 RPM on tier-1)
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`  Inserted ${inserted} rows.`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Tazkia Knowledge Ingestion Pipeline ===');
  console.log(`Supabase: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`);
  console.log(`Model:    text-embedding-3-small (1536 dims)\n`);

  const args = new Set(process.argv.slice(2));
  const all = args.size === 0;

  if (all || args.has('--quran')) {
    console.log('── Quran ──────────────────────────────────────────');
    const docs = await fetchQuranDocuments();
    await ingest(docs);
  }

  if (all || args.has('--hadith')) {
    console.log('\n── Hadith ─────────────────────────────────────────');
    const docs = await fetchHadithDocuments();
    await ingest(docs);
  }

  // Rebuild the IVFFlat index after bulk insert for best search quality
  console.log('\nReindexing vector index (REINDEX)...');
  const { error } = await supabase.rpc('reindex_documents' as never);
  if (error) {
    console.log('  Note: manual REINDEX not available via RPC. Run in Supabase SQL Editor:');
    console.log('  REINDEX INDEX documents_embedding_idx;');
  } else {
    console.log('  Done.');
  }

  console.log('\n=== Ingestion complete ===');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
