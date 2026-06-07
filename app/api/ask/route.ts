import { NextRequest } from 'next/server';
import { getEmbeddings } from '@/lib/embeddings';
import { hybridSearch } from '@/lib/vectorstore';
import { detectSourceTypes } from '@/lib/detect-source';
import { rewriteQuery, formatContext, streamAnswer, PIPELINE_STEPS } from '@/lib/rag-chain';
import { checkSources, detectFatwas, groundingScore, computeConfidence, SCHOLAR_REFERRAL } from '@/lib/guardrails';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { AskRequest, SSEEvent } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

const enc = new TextEncoder();

function sseEvent(event: SSEEvent): Uint8Array {
  return enc.encode(`data: ${JSON.stringify(event)}\n\n`);
}
const SSE_DONE = enc.encode('data: [DONE]\n\n');

export async function POST(req: NextRequest) {
  const startMs = Date.now();

  let body: AskRequest;
  try {
    body = (await req.json()) as AskRequest;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const query = body.query?.trim() ?? '';
  if (!query) {
    return new Response(JSON.stringify({ error: 'query is required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }
  if (query.length > 500) {
    return new Response(JSON.stringify({ error: 'query must be ≤ 500 characters' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: SSEEvent) => controller.enqueue(sseEvent(e));
      const pipelineStep = (n: number, status: 'active' | 'done', duration_ms?: number) => {
        const def = PIPELINE_STEPS[n - 1];
        send({ type: 'pipeline', step: n, label: def.label, tech: def.tech, status, duration_ms });
      };

      try {
        // ── Step 1: Query rewriting ─────────────────────────────────────
        pipelineStep(1, 'active');
        const t1 = Date.now();
        const rewrittenQuery = await rewriteQuery(query);
        pipelineStep(1, 'done', Date.now() - t1);

        // ── Step 2: Vector embedding ────────────────────────────────────
        pipelineStep(2, 'active');
        const t2 = Date.now();
        const embeddings = getEmbeddings();
        const [origVec, rewrittenVec] = await Promise.all([
          embeddings.embedQuery(query),
          embeddings.embedQuery(rewrittenQuery),
        ]);
        const avgVec = origVec.map((v, i) => (v + rewrittenVec[i]) / 2);
        pipelineStep(2, 'done', Date.now() - t2);

        // ── Step 3: Hybrid search ───────────────────────────────────────
        pipelineStep(3, 'active');
        const t3 = Date.now();
        const sources = await hybridSearch({
          query: rewrittenQuery,
          queryEmbedding: avgVec,
          sourceTypes: body.source_types ?? detectSourceTypes(query),
          language: body.language ?? 'en',
          topK: Math.min(body.top_k ?? 5, 8),
        });
        pipelineStep(3, 'done', Date.now() - t3);

        // ── Step 4: Context assembly ────────────────────────────────────
        pipelineStep(4, 'active');
        const t4 = Date.now();

        if (sources.length === 0) {
          pipelineStep(4, 'done', Date.now() - t4);
          send({ type: 'error', message: 'No relevant sources found for this query.' });
          controller.enqueue(SSE_DONE);
          controller.close();
          return;
        }

        const gate = checkSources(sources);
        pipelineStep(4, 'done', Date.now() - t4);

        send({
          type: 'sources',
          sources: sources.map(s => ({
            id: s.id,
            metadata: s.metadata,
            similarity: s.similarity,
            excerpt: s.content,
          })),
        });

        if (!gate.passed) {
          send({ type: 'error', message: 'Sources found but confidence too low to generate a reliable answer.' });
          controller.enqueue(SSE_DONE);
          controller.close();
          return;
        }

        // ── Step 5: LLM streaming ───────────────────────────────────────
        pipelineStep(5, 'active');
        const t5 = Date.now();
        let fullAnswer = '';
        for await (const token of streamAnswer(query, sources)) {
          fullAnswer += token;
          send({ type: 'token', token });
        }
        pipelineStep(5, 'done', Date.now() - t5);

        if (detectFatwas(fullAnswer)) {
          send({ type: 'disclaimer', message: SCHOLAR_REFERRAL });
        }

        const grounding = groundingScore(fullAnswer, sources);
        const confidence = computeConfidence(gate.confidence, grounding);
        send({ type: 'done', confidence });
        controller.enqueue(SSE_DONE);
        controller.close();

        void getSupabaseAdmin()
          .from('query_logs')
          .insert({ query, sources_found: sources.length, confidence, response_time_ms: Date.now() - startMs })
          .then(null, () => undefined);

      } catch (err) {
        console.error('[/api/ask] error:', err);
        send({ type: 'error', message: 'An error occurred while processing your request. Please try again.' });
        controller.enqueue(SSE_DONE);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
