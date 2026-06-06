import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET() {
  const t0 = Date.now();

  try {
    // head:true doesn't work reliably in Edge Runtime — use limit(0) instead
    const { count, error } = await supabaseAdmin
      .from('documents')
      .select('id', { count: 'exact' })
      .limit(0);

    if (error) throw error;

    return Response.json(
      {
        status: 'ok',
        version: process.env.npm_package_version ?? '1.0.0',
        database: { status: 'connected', document_count: count ?? 0 },
        latency_ms: Date.now() - t0,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (err) {
    return Response.json(
      {
        status: 'degraded',
        error: err instanceof Error ? err.message : 'Database unreachable',
        latency_ms: Date.now() - t0,
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
