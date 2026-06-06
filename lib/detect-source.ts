import type { SourceType } from './types';

export function detectSourceTypes(query: string): SourceType[] | undefined {
  const q = query.toLowerCase();
  const asksQuran  = /\b(quran|qur[aā]n|verse|surah|ayah|ayat|al-quran)\b/.test(q);
  const asksHadith = /\b(hadith|hadis|hadee[th]|prophet said|narrated|sunnah|seerah)\b/.test(q);

  if (asksQuran && !asksHadith) return ['quran'];
  if (asksHadith && !asksQuran) return ['hadith'];
  return undefined;
}
