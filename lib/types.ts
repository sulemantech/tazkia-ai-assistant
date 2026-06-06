export type SourceType = 'quran' | 'hadith' | 'tafsir';
export type Language = 'en' | 'ar';

export interface DocumentMetadata {
  source_type: SourceType;
  language: Language;
  title?: string;
  reference?: string;
  // Quran
  surah_number?: number;
  surah_name?: string;
  verse_number?: number;
  // Hadith
  book?: string;
  hadith_number?: number | string;
  narrator?: string;
  grade?: string; // sahih | hasan | daif
  // Tafsir
  tafsir_name?: string;
  author?: string;
}

export interface SearchResult {
  id: string;
  content: string;
  metadata: DocumentMetadata;
  similarity: number;
}

export interface AskRequest {
  query: string;
  language?: Language;
  source_types?: SourceType[];
  top_k?: number;
}

export interface SearchRequest {
  query: string;
  source_types?: SourceType[];
  language?: Language;
  page?: number;
  page_size?: number;
}

// SSE event shapes sent to the client
export type SSEEvent =
  | { type: 'pipeline'; step: number; label: string; tech: string; status: 'active' | 'done'; duration_ms?: number }
  | { type: 'sources'; sources: Array<Omit<SearchResult, 'content'> & { excerpt: string }> }
  | { type: 'token'; token: string }
  | { type: 'disclaimer'; message: string }
  | { type: 'done'; confidence: number }
  | { type: 'error'; message: string };
