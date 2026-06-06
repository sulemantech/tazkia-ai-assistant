import { NextRequest } from 'next/server';
import { buildRAGContext, streamAnswer, formatContext } from '@/lib/rag-chain';
import { detectFatwas, groundingScore, computeConfidence, SCHOLAR_REFERRAL } from '@/lib/guardrails';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { AskRequest, SSEEvent } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

// ── SSE helpers ──────────────────────────────────────────────────────────────

const enc = new TextEncoder();

function sseEvent(event: SSEEvent): Uint8Array {
  return enc.encode(`data: ${JSON.stringify(event)}\n\n`);
}
const SSE_DONE = enc.encode('data: [DONE]\n\n');

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const startMs = Date.now();

  // ── 1. Parse & validate input ──────────────────────────────────────────────
  let body: AskRequest;
  try {
    body = (await req.json()) as AskRequest;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const query = body.query?.trim() ?? '';
  if (!query) {
    return new Response(JSON.stringify({ error: 'query is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (query.length > 500) {
    return new Response(JSON.stringify({ error: 'query must be ≤ 500 characters' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── 2. Retrieval phase ─────────────────────────────────────────────────────
  let ragCtx: Awaited<ReturnType<typeof buildRAGContext>>;
  try {
    ragCtx = await buildRAGContext(body);
  } catch (err) {
    console.error('[/api/ask] retrieval error:', err);
    return new Response(JSON.stringify({ error: 'Search service unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── 3. Stream response ─────────────────────────────────────────────────────
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // 3a. If retrieval failed → send error + close
        if (ragCtx.fallbackMessage) {
          controller.enqueue(
            sseEvent({ type: 'error', message: ragCtx.fallbackMessage })
          );
          controller.enqueue(SSE_DONE);
          controller.close();
          return;
        }

        const { sources, confidence: retrievalConf } = ragCtx;

        // 3b. Send retrieved sources (metadata only, 200-char excerpt)
        controller.enqueue(
          sseEvent({
            type: 'sources',
            sources: sources.map((s) => ({
              id: s.id,
              metadata: s.metadata,
              similarity: s.similarity,
              excerpt: s.content.slice(0, 200),
            })),
          })
        );

        // 3c. Stream LLM tokens
        let fullAnswer = '';
        for await (const token of streamAnswer(query, sources)) {
          fullAnswer += token;
          controller.enqueue(sseEvent({ type: 'token', token }));
        }

        // 3d. Post-generation guardrails
        if (detectFatwas(fullAnswer)) {
          controller.enqueue(
            sseEvent({ type: 'disclaimer', message: SCHOLAR_REFERRAL })
          );
        }

        const grounding = groundingScore(fullAnswer, sources);
        const confidence = computeConfidence(retrievalConf, grounding);

        controller.enqueue(sseEvent({ type: 'done', confidence }));
        controller.enqueue(SSE_DONE);
        controller.close();

        // 3e. Fire-and-forget analytics (non-blocking)
        void getSupabaseAdmin()
          .from('query_logs')
          .insert({
            query,
            sources_found: sources.length,
            confidence,
            response_time_ms: Date.now() - startMs,
          })
          .then(null, () => undefined);

      } catch (err) {
        console.error('[/api/ask] streaming error:', err);
        controller.enqueue(
          sseEvent({ type: 'error', message: 'An error occurred while generating the response.' })
        );
        controller.enqueue(SSE_DONE);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // disable nginx buffering on proxied setups
    },
  });
}
