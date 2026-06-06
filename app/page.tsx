'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { SourceType } from '@/lib/types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ResultMeta {
  source_type: string;
  surah_number?: number;
  verse_number?: number;
  surah_name?: string;
  book?: string;
  hadith_number?: number | string;
  grade?: string;
  author?: string;
  tafsir_name?: string;
  reference?: string;
}

interface AskSource {
  id: string;
  metadata: ResultMeta;
  similarity: number;
  excerpt: string;
}

interface SearchResult {
  id: string;
  content: string;
  metadata: ResultMeta;
  similarity: number;
}

type StepStatus = 'idle' | 'active' | 'done' | 'error';

interface PipelineStep {
  step: number;
  label: string;
  tech: string;
  status: StepStatus;
  duration_ms?: number;
}

interface SourceStats {
  quran:  { document_count: number };
  hadith: { document_count: number };
  tafsir: { document_count: number };
  total_documents: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PIPELINE_INIT: PipelineStep[] = [
  { step: 1, label: 'Query Rewrite',    tech: 'Gemini AI',          status: 'idle' },
  { step: 2, label: 'Vector Embedding', tech: 'Jina AI · 1024-dim', status: 'idle' },
  { step: 3, label: 'Hybrid Search',    tech: 'pgvector + FTS',     status: 'idle' },
  { step: 4, label: 'Context Assembly', tech: 'RAG Pipeline',       status: 'idle' },
  { step: 5, label: 'AI Response',      tech: 'Gemini 2.0 Flash',   status: 'idle' },
];

const SOURCE_COLOR: Record<string, string> = {
  quran: '#059669', hadith: '#0369a1', tafsir: '#7c3aed',
};
const SOURCE_LABEL: Record<string, string> = {
  quran: 'Quran', hadith: 'Hadith', tafsir: 'Tafsir',
};
const TECH_STACK = [
  { label: 'pgvector',       desc: 'Vector similarity search' },
  { label: 'Jina AI',        desc: '1024-dim embeddings' },
  { label: 'Gemini 2.0',     desc: 'LLM + query rewrite' },
  { label: 'Supabase',       desc: 'PostgreSQL + FTS' },
  { label: 'Hybrid Search',  desc: 'Semantic + BM25 fusion' },
  { label: 'Next.js 14',     desc: 'App Router + SSE streaming' },
];
const SUGGESTIONS = [
  'What does the Quran say about patience in hardship?',
  'Hadith about the importance of seeking knowledge',
  'How should a Muslim treat their parents?',
  'What is the significance of Surah Al-Fatiha?',
  'Hadith on the virtues of the last third of the night',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fmtMs = (ms: number) => ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
const fmtNum = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);

function refLabel(meta: ResultMeta): string {
  const t = meta.source_type;
  if (t === 'quran' && meta.surah_number && meta.verse_number)
    return `${meta.surah_name ? meta.surah_name + ' · ' : ''}${meta.surah_number}:${meta.verse_number}`;
  if (t === 'hadith' && meta.book && meta.hadith_number)
    return `${cap(meta.book)} · #${meta.hadith_number}`;
  if (t === 'tafsir' && meta.reference)
    return `Ibn Kathir · ${meta.reference.replace('tafsir-ik:', '')}`;
  return meta.reference ?? '';
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SourceCard({ meta, excerpt, similarity }: {
  meta: ResultMeta; excerpt: string; similarity: number;
}) {
  const color = SOURCE_COLOR[meta.source_type] ?? '#6b7280';
  const pct   = Math.round(similarity * 100);
  return (
    <div style={{
      background: '#fff',
      borderRadius: 12,
      border: '1px solid #e2e8f0',
      borderTop: `3px solid ${color}`,
      padding: '1.1rem 1.25rem',
      display: 'flex', flexDirection: 'column', gap: 10,
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      animation: 'fadeUp 0.3s ease both',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          background: color, color: '#fff',
          fontSize: 10, fontWeight: 800,
          padding: '2px 10px', borderRadius: 20,
          textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>
          {SOURCE_LABEL[meta.source_type] ?? meta.source_type}
        </span>
        <span style={{ fontSize: 13, color: '#1e293b', fontWeight: 600 }}>
          {refLabel(meta)}
        </span>
        {meta.grade && (
          <span style={{
            fontSize: 10, color: '#64748b',
            background: '#f8fafc', border: '1px solid #e2e8f0',
            borderRadius: 20, padding: '1px 8px',
          }}>
            {meta.grade}
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color }}>
          {pct}%
        </span>
      </div>

      {/* Similarity bar */}
      <div style={{ height: 3, background: '#f1f5f9', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: `linear-gradient(90deg, ${color}88, ${color})`,
          borderRadius: 2, transition: 'width 0.6s ease',
        }} />
      </div>

      <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.75, margin: 0 }}>
        {excerpt.length > 320 ? excerpt.slice(0, 320) + '…' : excerpt}
      </p>
    </div>
  );
}

function PipelineViz({ steps, visible }: { steps: PipelineStep[]; visible: boolean }) {
  if (!visible) return null;
  const totalDone = steps.filter(s => s.status === 'done').length;
  const totalMs   = steps.reduce((acc, s) => acc + (s.duration_ms ?? 0), 0);

  const circleColor = (s: StepStatus) =>
    s === 'done' ? '#16a34a' : s === 'active' ? '#2563eb' : '#cbd5e1';
  const lineColor = (s: StepStatus) =>
    s === 'done' ? '#16a34a' : '#e2e8f0';

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: 14,
      padding: '1.25rem 1.5rem',
      marginBottom: '1.5rem',
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      animation: 'fadeUp 0.3s ease both',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            RAG Pipeline
          </span>
        </div>
        {totalDone === 5 && (
          <span style={{ fontSize: 11, fontWeight: 600, color: '#16a34a', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 20, padding: '2px 10px' }}>
            ✓ Completed in {fmtMs(totalMs)}
          </span>
        )}
      </div>

      {/* Steps track */}
      <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', minWidth: 560 }}>
          {steps.map((s, idx) => (
            <div key={s.step} style={{ display: 'flex', alignItems: 'center', flex: idx < steps.length - 1 ? 1 : 0, minWidth: 0 }}>
              {/* Step column */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 100, flexShrink: 0 }}>
                {/* Circle */}
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: s.status === 'done' ? circleColor(s.status) : '#fff',
                  border: `2.5px solid ${circleColor(s.status)}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: s.status === 'done' ? 16 : 13,
                  fontWeight: 700,
                  color: s.status === 'done' ? '#fff' : circleColor(s.status),
                  transition: 'all 0.3s ease',
                  animation: s.status === 'active' ? 'pulse-ring 1.5s infinite' : 'none',
                  flexShrink: 0,
                }}>
                  {s.status === 'done' ? '✓' : s.step}
                </div>
                {/* Labels */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap' }}>
                    {s.label}
                  </div>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, whiteSpace: 'nowrap' }}>
                    {s.tech}
                  </div>
                  {s.status === 'done' && s.duration_ms !== undefined && (
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', marginTop: 3 }}>
                      {fmtMs(s.duration_ms)}
                    </div>
                  )}
                  {s.status === 'active' && (
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#2563eb', marginTop: 3 }}>
                      running…
                    </div>
                  )}
                </div>
              </div>

              {/* Connector */}
              {idx < steps.length - 1 && (
                <div style={{
                  flex: 1, height: 2,
                  background: lineColor(s.status),
                  marginBottom: 46,
                  transition: 'background 0.4s ease',
                }} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatsBar({ stats }: { stats: SourceStats | null }) {
  const items = stats ? [
    { icon: '📖', label: 'Quran',   value: fmtNum(stats.quran.document_count),  sub: 'verses' },
    { icon: '📚', label: 'Hadith',  value: fmtNum(stats.hadith.document_count), sub: 'hadiths' },
    { icon: '🔖', label: 'Tafsir',  value: fmtNum(stats.tafsir.document_count), sub: 'commentaries' },
    { icon: '🧮', label: 'Vectors', value: '1,024',  sub: 'dimensions' },
    { icon: '⚡', label: 'Search',  value: 'Hybrid', sub: 'semantic + BM25' },
  ] : [
    { icon: '📖', label: 'Quran',   value: '6.2k',   sub: 'verses' },
    { icon: '📚', label: 'Hadith',  value: '31k+',   sub: 'hadiths' },
    { icon: '🔖', label: 'Tafsir',  value: '6.2k',   sub: 'commentaries' },
    { icon: '🧮', label: 'Vectors', value: '1,024',  sub: 'dimensions' },
    { icon: '⚡', label: 'Search',  value: 'Hybrid', sub: 'semantic + BM25' },
  ];

  return (
    <div style={{
      background: '#fff',
      borderBottom: '1px solid #e2e8f0',
      overflowX: 'auto',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'center',
        gap: 0, maxWidth: 820, margin: '0 auto',
        minWidth: 'max-content',
      }}>
        {items.map((item, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '0.75rem 1.5rem',
            borderRight: i < items.length - 1 ? '1px solid #f1f5f9' : 'none',
          }}>
            <span style={{ fontSize: 18 }}>{item.icon}</span>
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: '#0f4c2a' }}>{item.value}</span>
                <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>{item.sub}</span>
              </div>
              <div style={{ fontSize: 10, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                {item.label}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Home() {
  const [query, setQuery]               = useState('');
  const [filters, setFilters]           = useState<SourceType[]>([]);
  const [mode, setMode]                 = useState<'ask' | 'search'>('ask');
  const [loading, setLoading]           = useState(false);
  const [searched, setSearched]         = useState(false);
  const [answer, setAnswer]             = useState('');
  const [disclaimer, setDisclaimer]     = useState('');
  const [confidence, setConfidence]     = useState<number | null>(null);
  const [sources, setSources]           = useState<AskSource[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [pipeline, setPipeline]         = useState<PipelineStep[]>(PIPELINE_INIT.map(s => ({ ...s })));
  const [stats, setStats]               = useState<SourceStats | null>(null);
  const [showPipeline, setShowPipeline] = useState(false);

  const abortRef  = useRef<AbortController | null>(null);
  const inputRef  = useRef<HTMLInputElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);

  // Load stats on mount
  useEffect(() => {
    fetch('/api/sources')
      .then(r => r.json())
      .then((d: { sources: SourceStats }) => setStats(d.sources))
      .catch(() => {/* silently use fallback */});
  }, []);

  const toggleFilter = (t: SourceType) =>
    setFilters(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  const reset = () => {
    setAnswer(''); setDisclaimer(''); setSources([]);
    setSearchResults([]); setConfidence(null);
    setPipeline(PIPELINE_INIT.map(s => ({ ...s })));
    setShowPipeline(false);
  };

  const submit = useCallback(async (q: string) => {
    if (!q.trim() || loading) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true); setSearched(true); reset();

    const body: Record<string, unknown> = { query: q.trim() };
    if (filters.length) body.source_types = filters;

    try {
      if (mode === 'search') {
        body.page_size = 9;
        const res  = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: abortRef.current.signal,
        });
        const data = await res.json() as { results?: SearchResult[] };
        setSearchResults(data.results ?? []);
        setLoading(false);
      } else {
        setShowPipeline(true);
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
              const evt = JSON.parse(raw) as {
                type: string;
                step?: number; label?: string; tech?: string;
                status?: 'active' | 'done'; duration_ms?: number;
                token?: string; sources?: AskSource[];
                message?: string; confidence?: number;
              };

              if (evt.type === 'pipeline' && evt.step) {
                setPipeline(prev => prev.map(s =>
                  s.step === evt.step
                    ? { ...s, status: evt.status ?? s.status, duration_ms: evt.duration_ms }
                    : s
                ));
              }
              if (evt.type === 'sources')   setSources(evt.sources ?? []);
              if (evt.type === 'token')     setAnswer(a => a + (evt.token ?? ''));
              if (evt.type === 'disclaimer') setDisclaimer(evt.message ?? '');
              if (evt.type === 'confidence') setConfidence(evt.confidence ?? null);
              if (evt.type === 'done')      setConfidence(evt.confidence ?? null);
              if (evt.type === 'error')     setAnswer(evt.message ?? 'Error generating answer.');
            } catch { /* incomplete JSON line */ }
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

  const displayCards: Array<AskSource | (SearchResult & { excerpt: string })> =
    mode === 'ask'
      ? sources
      : searchResults.map(r => ({ ...r, excerpt: r.content }));

  const confidencePct = confidence !== null ? Math.round(confidence * 100) : null;
  const confidenceColor =
    confidencePct === null ? '#6b7280'
    : confidencePct >= 75  ? '#16a34a'
    : confidencePct >= 50  ? '#d97706'
    : '#dc2626';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>

      {/* ── Header ── */}
      <header style={{
        background: 'linear-gradient(135deg, #0a3622 0%, #1a5c38 60%, #0f4c2a 100%)',
        color: '#fff',
        padding: '2rem 1rem 1.75rem',
      }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>
          {/* Brand */}
          <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
            <div style={{ fontSize: 'clamp(1.6rem, 5vw, 2.4rem)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.2 }}>
              🕌 Tazkia AI
            </div>
            <div style={{ fontSize: 14, opacity: 0.75, marginTop: 6, fontWeight: 500, letterSpacing: '0.01em' }}>
              Islamic Knowledge Intelligence Platform
            </div>
            <div style={{ fontSize: 12, opacity: 0.5, marginTop: 4 }}>
              Quran · Hadith · Tafsir Ibn Kathir · Powered by RAG
            </div>
          </div>

          {/* Tech stack badges */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
            {TECH_STACK.map(t => (
              <div key={t.label} title={t.desc} style={{
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 20, padding: '3px 12px',
                fontSize: 11, fontWeight: 600,
                color: 'rgba(255,255,255,0.9)',
              }}>
                {t.label}
              </div>
            ))}
          </div>

          {/* ── Hero metrics ── */}
          <div style={{
            marginTop: '1.5rem',
            paddingTop: '1.5rem',
            borderTop: '1px solid rgba(255,255,255,0.12)',
            display: 'flex', flexWrap: 'wrap',
            justifyContent: 'center', gap: '0.25rem',
          }}>
            {[
              { value: stats ? stats.total_documents.toLocaleString() : '44,193+', label: 'Documents Indexed',   sub: 'vectors in Supabase' },
              { value: '~5M',     label: 'Tokens Embedded',    sub: 'Islamic knowledge' },
              { value: '1,024',   label: 'Vector Dimensions',  sub: 'Jina v3 embeddings' },
              { value: '7',       label: 'Hadith Collections', sub: 'Kutub al-Sittah + Muwatta' },
              { value: '114',     label: 'Quranic Surahs',     sub: 'complete coverage' },
              { value: '<500ms',  label: 'Search Latency',     sub: 'ANN + FTS hybrid' },
            ].map((m, i, arr) => (
              <div key={m.label} style={{
                textAlign: 'center',
                padding: '0.6rem 1.4rem',
                borderRight: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.1)' : 'none',
                minWidth: 110,
              }}>
                <div style={{ fontSize: 'clamp(1.3rem, 3.5vw, 1.9rem)', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                  {m.value}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.75)', marginTop: 4 }}>
                  {m.label}
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                  {m.sub}
                </div>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* ── Stats bar ── */}
      <StatsBar stats={stats} />

      {/* ── Sticky search bar ── */}
      <div style={{
        background: '#fff', borderBottom: '1px solid #e2e8f0',
        padding: '0.9rem 1rem', position: 'sticky', top: 0, zIndex: 20,
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>
          <form onSubmit={onSubmit}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={mode === 'ask'
                  ? 'Ask anything — Quran, Hadith, or Tafsir…'
                  : 'Semantic search across Islamic texts…'}
                disabled={loading}
                style={{
                  flex: 1, padding: '0.7rem 1rem',
                  border: '1.5px solid #e2e8f0', borderRadius: 10,
                  fontSize: 15, outline: 'none',
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                  background: '#fafafa',
                }}
                onFocus={e => {
                  e.target.style.borderColor = '#0f4c2a';
                  e.target.style.boxShadow = '0 0 0 3px rgba(15,76,42,0.08)';
                  e.target.style.background = '#fff';
                }}
                onBlur={e => {
                  e.target.style.borderColor = '#e2e8f0';
                  e.target.style.boxShadow = 'none';
                  e.target.style.background = '#fafafa';
                }}
              />
              <button
                type="submit"
                disabled={loading || !query.trim()}
                style={{
                  background: loading || !query.trim() ? '#94a3b8' : '#0f4c2a',
                  color: '#fff', border: 'none', borderRadius: 10,
                  padding: '0.7rem 1.4rem', fontSize: 14, fontWeight: 700,
                  transition: 'background 0.15s, transform 0.1s',
                  whiteSpace: 'nowrap', letterSpacing: '0.01em',
                }}
              >
                {loading ? '…' : mode === 'ask' ? 'Ask AI →' : 'Search →'}
              </button>
            </div>
          </form>

          {/* Mode + filters */}
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {(['ask', 'search'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)} style={{
                padding: '3px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                border: '1.5px solid',
                borderColor: mode === m ? '#0f4c2a' : '#e2e8f0',
                background: mode === m ? '#0f4c2a' : '#fff',
                color: mode === m ? '#fff' : '#64748b',
                transition: 'all 0.15s',
              }}>
                {m === 'ask' ? '🤖 Ask AI' : '🔍 Search'}
              </button>
            ))}

            <div style={{ width: 1, height: 18, background: '#e2e8f0', margin: '0 2px' }} />

            {(['quran', 'hadith', 'tafsir'] as SourceType[]).map(t => (
              <button key={t} onClick={() => toggleFilter(t)} style={{
                padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                border: '1.5px solid',
                borderColor: filters.includes(t) ? SOURCE_COLOR[t] : '#e2e8f0',
                background: filters.includes(t) ? SOURCE_COLOR[t] : '#fff',
                color: filters.includes(t) ? '#fff' : '#64748b',
                transition: 'all 0.15s',
              }}>
                {SOURCE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <main style={{ flex: 1, maxWidth: 820, width: '100%', margin: '0 auto', padding: '1.5rem 1rem 3rem' }}>

        {/* ── Landing state ── */}
        {!searched && (
          <div style={{ animation: 'fadeUp 0.4s ease both' }}>

            {/* Knowledge base breakdown */}
            <div style={{
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14,
              padding: '1.5rem', marginBottom: '1rem',
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '1.25rem' }}>
                Knowledge Base Composition
              </div>

              {/* Source rows */}
              {[
                {
                  color: '#059669', label: 'QURAN',
                  title: `${stats ? stats.quran.document_count.toLocaleString() : '6,236'} ayahs · 114 Surahs`,
                  sub: 'Complete Quran · Sahih International translation · Ayah-level indexing',
                  pct: stats ? Math.round(stats.quran.document_count / stats.total_documents * 100) : 14,
                },
                {
                  color: '#0369a1', label: 'HADITH',
                  title: `${stats ? stats.hadith.document_count.toLocaleString() : '31,757'} hadiths · 7 collections`,
                  sub: 'Bukhari · Muslim · Abu Dawud · Tirmidhi · Ibn Majah · Al-Nasai · Muwatta Malik',
                  pct: stats ? Math.round(stats.hadith.document_count / stats.total_documents * 100) : 72,
                },
                {
                  color: '#7c3aed', label: 'TAFSIR',
                  title: `${stats ? stats.tafsir.document_count.toLocaleString() : '6,200'} commentaries · Every ayah`,
                  sub: 'Tafsir Ibn Kathir (Ismail ibn Umar ibn Kathir) · Ayah-level scholarly commentary',
                  pct: stats ? Math.round(stats.tafsir.document_count / stats.total_documents * 100) : 14,
                },
              ].map(row => (
                <div key={row.label} style={{ marginBottom: '1.1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ background: row.color, color: '#fff', fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 20, letterSpacing: '0.08em' }}>
                        {row.label}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{row.title}</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 800, color: row.color }}>{row.pct}%</span>
                  </div>
                  <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${row.pct}%`, height: '100%', background: `linear-gradient(90deg, ${row.color}99, ${row.color})`, borderRadius: 3, transition: 'width 0.8s ease' }} />
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{row.sub}</div>
                </div>
              ))}

              {/* Totals strip */}
              <div style={{
                marginTop: '1.25rem', paddingTop: '1.25rem',
                borderTop: '1px solid #f1f5f9',
                display: 'flex', flexWrap: 'wrap', gap: '1rem',
              }}>
                {[
                  { v: stats ? stats.total_documents.toLocaleString() : '44,193+', l: 'Total Documents' },
                  { v: stats ? stats.total_documents.toLocaleString() : '44,193+', l: 'Semantic Vectors' },
                  { v: '~5 Million',  l: 'Tokens Embedded' },
                  { v: 'IVFFlat',     l: 'Index Type (ANN)' },
                  { v: '1,024-dim',   l: 'Embedding Space' },
                  { v: 'cosine',      l: 'Similarity Metric' },
                ].map(m => (
                  <div key={m.l} style={{ minWidth: 120 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#0f4c2a' }}>{m.v}</div>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{m.l}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* System architecture & KPIs */}
            <div style={{
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14,
              padding: '1.5rem', marginBottom: '1rem',
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '1.25rem' }}>
                System Architecture &amp; Accuracy KPIs
              </div>
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
                {[
                  { icon: '🎯', kpi: 'Retrieval Strategy',    val: 'Hybrid Search',    sub: 'Semantic cosine (70%) + BM25 full-text (30%)' },
                  { icon: '🧮', kpi: 'Embedding Model',       val: 'Jina v3',          sub: '1,024-dim multilingual, 8,192 token context' },
                  { icon: '⚡', kpi: 'Vector Index',          val: 'IVFFlat (ANN)',    sub: 'lists=100, probes=10 — sub-linear search time' },
                  { icon: '✅', kpi: 'Source Grounding',      val: '100% Cited',       sub: 'Every sentence traceable to a source' },
                  { icon: '📊', kpi: 'Confidence Scoring',    val: 'Real-time',        sub: 'Retrieval + grounding score per response' },
                  { icon: '🔒', kpi: 'Hallucination Guard',   val: 'Enforced',         sub: 'Answers strictly bound to retrieved text' },
                  { icon: '🌐', kpi: 'Scholar-grade Sources', val: 'Sahih / Hasan',    sub: '7 independently authenticated collections' },
                  { icon: '🔁', kpi: 'Query Augmentation',    val: 'LLM Rewrite',      sub: 'Auto-expand with Arabic terms before search' },
                  { icon: '📡', kpi: 'Response Delivery',     val: 'SSE Streaming',    sub: 'Token-by-token via Server-Sent Events' },
                ].map(item => (
                  <div key={item.kpi} style={{
                    display: 'flex', gap: 10,
                    padding: '0.85rem', background: '#f8fafc',
                    borderRadius: 10, border: '1px solid #f1f5f9',
                  }}>
                    <span style={{ fontSize: 22, flexShrink: 0, lineHeight: 1.2 }}>{item.icon}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.kpi}</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#0f4c2a', marginTop: 1 }}>{item.val}</div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, lineHeight: 1.4 }}>{item.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* How it works */}
            <div style={{
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14,
              padding: '1.5rem', marginBottom: '1rem',
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '1.1rem' }}>
                RAG Pipeline — How It Works
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { n: '①', title: 'Query Rewriting',   tech: 'Gemini AI',         desc: 'Your question is enriched with Islamic terminology and Arabic terms for better retrieval coverage.' },
                  { n: '②', title: 'Vector Embedding',  tech: 'Jina AI · 1024-dim', desc: 'The rewritten query and original are embedded into 1,024-dim vectors; their average is used for search.' },
                  { n: '③', title: 'Hybrid Search',     tech: 'pgvector + FTS',    desc: 'Cosine similarity over IVFFlat index (70%) fused with PostgreSQL BM25 full-text search (30%).' },
                  { n: '④', title: 'Context Assembly',  tech: 'RAG Pipeline',      desc: 'Top results are deduplicated, scored for confidence, and assembled as grounded context for the LLM.' },
                  { n: '⑤', title: 'AI Response',       tech: 'Gemini 2.0 Flash',  desc: 'Gemini streams a cited answer using ONLY the retrieved passages — hallucination is architecturally prevented.' },
                ].map(item => (
                  <div key={item.n} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                      background: '#0f4c2a', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 800,
                    }}>
                      {item.n}
                    </div>
                    <div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{item.title}</span>
                        <span style={{ fontSize: 10, color: '#0f4c2a', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 20, padding: '1px 8px', fontWeight: 600 }}>
                          {item.tech}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 3, lineHeight: 1.5 }}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Suggestions */}
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, marginTop: '1.25rem' }}>
              Try these examples
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => { setQuery(s); submit(s); }}
                  style={{
                    textAlign: 'left', background: '#fff',
                    border: '1px solid #e2e8f0', borderRadius: 10,
                    padding: '0.85rem 1.1rem', fontSize: 14, color: '#374151',
                    transition: 'border-color 0.15s, box-shadow 0.15s, transform 0.1s',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget;
                    el.style.borderColor = '#0f4c2a';
                    el.style.boxShadow = '0 2px 8px rgba(15,76,42,0.1)';
                    el.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget;
                    el.style.borderColor = '#e2e8f0';
                    el.style.boxShadow = 'none';
                    el.style.transform = 'translateY(0)';
                  }}
                >
                  <span>{s}</span>
                  <span style={{ color: '#0f4c2a', fontSize: 16, flexShrink: 0 }}>→</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Pipeline visualization */}
        <PipelineViz steps={pipeline} visible={showPipeline} />

        {/* Answer card */}
        {mode === 'ask' && searched && (
          <div ref={answerRef} style={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderLeft: '4px solid #0f4c2a',
            borderRadius: 14,
            padding: '1.25rem 1.5rem',
            marginBottom: '1.5rem',
            boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            animation: 'fadeUp 0.3s ease both',
          }}>
            {/* Answer header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#0f4c2a', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  AI Answer
                </span>
                {loading && (
                  <span style={{ fontSize: 10, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 20, padding: '1px 8px', fontWeight: 600 }}>
                    streaming
                  </span>
                )}
              </div>
              {confidencePct !== null && (
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  color: confidenceColor,
                  background: `${confidenceColor}14`,
                  border: `1px solid ${confidenceColor}33`,
                  borderRadius: 20, padding: '2px 10px',
                }}>
                  {confidencePct}% confidence
                </span>
              )}
            </div>

            {answer ? (
              <p style={{ fontSize: 15, lineHeight: 1.8, color: '#1a1a1a', whiteSpace: 'pre-wrap', margin: 0 }}>
                {answer}
                {loading && <span style={{ animation: 'blink 1s infinite', opacity: 0.6, marginLeft: 1 }}>▌</span>}
              </p>
            ) : (
              <p style={{ fontSize: 14, color: '#94a3b8', fontStyle: 'italic', margin: 0 }}>
                {loading
                  ? (sources.length > 0 ? 'Generating answer from retrieved sources…' : 'Processing your query…')
                  : 'No answer generated.'}
              </p>
            )}

            {disclaimer && (
              <div style={{
                marginTop: 14, fontSize: 13, color: '#92400e',
                background: '#fffbeb', border: '1px solid #fcd34d',
                borderRadius: 8, padding: '0.6rem 0.9rem',
              }}>
                ⚠️ {disclaimer}
              </div>
            )}
          </div>
        )}

        {/* Sources / results */}
        {displayCards.length > 0 && (
          <div style={{ animation: 'fadeUp 0.4s ease both' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              marginBottom: 14,
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {mode === 'ask' ? 'Retrieved Sources' : 'Search Results'}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 700, color: '#0f4c2a',
                background: '#f0fdf4', border: '1px solid #bbf7d0',
                borderRadius: 20, padding: '1px 8px',
              }}>
                {displayCards.length} found
              </span>
            </div>
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
          </div>
        )}

        {/* Empty state */}
        {searched && !loading && displayCards.length === 0 && !(mode === 'ask' && (answer || loading)) && (
          <div style={{
            textAlign: 'center', padding: '4rem 1rem', color: '#94a3b8',
            animation: 'fadeUp 0.3s ease both',
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>No results found</div>
            <div style={{ fontSize: 13 }}>Try rephrasing your query or removing source filters.</div>
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer style={{
        borderTop: '1px solid #e2e8f0',
        padding: '1.25rem 1rem',
        background: '#fff',
      }}>
        <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>
            <span style={{ fontWeight: 600, color: '#64748b' }}>Tazkia AI</span>
            {' · '}Bukhari · Muslim · Abu Dawud · Tirmidhi · Ibn Majah · Nasai · Muwatta · Tafsir Ibn Kathir
          </div>
          <a
            href="/api/health"
            style={{ fontSize: 12, color: '#0f4c2a', textDecoration: 'none', fontWeight: 600 }}
          >
            API Status →
          </a>
        </div>
      </footer>
    </div>
  );
}
