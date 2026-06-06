/**
 * Fetches Tafsir Ibn Kathir (English) from the Quran.com API v4.
 * Free, no auth required. Tafsir resource ID: 169.
 *
 * Coverage: all 6,236 ayahs across 114 surahs.
 * Content: scholarly commentary per verse (~50–500 words each).
 * Total: ~6,200 tafsir documents after stripping HTML.
 *
 * API docs: https://api.quran.com/api/v4
 */

import type { ParsedDocument } from './fetch-quran';

const BASE = 'https://api.quran.com/api/v4';
const TAFSIR_ID = 169; // Ibn Kathir — English

interface TafsirEntry {
  id: number;
  verse_key: string;  // e.g. "2:153"
  text: string;       // HTML content
}

interface TafsirResponse {
  tafsirs: TafsirEntry[];
  meta?: {
    tafsir_name?: string;
    author_name?: string;
    chapter_id?: number;
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

async function fetchTafsirForSurah(
  surahNumber: number,
  attempt = 1
): Promise<TafsirEntry[]> {
  const url = `${BASE}/tafsirs/${TAFSIR_ID}/by_chapter/${surahNumber}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });

  if (res.status === 429 && attempt < 4) {
    const wait = attempt * 15_000;
    process.stdout.write(`\n  [rate limited — retrying in ${wait / 1000}s] `);
    await new Promise((r) => setTimeout(r, wait));
    return fetchTafsirForSurah(surahNumber, attempt + 1);
  }

  if (!res.ok) throw new Error(`HTTP ${res.status} for surah ${surahNumber}`);

  const data = (await res.json()) as TafsirResponse;
  return data.tafsirs ?? [];
}

export async function fetchTafsirDocuments(): Promise<ParsedDocument[]> {
  console.log('Fetching Tafsir Ibn Kathir (English) from Quran.com API v4...');
  const docs: ParsedDocument[] = [];

  for (let surahNum = 1; surahNum <= 114; surahNum++) {
    process.stdout.write(`  Surah ${surahNum}/114... `);
    try {
      const entries = await fetchTafsirForSurah(surahNum);
      let added = 0;

      for (const entry of entries) {
        const text = stripHtml(entry.text ?? '');
        if (!text || text.length < 40) continue;

        const [surahStr, verseStr] = entry.verse_key.split(':');
        const surahNumber = parseInt(surahStr, 10);
        const verseNumber = parseInt(verseStr, 10);

        docs.push({
          content: `Tafsir Ibn Kathir on ${entry.verse_key}: ${text}`,
          metadata: {
            source_type: 'tafsir',
            tafsir_name: 'Ibn Kathir',
            author: 'Ismail Ibn Kathir',
            surah_number: surahNumber,
            verse_number: verseNumber,
            reference: `tafsir-ik:${entry.verse_key}`,
            title: `Ibn Kathir — Quran ${entry.verse_key}`,
            language: 'en',
          },
          source_type: 'tafsir',
          language: 'en',
        });
        added++;
      }
      console.log(`${added} entries`);
    } catch (err) {
      console.log(`SKIPPED (${err instanceof Error ? err.message : err})`);
    }

    // ~3 req/s — stay well within Quran.com free tier limits
    await new Promise((r) => setTimeout(r, 350));
  }

  console.log(`\nTotal Tafsir documents: ${docs.length}`);
  return docs;
}
