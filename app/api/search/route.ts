import { NextRequest } from 'next/server';
import { getEmbeddings } from '@/lib/embeddings';
import { hybridSearch } from '@/lib/vectorstore';
import type { SearchRequest } from '@/lib/types';

export const runtime = 'edge';
export const maxDuration = 10;

export async function POST(req: NextRequest) {
  let body: SearchRequest;
  try {
    body = (await req.json()) as SearchRequest;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const query = body.query?.trim() ?? '';
  if (!query) return Response.json({ error: 'query is required' }, { status: 400 });
  if (query.length > 300) return Response.json({ error: 'query must be ≤ 300 characters' }, { status: 400 });

  const page = Math.max(1, body.page ?? 1);
  const pageSize = Math.min(20, Math.max(1, body.page_size ?? 10));

  try {
    const embeddings = getEmbeddings();
    const queryEmbedding = await embeddings.embedQuery(query);

    const allResults = await hybridSearch({
      query,
      queryEmbedding,
      sourceTypes: body.source_types,
      language: body.language,
      topK: pageSize * page, // over-fetch to support pagination
    });

    const paginated = allResults.slice((page - 1) * pageSize, page * pageSize);

    return Response.json({
      results: paginated.map((r) => ({
        id: r.id,
        content: r.content,
        metadata: r.metadata,
        similarity: r.similarity,
      })),
      pagination: {
        page,
        page_size: pageSize,
        total: allResults.length,
        has_more: page * pageSize < allResults.length,
      },
    });
  } catch (err) {
    console.error('[/api/search] error:', err);
    return Response.json({ error: 'Search failed. Please try again.' }, { status: 503 });
  }
}
