/**
 * Fetches Hadith collections from the free open-source Hadith API.
 * Source: https://github.com/fawazahmed0/hadith-api (CDN-hosted JSON files)
 *
 * Collections ingested:
 *   - Sahih Bukhari  (7563 hadiths — Sahih)
 *   - Sahih Muslim   (3033 — Sahih)
 *   - Abu Dawud      (5274 — Hasan/Sahih mix)
 *   - Al-Tirmidhi   (3956 — Hasan/Sahih mix)
 *
 * Total: ~19,826 hadiths.  At ~300 chars avg → ~6 MB content.
 * With 1536-dim embeddings (6 KB each) → ~119 MB for embeddings alone.
 * Fits comfortably in Supabase 500 MB free tier.
 */

export interface ParsedDocument {
  content: string;
  metadata: Record<string, unknown>;
  source_type: 'quran' | 'hadith' | 'tafsir';
  language: 'en' | 'ar';
}

const CDN_BASE = 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions';

const COLLECTIONS: Array<{
  id: string;
  name: string;
  grade: string;
}> = [
  { id: 'eng-bukhari',   name: 'Bukhari',   grade: 'Sahih' },
  { id: 'eng-muslim',    name: 'Muslim',    grade: 'Sahih' },
  { id: 'eng-abudawud',  name: 'Abu Dawud', grade: 'Hasan/Sahih' },
  { id: 'eng-tirmidhi', name: 'Tirmidhi',  grade: 'Hasan/Sahih' },
];

interface HadithEntry {
  hadithnumber: number;
  text: string;
}

interface CollectionData {
  hadiths: HadithEntry[];
}

async function fetchCollection(id: string): Promise<HadithEntry[]> {
  const url = `${CDN_BASE}/${id}.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const data = (await res.json()) as CollectionData;
  return data.hadiths ?? [];
}

export async function fetchHadithDocuments(): Promise<ParsedDocument[]> {
  console.log('Fetching Hadith collections from fawazahmed0/hadith-api CDN...');
  const all: ParsedDocument[] = [];

  for (const col of COLLECTIONS) {
    process.stdout.write(`  ${col.name}... `);
    try {
      const hadiths = await fetchCollection(col.id);
      let added = 0;

      for (const h of hadiths) {
        const text = h.text?.trim();
        if (!text || text.length < 40) continue; // skip very short fragments

        all.push({
          content: text,
          metadata: {
            source_type: 'hadith',
            book: col.name.toLowerCase(),
            hadith_number: h.hadithnumber,
            grade: col.grade,
            reference: `${col.name.toLowerCase()}:${h.hadithnumber}`,
            title: `${col.name} Hadith ${h.hadithnumber}`,
            language: 'en',
          },
          source_type: 'hadith',
          language: 'en',
        });
        added++;
      }
      console.log(`${added} hadiths`);
    } catch (err) {
      console.log(`SKIPPED (${err instanceof Error ? err.message : err})`);
    }

    // Polite delay between collection downloads
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\nTotal Hadith documents: ${all.length}`);
  return all;
}
