'use client';

import { useState, useRef, useCallback } from 'react';

type SourceType = 'quran' | 'hadith' | 'tafsir';
type Mode = 'ask' | 'search';

interface ResultMeta {
  source_type: string;
  title?: string;
  reference?: string;
  book?: string;
  hadith_number?: number;
  surah_number?: number;
  verse_number?: number;
  grade?: string;
  tafsir_name?: string;
  author?: string;
}

interface SearchResult {
  id: string;
  content: string;
  metadata: ResultMeta;
  similarity: number;
}

interface AskSource {
  id: string;
  metadata: ResultMeta;
  similarity: number;
  excerpt: string;
}

const SOURCE_COLOR: Record<string, string> = {
  quran: '#059669',
  hadith: '#0369a1',
  tafsir: '#7c3aed',
};

const SOURCE_LABEL: Record<string, string> = {
  quran: 'Quran',
  hadith: 'Hadith',
  tafsir: 'Tafsir',
};

const SUGGESTIONS = [
  'What does Islam say about patience in hardship?',
  'Hadith about the importance of seeking knowledge',
  'Quran verses about gratitude and thankfulness',
  'What is the reward for praying Fajr?',
  'Tafsir of Surah Al-Fatiha',
  'Hadith about treating neighbours well',
];

function refLabel(meta: ResultMeta): string {
  const t = meta.source_type;
  if (t === 'quran' && meta.surah_number && meta.verse_number)
    return `Surah ${meta.surah_number}:${meta.verse_number}`;
  if (t === 'hadith' && meta.book && meta.hadith_number)
    return `${meta.book.charAt(0).toUpperCase()}${meta.book.slice(1)} ${meta.hadith_number}`;
  if (t === 'tafsir' && meta.reference)
    return `Ibn Kathir · ${meta.reference.replace('tafsir-ik:', '')}`;
  return meta.reference ?? '';
}

