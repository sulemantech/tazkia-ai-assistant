/**
 * Fetches all Quranic verses using the Al-Quran Cloud API (alquran.cloud).
 * Free, no auth required, stable structure.
 * Translation: en.sahih (Sahih International)
 */

export interface ParsedDocument {
  content: string;
  metadata: Record<string, unknown>;
  source_type: 'quran' | 'hadith' | 'tafsir';
  language: 'en' | 'ar';
}

const BASE = 'https://api.alquran.cloud/v1';

interface Ayah {
  numberInSurah: number;
  text: string;
}

interface SurahData {
  number: number;
  name: string;           // Arabic name
  englishName: string;    // e.g. "Al-Fatihah"
  ayahs: Ayah[];
}

async function fetchSurah(surahNumber: number): Promise<SurahData> {
  const res = await fetch(`${BASE}/surah/${surahNumber}/en.sahih`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json() as { data: SurahData };
  return json.data;
}

export async function fetchQuranDocuments(): Promise<ParsedDocument[]> {
  console.log('Fetching Quran (Sahih International) from Al-Quran Cloud API...');
  const docs: ParsedDocument[] = [];

  for (let surahNum = 1; surahNum <= 114; surahNum++) {
    process.stdout.write(`  Surah ${surahNum}/114... `);
    try {
      const surah = await fetchSurah(surahNum);
      let added = 0;

      for (const ayah of surah.ayahs) {
        const text = ayah.text?.trim();
        if (!text) continue;

        docs.push({
          content: `${surah.englishName} (${surah.name}), Verse ${ayah.numberInSurah}: ${text}`,
          metadata: {
            source_type: 'quran',
            surah_number: surah.number,
            surah_name: surah.englishName,
            verse_number: ayah.numberInSurah,
            reference: `${surah.number}:${ayah.numberInSurah}`,
            title: `Quran ${surah.number}:${ayah.numberInSurah}`,
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

    // ~3 req/s to stay within free tier limits
    await new Promise((r) => setTimeout(r, 350));
  }

  console.log(`\nTotal Quran documents: ${docs.length}`);
  return docs;
}
