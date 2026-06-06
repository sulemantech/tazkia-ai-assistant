/**
 * Fetches Hadith collections from the free open-source Hadith API.
 * Source: https://github.com/fawazahmed0/hadith-api (CDN-hosted JSON files)
 *
 * Collections ingested (Kutub al-Sittah — the 6 major Hadith books):
 *   - Sahih Bukhari  (~7,563 hadiths — Sahih)
 *   - Sahih Muslim   (~3,033 — Sahih)
 *   - Abu Dawud      (~5,274 — Hasan/Sahih mix)
 *   - Al-Tirmidhi   (~3,956 — Hasan/Sahih mix)
 *   - Ibn Majah      (~4,341 — Hasan/Sahih mix)
 *   - Al-Nasai       (~5,758 — Hasan/Sahih mix)
 *
 * Plus early classical collection:
 *   - Muwatta Malik  (~1,832 — Sahih/earliest major collection)
 *
 * Total: ~31,757 hadiths.  At ~300 chars avg → ~10 MB content.
 * With 1024-dim Jina embeddings (4 KB each) → ~127 MB for embeddings.
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
  { id: 'eng-bukhari',   name: 'bukhari',   grade: 'Sahih' },
  { id: 'eng-muslim',    name: 'muslim',    grade: 'Sahih' },
  { id: 'eng-abudawud',  name: 'abudawud',  grade: 'Hasan/Sahih' },
  { id: 'eng-tirmidhi',  name: 'tirmidhi',  grade: 'Hasan/Sahih' },
  { id: 'eng-ibnmajah',  name: 'ibnmajah',  grade: 'Hasan/Sahih' },
  { id: 'eng-nasai',     name: 'nasai',     grade: 'Hasan/Sahih' },
  { id: 'eng-malik',     name: 'malik',     grade: 'Sahih' },
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

export async function fetchHadithDocuments(
  only?: string[]  // e.g. ['ibnmajah', 'nasai', 'malik'] — omit for all
): Promise<ParsedDocument[]> {
  const target = only?.length
    ? COLLECTIONS.filter((c) => only.includes(c.name))
    : COLLECTIONS;

  console.log(
    `Fetching Hadith collections from fawazahmed0/hadith-api CDN...\n` +
    `  Collections: ${target.map((c) => c.name).join(', ')}`
  );
  const all: ParsedDocument[] = [];

  for (const col of target) {
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