function SourceCard({ meta, excerpt, similarity }: { meta: ResultMeta; excerpt: string; similarity: number }) {
  const color = SOURCE_COLOR[meta.source_type] ?? '#6b7280';
  const pct = Math.round(similarity * 100);
  return (
    <div style={{
      background: '#fff',
      borderRadius: 10,
      border: '1px solid #e5e7eb',
      borderTop: `3px solid ${color}`,
      padding: '1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          background: color,
          color: '#fff',
          fontSize: 11,
          fontWeight: 700,
          padding: '2px 8px',
          borderRadius: 20,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          {SOURCE_LABEL[meta.source_type] ?? meta.source_type}
        </span>
        <span style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>
          {refLabel(meta)}
        </span>
        {meta.grade && (
          <span style={{ fontSize: 11, color: '#6b7280', background: '#f3f4f6', borderRadius: 20, padding: '1px 8px' }}>
            {meta.grade}
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#9ca3af' }}>
          {pct}% match
        </span>
      </div>
      <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.6, margin: 0 }}>
        {excerpt.length > 280 ? excerpt.slice(0, 280) + '…' : excerpt}
      </p>
    </div>
  );
}

export default function Home() {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SourceType[]>([]);
  const [mode, setMode] = useState<Mode>('ask');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const [answer, setAnswer] = useState('');
  const [disclaimer, setDisclaimer] = useState('');
  const [sources, setSources] = useState<AskSource[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const toggleFilter = (t: SourceType) =>
    setFilters(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  const reset = () => {
    setAnswer(''); setDisclaimer(''); setSources([]); setSearchResults([]);
  };

  const submit = useCallback(async (q: string) => {
    if (!q.trim() || loading) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setSearched(true);
    reset();

    const body: Record<string, unknown> = { query: q.trim() };
    if (filters.length) body.source_types = filters;

    try {
      if (mode === 'search') {
        body.page_size = 9;
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: abortRef.current.signal,
        });
        const data = await res.json() as { results?: SearchResult[] };
        setSearchResults(data.results ?? []);
        setLoading(false);
      } else {
        const res = await fetch('/api/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: abortRef.current.signal,
        });
        if (!res.body) throw new Error('No stream');
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        outer: while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const parts = buf.split('\n\n');
          buf = parts.pop() ?? '';
          for (const part of parts) {
            if (!part.startsWith('data: ')) continue;
            const raw = part.slice(6);
            if (raw === '[DONE]') break outer;
            try {
              const evt = JSON.parse(raw) as { type: string; token?: string; sources?: AskSource[]; message?: string };
              if (evt.type === 'sources') setSources(evt.sources ?? []);
              if (evt.type === 'token') setAnswer(a => a + (evt.token ?? ''));
              if (evt.type === 'disclaimer') setDisclaimer(evt.message ?? '');
              if (evt.type === 'error') setAnswer(evt.message ?? 'Error generating answer.');
            } catch { /* ignore parse errors */ }
          }
        }
        setLoading(false);
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError')
        setAnswer('Something went wrong. Please try again.');
      setLoading(false);
    }
  }, [query, filters, mode, loading]);

  const onSubmit = (e: React.FormEvent) => { e.preventDefault(); submit(query); };

  const displayCards = mode === 'ask'
    ? sources
    : searchResults.map(r => ({ ...r, excerpt: r.content }));

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <header style={{
        background: 'linear-gradient(135deg, #1a5c38 0%, #0f3d25 100%)',
        color: '#fff',
        padding: '1.5rem 1rem',
        textAlign: 'center',
      }}>
        <h1 style={{ fontSize: 'clamp(1.4rem, 4vw, 2rem)', fontWeight: 700, letterSpacing: '-0.02em' }}>
          🕌 Tazkia AI
        </h1>
        <p style={{ fontSize: 14, opacity: 0.8, marginTop: 4 }}>
          Islamic Knowledge · Quran · Hadith · Tafsir Ibn Kathir
        </p>
      </header>

      {/* Search bar */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '1rem', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <form onSubmit={onSubmit}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Ask about Islamic knowledge…"
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '0.65rem 1rem',
                  border: '1.5px solid #d1d5db',
                  borderRadius: 8,
                  fontSize: 15,
                  outline: 'none',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => (e.target.style.borderColor = '#1a5c38')}
                onBlur={e => (e.target.style.borderColor = '#d1d5db')}
              />
              <button
                type="submit"
                disabled={loading || !query.trim()}
                style={{
                  background: loading || !query.trim() ? '#9ca3af' : '#1a5c38',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '0.65rem 1.25rem',
                  fontSize: 15,
                  fontWeight: 600,
                  transition: 'background 0.15s',
                  whiteSpace: 'nowrap',
                }}
              >
                {loading ? '…' : 'Ask →'}
              </button>
            </div>
          </form>

          {/* Controls */}
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Mode toggle */}
            {(['ask', 'search'] as Mode[]).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  padding: '4px 12px',
                  borderRadius: 20,
                  border: '1.5px solid',
                  fontSize: 13,
                  fontWeight: 600,
                  borderColor: mode === m ? '#1a5c38' : '#d1d5db',
                  background: mode === m ? '#1a5c38' : '#fff',
                  color: mode === m ? '#fff' : '#6b7280',
                  transition: 'all 0.15s',
                }}
              >
                {m === 'ask' ? '💬 Ask AI' : '🔍 Search'}
              </button>
            ))}

            <div style={{ width: 1, height: 20, background: '#e5e7eb', margin: '0 4px' }} />

            {/* Source filters */}
            {(['quran', 'hadith', 'tafsir'] as SourceType[]).map(t => (
              <button
                key={t}
                onClick={() => toggleFilter(t)}
                style={{
                  padding: '4px 12px',
                  borderRadius: 20,
                  border: '1.5px solid',
                  fontSize: 13,
                  fontWeight: 600,
                  borderColor: filters.includes(t) ? SOURCE_COLOR[t] : '#d1d5db',
                  background: filters.includes(t) ? SOURCE_COLOR[t] : '#fff',
                  color: filters.includes(t) ? '#fff' : '#6b7280',
                  transition: 'all 0.15s',
                }}
              >
                {SOURCE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main content */}
      <main style={{ flex: 1, maxWidth: 760, width: '100%', margin: '0 auto', padding: '1.5rem 1rem' }}>

        {/* Suggestions when no search yet */}
        {!searched && (
          <div>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Try asking
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => { setQuery(s); submit(s); }}
                  style={{
                    textAlign: 'left',
                    background: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    padding: '0.75rem 1rem',
                    fontSize: 14,
                    color: '#374151',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={e => {
                    (e.target as HTMLElement).style.borderColor = '#1a5c38';
                    (e.target as HTMLElement).style.boxShadow = '0 1px 4px rgba(26,92,56,0.1)';
                  }}
                  onMouseLeave={e => {
                    (e.target as HTMLElement).style.borderColor = '#e5e7eb';
                    (e.target as HTMLElement).style.boxShadow = 'none';
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Answer card (Ask mode) */}
        {mode === 'ask' && searched && (
          <div style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderLeft: '4px solid #1a5c38',
            borderRadius: 10,
            padding: '1.25rem',
            marginBottom: '1.5rem',
          }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#1a5c38', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              AI Answer
            </p>
            {answer ? (
              <p style={{ fontSize: 15, lineHeight: 1.75, color: '#1a1a1a', whiteSpace: 'pre-wrap' }}>
                {answer}
                {loading && <span style={{ animation: 'blink 1s infinite', opacity: 0.6 }}>▌</span>}
              </p>
            ) : (
              <p style={{ fontSize: 15, color: '#9ca3af', fontStyle: 'italic' }}>
                {loading ? (sources.length > 0 ? 'Generating answer…' : 'Searching sources…') : 'No answer generated.'}
              </p>
            )}
            {disclaimer && (
              <p style={{ marginTop: 12, fontSize: 13, color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 6, padding: '0.5rem 0.75rem' }}>
                ⚠️ {disclaimer}
              </p>
            )}
          </div>
        )}

        {/* Source / result cards */}
        {displayCards.length > 0 && (
          <>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#6b7280', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {mode === 'ask' ? 'Sources' : 'Results'} · {displayCards.length} found
            </p>
            <div style={{ display: 'grid', gap: 12 }}>
              {displayCards.map((s, i) => (
                <SourceCard
                  key={s.id ?? i}
                  meta={s.metadata}
                  excerpt={s.excerpt}
                  similarity={s.similarity}
                />
              ))}
            </div>
          </>
        )}

        {/* Empty state */}
        {searched && !loading && displayCards.length === 0 && !(mode === 'ask' && (answer || loading)) && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#6b7280' }}>
            <p style={{ fontSize: 32, marginBottom: 8 }}>🔍</p>
            <p style={{ fontSize: 15 }}>No results found. Try rephrasing your query or removing filters.</p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #e5e7eb', padding: '1rem', textAlign: 'center', fontSize: 12, color: '#9ca3af' }}>
        Tazkia AI · Quran · Sahih Bukhari · Sahih Muslim · Abu Dawud · Tirmidhi · Ibn Majah · Nasai · Muwatta Malik · Tafsir Ibn Kathir ·{' '}
        <a href="/api/health" style={{ color: '#1a5c38', textDecoration: 'none' }}>API Status</a>
      </footer>

      <style>{`
        @keyframes blink { 0%, 100% { opacity: 1 } 50% { opacity: 0 } }
      `}</style>
    </div>
  );
}
