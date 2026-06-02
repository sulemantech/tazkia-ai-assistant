import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'edge';
// Cache for 1 hour via Vercel Edge Cache (sources list rarely changes)
export const revalidate = 3600;

export async function GET() {
  try {
    // Count documents per source_type and language in one query
    const { data, error } = await supabaseAdmin
      .from('documents')
      .select('source_type, language, metadata')
      .limit(5000); // sufficient for counting, stays well within free tier

    if (error) throw error;

    const summary: Record<
      string,
      { count: number; languages: Set<string>; books?: Set<string>; authors?: Set<string> }
    > = {
      quran: { count: 0, languages: new Set() },
      hadith: { count: 0, languages: new Set(), books: new Set() },
      tafsir: { count: 0, languages: new Set(), authors: new Set() },
    };

    for (const row of data ?? []) {
      const src = summary[row.source_type];
      if (!src) continue;
      src.count++;
      src.languages.add(row.language);
      if (row.source_type === 'hadith' && row.metadata?.book) {
        src.books!.add(row.metadata.book as string);
      }
      if (row.source_type === 'tafsir' && (row.metadata?.author || row.metadata?.tafsir_name)) {
        src.authors!.add((row.metadata.author ?? row.metadata.tafsir_name) as string);
      }
    }

    return Response.json({
      sources: {
        quran: {
          available: summary.quran.count > 0,
          document_count: summary.quran.count,
          languages: Array.from(summary.quran.languages),
        },
        hadith: {
          available: summary.hadith.count > 0,
          document_count: summary.hadith.count,
          languages: Array.from(summary.hadith.languages),
          collections: Array.from(summary.hadith.books!),
        },
        tafsir: {
          available: summary.tafsir.count > 0,
          document_count: summary.tafsir.count,
          languages: Array.from(summary.tafsir.languages),
          authors: Array.from(summary.tafsir.authors!),
        },
      },
      total_documents: (data ?? []).length,
      last_checked: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[/api/sources] error:', err);
    return Response.json({ error: 'Could not load source catalog' }, { status: 503 });
  }
}
