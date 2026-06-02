import { supabaseAdmin } from './supabase';
import type { Language, SearchResult, SourceType } from './types';

export interface HybridSearchOptions {
  query: string;
  queryEmbedding: number[];
  sourceTypes?: SourceType[];
  language?: Language;
  topK?: number;
}

/**
 * Calls the hybrid_search Postgres function which fuses:
 *  - pgvector cosine similarity (70%)
 *  - PostgreSQL full-text search rank   (30%)
 */
export async function hybridSearch({
  query,
  queryEmbedding,
  sourceTypes,
  language,
  topK = 5,
}: HybridSearchOptions): Promise<SearchResult[]> {
  const { data, error } = await supabaseAdmin.rpc('hybrid_search', {
    query_text: query,
    query_embedding: queryEmbedding,
    match_count: topK * 2, // fetch more, slice after dedup
    filter_source_types: sourceTypes ?? null,
    filter_language: language ?? null,
  });

  if (error) throw new Error(`hybrid_search RPC failed: ${error.message}`);

  const seen = new Set<string>();
  return (data as SearchResult[])
    .filter((doc) => {
      if (seen.has(doc.id)) return false;
      seen.add(doc.id);
      return doc.similarity > 0.25; // minimum relevance threshold
    })
    .slice(0, topK);
}
