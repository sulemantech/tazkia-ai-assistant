/**
 * Fetches all Quranic verses (English translation) from QuranCDN's free API.
 * Translation ID 131 = Sahih International (most widely accepted English translation).
 */

export interface ParsedDocument {
  content: string;
  metadata: Record<string, unknown>;
  source_type: 'quran' | 'hadith' | 'tafsir';
  language: 'en' | 'ar';
}

const BASE = 'https://api.qurancdn.com/api/qdc';
const TRANSLATION_ID = 131; // Sahih International

interface Chapter {
  id: number;
  name_simple: string;
  name_arabic: string;
  verses_count: number;
}

interface VerseRaw {
  verse_number: number;
  translations: Array<{ text: string }>;
}

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`QuranCDN API error ${res.status}: ${url}`);
  return res.json() as Promise<T>;
}

async function fetchChapters(): Promise<Chapter[]> {
  const data = await apiFetch<{ chapters: Chapter[] }>(`${BASE}/chapters?language=en`);
  return data.chapters;
}

async function fetchVerses(surahId: number, total: number): Promise<VerseRaw[]> {
  const data = await apiFetch<{ verses: VerseRaw[] }>(
    `${BASE}/verses/by_chapter/${surahId}` +
    `?language=en&translations=${TRANSLATION_ID}&fields=verse_number&per_page=${total}`
  );
  return data.verses;
}

export async function fetchQuranDocuments(): Promise<ParsedDocument[]> {
  console.log('Fetching Quran (Sahih International) from QuranCDN API...');
  const chapters = await fetchChapters();
  const docs: ParsedDocument[] = [];

  for (const ch of chapters) {
    process.stdout.write(`  Surah ${ch.id}/${chapters.length}: ${ch.name_simple}... `);
    try {
      const verses = await fetchVerses(ch.id, ch.verses_count);
      let added = 0;

      for (const v of verses) {
        const raw = v.translations?.[0]?.text ?? '';
        // Strip HTML footnote tags that the API sometimes returns
        const text = raw.replace(/<[^>]*>/g, '').trim();
        if (!text) continue;

        docs.push({
          content: `${ch.name_simple} (${ch.name_arabic}), Verse ${v.verse_number}: ${text}`,
          metadata: {
            source_type: 'quran',
            surah_number: ch.id,
            surah_name: ch.name_simple,
            verse_number: v.verse_number,
            reference: `${ch.id}:${v.verse_number}`,
            title: `Quran ${ch.id}:${v.verse_number}`,
            language: 'en',
          },
          source_type: 'quran',
          language: 'en',
        });
        added++;
      }
      console.log(`${added} verses`);
    } catch (err) {
      console.log(`SKIPPED (${err instanceof Error ? err.message : err})`);
    }

    // Respect API rate limit: ~6 req/s
    await delay(170);
  }

  console.log(`\nTotal Quran documents: ${docs.length}`);
  return docs;
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
