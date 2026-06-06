'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { SourceType } from '@/lib/types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ResultMeta {
  source_type: string;
  surah_number?: number; verse_number?: number; surah_name?: string;
  book?: string; hadith_number?: number | string; grade?: string;
  author?: string; tafsir_name?: string; reference?: string;
}
interface AskSource    { id: string; metadata: ResultMeta; similarity: number; excerpt: string; }
interface SearchResult { id: string; content: string; metadata: ResultMeta; similarity: number; }
type StepStatus = 'idle' | 'active' | 'done' | 'error';
interface PipelineStep { step: number; label: string; tech: string; status: StepStatus; duration_ms?: number; }
interface SourceStats {
  quran: { document_count: number }; hadith: { document_count: number };
  tafsir: { document_count: number }; total_documents: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PIPELINE_INIT: PipelineStep[] = [
  { step: 1, label: 'Query Rewrite',  tech: 'Gemini AI',          status: 'idle' },
  { step: 2, label: 'Vector Embed',   tech: 'Jina AI · 1024-dim', status: 'idle' },
  { step: 3, label: 'Hybrid Search',  tech: 'pgvector + FTS',     status: 'idle' },
  { step: 4, label: 'RAG Assembly',   tech: 'Context Pipeline',   status: 'idle' },
  { step: 5, label: 'AI Generation',  tech: 'Gemini 2.0 Flash',   status: 'idle' },
];

const SOURCE_COLOR: Record<string, string> = {
  quran: '#10b981', hadith: '#3b82f6', tafsir: '#a855f7',
};
const SOURCE_LABEL: Record<string, string> = {
  quran: 'Quran', hadith: 'Hadith', tafsir: 'Tafsir',
};
const SUGGESTIONS = [
  'What does the Quran say about patience in hardship?',
  'Hadith about the importance of seeking knowledge',
  'How should a Muslim treat their parents?',
  'Significance of Surah Al-Fatiha according to Ibn Kathir',
  'Hadith on virtues of the last third of the night',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fmtMs = (ms: number) => ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;

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

// ── Design tokens ─────────────────────────────────────────────────────────────

const T = {
  bg:       '#060912',
  surface:  '#0c1120',
  s2:       '#111827',
  s3:       '#1a2238',
  border:   'rgba(255,255,255,0.07)',
  borderHi: 'rgba(255,255,255,0.13)',
  text:     '#e2e8f0',
  muted:    '#64748b',
  dim:      '#374151',
  cyan:     '#22d3ee',
  cyanDim:  'rgba(34,211,238,0.12)',
  green:    '#10b981',
  greenDim: 'rgba(16,185,129,0.12)',
  purple:   '#a855f7',
  purpleDim:'rgba(168,85,247,0.12)',
  amber:    '#f59e0b',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function GlassCard({ children, style = {}, glow }: {
  children: React.ReactNode; style?: React.CSSProperties; glow?: string;
}) {
  return (
    <div style={{
      background: T.surface,
      border: `1px solid ${glow ? `${glow}30` : T.border}`,
      borderRadius: 14,
      backdropFilter: 'blur(12px)',
      boxShadow: glow ? `0 0 30px ${glow}15, inset 0 1px 0 ${glow}10` : 'none',
      ...style,
    }}>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
      textTransform: 'uppercase', color: T.muted, marginBottom: '1rem',
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <span style={{ width: 16, height: 1, background: T.muted, display: 'inline-block', opacity: 0.5 }} />
      {children}
      <span style={{ width: 16, height: 1, background: T.muted, display: 'inline-block', opacity: 0.5 }} />
    </div>
  );
}

function MetricBlock({ value, label, sub, accent }: {
  value: string; label: string; sub: string; accent?: string;
}) {
  const c = accent ?? T.cyan;
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 12, padding: '1.1rem 1.25rem',
      borderTop: `2px solid ${c}`,
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{
        fontFamily: 'monospace', fontSize: 'clamp(1.3rem,3vw,1.8rem)',
        fontWeight: 800, color: c, letterSpacing: '-0.02em', lineHeight: 1,
      }}>
        {value}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginTop: 4 }}>{label}</div>
      <div style={{ fontSize: 10, color: T.muted, letterSpacing: '0.02em' }}>{sub}</div>
    </div>
  );
}

function SourceCard({ meta, excerpt, similarity }: {
  meta: ResultMeta; excerpt: string; similarity: number;
}) {
  const color = SOURCE_COLOR[meta.source_type] ?? T.muted;
  const pct   = Math.round(similarity * 100);
  return (
    <div style={{
      background: T.surface, borderRadius: 12,
      border: `1px solid ${color}25`,
      borderLeft: `3px solid ${color}`,
      padding: '1.1rem 1.25rem',
      display: 'flex', flexDirection: 'column', gap: 10,
      boxShadow: `0 0 20px ${color}08`,
      animation: 'fadeUp 0.3s ease both',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          background: `${color}20`, color, border: `1px solid ${color}40`,
          fontSize: 9, fontWeight: 800, padding: '2px 10px',
          borderRadius: 20, textTransform: 'uppercase', letterSpacing: '0.1em',
        }}>
          {SOURCE_LABEL[meta.source_type] ?? meta.source_type}
        </span>
        <span style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>{refLabel(meta)}</span>
        {meta.grade && (
          <span style={{
            fontSize: 10, color: T.amber, background: `${T.amber}15`,
            border: `1px solid ${T.amber}30`, borderRadius: 20, padding: '1px 8px',
          }}>
            {meta.grade}
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: 13, fontWeight: 800, color }}>
          {pct}%
        </span>
      </div>
      <div style={{ height: 2, background: T.s3, borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: `linear-gradient(90deg, ${color}60, ${color})`,
          borderRadius: 2, transition: 'width 0.8s ease',
          boxShadow: `0 0 8px ${color}80`,
        }} />
      </div>
      <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.75, margin: 0 }}>
        {excerpt.length > 320 ? excerpt.slice(0, 320) + '…' : excerpt}
      </p>
    </div>
  );
}

function PipelineViz({ steps, visible }: { steps: PipelineStep[]; visible: boolean }) {
  if (!visible) return null;
  const totalMs = steps.reduce((a, s) => a + (s.duration_ms ?? 0), 0);
  const allDone = steps.every(s => s.status === 'done');

  return (
    <GlassCard style={{ padding: '1.25rem 1.5rem', marginBottom: '1.25rem', animation: 'fadeUp 0.3s ease both' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.cyan, boxShadow: `0 0 8px ${T.cyan}` }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            RAG Pipeline
          </span>
        </div>
        {allDone && (
          <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: T.green, background: T.greenDim, border: `1px solid ${T.green}30`, borderRadius: 20, padding: '3px 12px' }}>
            ✓ {fmtMs(totalMs)} total
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
        {steps.map(s => {
          const isDone   = s.status === 'done';
          const isActive = s.status === 'active';
          const accent   = isDone ? T.green : isActive ? T.cyan : T.dim;
          return (
            <div key={s.step} style={{
              background: isActive ? T.cyanDim : isDone ? T.greenDim : T.s2,
              border: `1px solid ${isActive ? T.cyan : isDone ? T.green : T.border}`,
              borderTop: `2px solid ${accent}`,
              borderRadius: 10, padding: '0.85rem 0.9rem',
              transition: 'all 0.35s ease',
              boxShadow: isActive ? `0 0 18px ${T.cyan}25` : isDone ? `0 0 12px ${T.green}15` : 'none',
              animation: isActive ? 'pulse-cyan 2s infinite' : 'none',
            }}>
              <div style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 800, color: accent, marginBottom: 5, letterSpacing: '0.05em' }}>
                {String(s.step).padStart(2, '0')}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: isDone || isActive ? T.text : T.muted, lineHeight: 1.3 }}>
                {s.label}
              </div>
              <div style={{ fontSize: 10, color: T.muted, marginTop: 3 }}>{s.tech}</div>
              {isDone && s.duration_ms !== undefined && (
                <div style={{ marginTop: 6, fontFamily: 'monospace', fontSize: 10, fontWeight: 800, color: T.green }}>
                  ✓ {fmtMs(s.duration_ms)}
                </div>
              )}
              {isActive && (
                <div style={{ marginTop: 6, fontSize: 10, color: T.cyan, fontWeight: 600 }}>◉ running…</div>
              )}
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}

// ── Hero Search ───────────────────────────────────────────────────────────────

function HeroSearch({
  query, setQuery, mode, setMode, filters, toggleFilter, clearFilters, loading, onSubmit, inputRef,
}: {
  query: string; setQuery: (v: string) => void;
  mode: 'ask' | 'search'; setMode: (m: 'ask' | 'search') => void;
  filters: SourceType[]; toggleFilter: (t: SourceType) => void; clearFilters: () => void;
  loading: boolean; onSubmit: (e: React.FormEvent) => void;
  inputRef: React.RefObject<HTMLInputElement>;
}) {
  const active = !!query.trim() && !loading;
  return (
    <div style={{
      position: 'relative',
      background: T.s2,
      border: `1.5px solid ${T.cyan}40`,
      borderRadius: 18,
      padding: '0.25rem 0.25rem 0.75rem',
      boxShadow: `0 0 0 1px ${T.cyan}10, 0 0 60px ${T.cyan}12, 0 8px 40px rgba(0,0,0,0.5)`,
    }}>
      {/* Top glow line */}
      <div style={{
        position: 'absolute', top: 0, left: '10%', right: '10%', height: 1,
        background: `linear-gradient(90deg, transparent, ${T.cyan}80, transparent)`,
        borderRadius: 1,
      }} />

      <form onSubmit={onSubmit}>
        <div style={{ display: 'flex', gap: 0, alignItems: 'stretch' }}>
          {/* Mode pill (left of input) */}
          <div style={{ display: 'flex', alignItems: 'center', paddingLeft: '0.75rem', gap: 6, flexShrink: 0 }}>
            {(['ask', 'search'] as const).map(m => (
              <button
                key={m} type="button" onClick={() => setMode(m)}
                style={{
                  padding: '4px 12px', borderRadius: 20, fontSize: 10, fontWeight: 800,
                  border: `1px solid ${mode === m ? T.cyan : 'transparent'}`,
                  background: mode === m ? T.cyanDim : 'transparent',
                  color: mode === m ? T.cyan : T.muted,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  transition: 'all 0.15s', whiteSpace: 'nowrap',
                }}
              >
                {m === 'ask' ? 'Ask AI' : 'Search'}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div style={{ width: 1, background: T.border, margin: '0.5rem 0.5rem' }} />

          {/* Input */}
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={mode === 'ask'
              ? 'Ask anything about Quran, Hadith, or Tafsir…'
              : 'Semantic search across 44,000+ Islamic texts…'}
            disabled={loading}
            style={{
              flex: 1, padding: '1rem 0.75rem',
              background: 'transparent', border: 'none',
              fontSize: 16, outline: 'none',
              color: T.text,
            }}
          />

          {/* Submit */}
          <button
            type="submit"
            disabled={!active}
            style={{
              margin: '0.4rem',
              background: active
                ? `linear-gradient(135deg, ${T.cyan}, #0891b2)`
                : T.s3,
              color: active ? '#000' : T.muted,
              border: `1px solid ${active ? T.cyan : T.border}`,
              borderRadius: 12, padding: '0 1.5rem',
              fontSize: 13, fontWeight: 900,
              letterSpacing: '0.05em', whiteSpace: 'nowrap',
              transition: 'all 0.2s',
              boxShadow: active ? `0 0 20px ${T.cyan}50` : 'none',
              minWidth: 100,
            }}
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ animation: 'blink 1s infinite', color: T.cyan }}>◉</span> Running
              </span>
            ) : mode === 'ask' ? '⟡ Ask AI' : '⟡ Search'}
          </button>
        </div>
      </form>

      {/* Source filters row */}
      <div style={{ display: 'flex', gap: 6, paddingLeft: '1rem', paddingTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: T.muted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginRight: 4 }}>
          Filter:
        </span>
        {(['quran', 'hadith', 'tafsir'] as SourceType[]).map(t => (
          <button
            key={t} type="button" onClick={() => toggleFilter(t)}
            style={{
              padding: '3px 12px', borderRadius: 20, fontSize: 10, fontWeight: 700,
              border: `1px solid ${filters.includes(t) ? SOURCE_COLOR[t] : T.border}`,
              background: filters.includes(t) ? `${SOURCE_COLOR[t]}20` : 'transparent',
              color: filters.includes(t) ? SOURCE_COLOR[t] : T.muted,
              letterSpacing: '0.05em', textTransform: 'uppercase',
              transition: 'all 0.15s',
            }}
          >
            {SOURCE_LABEL[t]}
          </button>
        ))}
        {filters.length > 0 && (
          <button
            type="button"
            onClick={clearFilters}
            style={{ fontSize: 10, color: T.muted, background: 'none', border: 'none', padding: '3px 8px', cursor: 'pointer' }}
          >
            — all sources
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Home() {
  const [query, setQuery]           = useState('');
  const [filters, setFilters]       = useState<SourceType[]>([]);
  const [mode, setMode]             = useState<'ask' | 'search'>('ask');
  const [loading, setLoading]       = useState(false);
  const [searched, setSearched]     = useState(false);
  const [answer, setAnswer]         = useState('');
  const [disclaimer, setDisclaimer] = useState('');
  const [confidence, setConfidence] = useState<number | null>(null);
  const [sources, setSources]       = useState<AskSource[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [pipeline, setPipeline]     = useState<PipelineStep[]>(PIPELINE_INIT.map(s => ({ ...s })));
  const [stats, setStats]           = useState<SourceStats | null>(null);
  const [showPipeline, setShowPipeline] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/sources').then(r => r.json())
      .then((d: { sources: Omit<SourceStats, 'total_documents'>; total_documents: number }) =>
        setStats({ ...d.sources, total_documents: d.total_documents ?? 0 }))
      .catch(() => {});
  }, []);

  const toggleFilter = (t: SourceType) =>
    setFilters(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  const reset = () => {
    setAnswer(''); setDisclaimer(''); setSources([]); setSearchResults([]);
    setConfidence(null); setPipeline(PIPELINE_INIT.map(s => ({ ...s }))); setShowPipeline(false);
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
        const res  = await fetch('/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: abortRef.current.signal });
        const data = await res.json() as { results?: SearchResult[] };
        setSearchResults(data.results ?? []);
        setLoading(false);
      } else {
        setShowPipeline(true);
        const res = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: abortRef.current.signal });
        if (!res.body) throw new Error('No stream');
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        outer: while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const parts = buf.split('\n\n'); buf = parts.pop() ?? '';
          for (const part of parts) {
            if (!part.startsWith('data: ')) continue;
            const raw = part.slice(6);
            if (raw === '[DONE]') break outer;
            try {
              const evt = JSON.parse(raw) as {
                type: string; step?: number; status?: 'active'|'done'; duration_ms?: number;
                token?: string; sources?: AskSource[]; message?: string; confidence?: number;
              };
              if (evt.type === 'pipeline' && evt.step)
                setPipeline(prev => prev.map(s => s.step === evt.step ? { ...s, status: evt.status ?? s.status, duration_ms: evt.duration_ms } : s));
              if (evt.type === 'sources')    setSources(evt.sources ?? []);
              if (evt.type === 'token')      setAnswer(a => a + (evt.token ?? ''));
              if (evt.type === 'disclaimer') setDisclaimer(evt.message ?? '');
              if (evt.type === 'done')       setConfidence(evt.confidence ?? null);
              if (evt.type === 'error')      setAnswer(evt.message ?? 'Error occurred.');
            } catch { /* partial chunk */ }
          }
        }
        setLoading(false);
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setAnswer('Something went wrong. Please try again.');
      setLoading(false);
    }
  }, [query, filters, mode, loading]);

  const onSubmit = (e: React.FormEvent) => { e.preventDefault(); submit(query); };

  const displayCards: Array<AskSource | (SearchResult & { excerpt: string })> =
    mode === 'ask' ? sources : searchResults.map(r => ({ ...r, excerpt: r.content }));

  const confPct   = confidence !== null ? Math.round(confidence * 100) : null;
  const confColor = confPct === null ? T.muted : confPct >= 75 ? T.green : confPct >= 50 ? T.amber : '#ef4444';

  const M = {
    total:  stats ? stats.total_documents.toLocaleString() : '44,193+',
    hadith: stats ? stats.hadith.document_count.toLocaleString() : '31,757',
    quran:  stats ? stats.quran.document_count.toLocaleString() : '6,236',
    tafsir: stats ? stats.tafsir.document_count.toLocaleString() : '6,200',
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: T.bg }}>

      {/* ── Hero header ────────────────────────────────────────────────────── */}
      <header style={{
        position: 'relative', overflow: 'hidden',
        padding: '3rem 1.25rem 2.5rem',
        background: `radial-gradient(ellipse 90% 70% at 50% 0%, rgba(34,211,238,0.07) 0%, transparent 65%), ${T.bg}`,
        borderBottom: `1px solid ${T.border}`,
      }}>
        {/* Grid bg */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.35,
          backgroundImage: `linear-gradient(${T.border} 1px, transparent 1px), linear-gradient(90deg, ${T.border} 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }} />

        <div style={{ position: 'relative', maxWidth: 780, margin: '0 auto' }}>

          {/* Brand */}
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{
              display: 'inline-block',
              background: `linear-gradient(135deg, ${T.cyan}, #fff 45%, ${T.purple})`,
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              fontSize: 'clamp(2.2rem, 7vw, 3.5rem)', fontWeight: 900,
              letterSpacing: '-0.04em', lineHeight: 1.05, marginBottom: 10,
            }}>
              TAZKIA AI
            </div>
            <div style={{ fontSize: 13, color: '#94a3b8', letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 14 }}>
              Islamic Knowledge Intelligence · RAG System
            </div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
              {['44,193+ Documents', 'Hybrid Vector Search', 'Real-time Streaming', 'Zero Hallucination'].map(tag => (
                <span key={tag} style={{
                  fontSize: 10, fontWeight: 700, color: T.muted,
                  background: T.surface, border: `1px solid ${T.border}`,
                  borderRadius: 20, padding: '3px 12px', letterSpacing: '0.04em',
                }}>
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* ── Hero Search ── */}
          <HeroSearch
            query={query} setQuery={setQuery}
            mode={mode} setMode={setMode}
            filters={filters} toggleFilter={toggleFilter} clearFilters={() => setFilters([])}
            loading={loading} onSubmit={onSubmit} inputRef={inputRef}
          />

          {/* ── Quick suggestions (only on landing) ── */}
          {!searched && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ fontSize: 10, color: T.muted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8, textAlign: 'center' }}>
                Try an example
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => { setQuery(s); submit(s); }}
                    style={{
                      background: T.surface, border: `1px solid ${T.border}`,
                      borderRadius: 20, padding: '5px 14px',
                      fontSize: 12, color: '#94a3b8',
                      transition: 'all 0.2s', whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = T.cyan;
                      e.currentTarget.style.color = T.cyan;
                      e.currentTarget.style.background = T.cyanDim;
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = T.border;
                      e.currentTarget.style.color = '#94a3b8';
                      e.currentTarget.style.background = T.surface;
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </header>


      {/* ── Main content ───────────────────────────────────────────────────── */}
      <main style={{ flex: 1, maxWidth: 780, width: '100%', margin: '0 auto', padding: '1.75rem 1.25rem 4rem' }}>

        {/* ── Landing dashboard (before any query) ──────────────────────── */}
        {!searched && (
          <div style={{ animation: 'fadeUp 0.4s ease both' }}>

            {/* Bento: KB breakdown + KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>

              <GlassCard style={{ padding: '1.5rem' }}>
                <Label>Knowledge Base</Label>
                {[
                  { color: T.green,   label: 'QURAN',  title: `${M.quran} Verses`,         sub: '6,236 ayat · 114 Surahs · Sahih International',     pct: stats ? Math.round(stats.quran.document_count  / stats.total_documents * 100) : 14 },
                  { color: '#3b82f6', label: 'HADITH', title: `${M.hadith} Hadiths`,        sub: 'Bukhari · Muslim · Abu Dawud · Tirmidhi · Ibn Majah · Nasai · Muwatta', pct: stats ? Math.round(stats.hadith.document_count / stats.total_documents * 100) : 72 },
                  { color: T.purple,  label: 'TAFSIR', title: `${M.tafsir} Commentaries`,   sub: 'Tafsir Ibn Kathir · every ayah covered',            pct: stats ? Math.round(stats.tafsir.document_count / stats.total_documents * 100) : 14 },
                ].map(row => (
                  <div key={row.label} style={{ marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 9, fontWeight: 900, color: row.color, background: `${row.color}20`, border: `1px solid ${row.color}40`, padding: '1px 8px', borderRadius: 20, letterSpacing: '0.1em' }}>
                          {row.label}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{row.title}</span>
                      </div>
                      <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 800, color: row.color }}>{row.pct}%</span>
                    </div>
                    <div style={{ height: 4, background: T.s3, borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${row.pct}%`, height: '100%', background: `linear-gradient(90deg, ${row.color}60, ${row.color})`, borderRadius: 2, boxShadow: `0 0 6px ${row.color}60` }} />
                    </div>
                    <div style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>{row.sub}</div>
                  </div>
                ))}
              </GlassCard>

              <GlassCard style={{ padding: '1.5rem' }}>
                <Label>System KPIs</Label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { icon: '⟡', kpi: 'Retrieval',     val: 'Hybrid Search',  sub: 'Semantic 70% + BM25 30%',    c: T.cyan },
                    { icon: '◈', kpi: 'Embeddings',     val: 'Jina AI v3',     sub: '1,024-dim · 8k token ctx',   c: '#3b82f6' },
                    { icon: '⚡', kpi: 'Index',          val: 'IVFFlat ANN',    sub: 'lists=100 · probes=10',      c: T.amber },
                    { icon: '✓', kpi: 'Grounding',      val: '100% Cited',     sub: 'No hallucination enforced',  c: T.green },
                    { icon: '◎', kpi: 'Confidence',     val: 'Real-time',      sub: 'Per-response scoring',       c: T.purple },
                    { icon: '⟳', kpi: 'Query Augment', val: 'LLM Rewrite',    sub: 'Arabic + Islamic terms',     c: T.cyan },
                    { icon: '▸', kpi: 'Streaming',      val: 'SSE Tokens',     sub: 'Real-time generation',       c: T.green },
                    { icon: '◆', kpi: 'Sources',        val: 'Sahih / Hasan',  sub: '1400yr authenticated texts', c: T.amber },
                  ].map(item => (
                    <div key={item.kpi} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.55rem 0.75rem', background: T.s2, borderRadius: 8, border: `1px solid ${T.border}` }}>
                      <span style={{ fontSize: 14, color: item.c, width: 18, textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                          <span style={{ fontSize: 9, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>{item.kpi}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: item.c }}>{item.val}</span>
                        </div>
                        <div style={{ fontSize: 10, color: T.muted, marginTop: 1 }}>{item.sub}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </GlassCard>
            </div>

            {/* Pipeline architecture */}
            <GlassCard style={{ padding: '1.5rem', marginBottom: 12 }}>
              <Label>RAG Pipeline Architecture</Label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                {[
                  { n: '01', label: 'Query Rewrite', tech: 'Gemini AI',  desc: 'Enriched with Islamic terms' },
                  { n: '02', label: 'Vector Embed',  tech: 'Jina AI',    desc: '1,024-dim representation'   },
                  { n: '03', label: 'Hybrid Search', tech: 'pgvector',   desc: 'ANN + BM25 fusion'          },
                  { n: '04', label: 'RAG Assembly',  tech: 'Pipeline',   desc: 'Rank · deduplicate · score' },
                  { n: '05', label: 'AI Response',   tech: 'Gemini 2.0', desc: 'Grounded · cited · streamed'},
                ].map(s => (
                  <div key={s.n} style={{
                    background: T.s2, border: `1px solid ${T.border}`,
                    borderTop: `2px solid ${T.cyan}`,
                    borderRadius: 10, padding: '0.85rem 0.9rem',
                  }}>
                    <div style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 800, color: T.cyan, marginBottom: 5 }}>{s.n}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.text, lineHeight: 1.3 }}>{s.label}</div>
                    <div style={{ fontSize: 10, color: T.muted, marginTop: 3 }}>{s.tech}</div>
                    <div style={{ fontSize: 10, color: T.muted, marginTop: 6, lineHeight: 1.5 }}>{s.desc}</div>
                  </div>
                ))}
              </div>
            </GlassCard>

          </div>
        )}

        {/* ── Pipeline tracker ───────────────────────────────────────────── */}
        <PipelineViz steps={pipeline} visible={showPipeline} />

        {/* ── Answer ─────────────────────────────────────────────────────── */}
        {mode === 'ask' && searched && (
          <GlassCard glow={T.green} style={{ padding: '1.25rem 1.5rem', marginBottom: '1.25rem', animation: 'fadeUp 0.3s ease both', borderLeft: `3px solid ${T.green}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.green, boxShadow: `0 0 8px ${T.green}` }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  AI Answer
                </span>
                {loading && (
                  <span style={{ fontSize: 9, color: T.cyan, background: T.cyanDim, border: `1px solid ${T.cyan}30`, borderRadius: 20, padding: '1px 8px', fontWeight: 700 }}>
                    STREAMING
                  </span>
                )}
              </div>
              {confPct !== null && (
                <span style={{
                  fontFamily: 'monospace', fontSize: 12, fontWeight: 800, color: confColor,
                  background: `${confColor}15`, border: `1px solid ${confColor}30`,
                  borderRadius: 20, padding: '3px 12px',
                }}>
                  {confPct}% confidence
                </span>
              )}
            </div>
            {answer ? (
              <p style={{ fontSize: 14, lineHeight: 1.85, color: '#cbd5e1', whiteSpace: 'pre-wrap', margin: 0 }}>
                {answer}
                {loading && <span style={{ animation: 'blink 1s infinite', color: T.cyan, marginLeft: 1 }}>▌</span>}
              </p>
            ) : (
              <p style={{ fontSize: 14, color: T.muted, fontStyle: 'italic', margin: 0 }}>
                {loading ? 'Processing your query…' : 'No answer generated.'}
              </p>
            )}
            {disclaimer && (
              <div style={{ marginTop: 14, fontSize: 12, color: T.amber, background: `${T.amber}10`, border: `1px solid ${T.amber}30`, borderRadius: 8, padding: '0.6rem 0.9rem' }}>
                ⚠ {disclaimer}
              </div>
            )}
          </GlassCard>
        )}

        {/* ── Sources / results ──────────────────────────────────────────── */}
        {displayCards.length > 0 && (
          <div style={{ animation: 'fadeUp 0.4s ease both' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                {mode === 'ask' ? 'Retrieved Sources' : 'Search Results'}
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 800, color: T.cyan, background: T.cyanDim, border: `1px solid ${T.cyan}30`, borderRadius: 20, padding: '1px 10px' }}>
                {displayCards.length}
              </span>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {displayCards.map((s, i) => (
                <SourceCard key={s.id ?? i} meta={s.metadata} excerpt={s.excerpt} similarity={s.similarity} />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {searched && !loading && displayCards.length === 0 && !(mode === 'ask' && (answer || loading)) && (
          <div style={{ textAlign: 'center', padding: '5rem 1rem', color: T.muted, animation: 'fadeUp 0.3s ease both' }}>
            <div style={{ fontFamily: 'monospace', fontSize: 40, marginBottom: 12, opacity: 0.3 }}>◎</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 6 }}>No results found</div>
            <div style={{ fontSize: 12 }}>Try rephrasing your query or removing source filters.</div>
          </div>
        )}
      </main>

      {/* ── Stats strip above footer ────────────────────────────────────────── */}
      <div style={{
        borderTop: `1px solid ${T.border}`,
        background: `radial-gradient(ellipse 80% 100% at 50% 100%, rgba(34,211,238,0.05) 0%, transparent 70%), ${T.s2}`,
        padding: '2.5rem 1.25rem',
      }}>
        <div style={{ maxWidth: 780, margin: '0 auto' }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: T.muted, textTransform: 'uppercase',
            letterSpacing: '0.15em', textAlign: 'center', marginBottom: '1.75rem',
            display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center',
          }}>
            <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg, transparent, ${T.border})`, display: 'inline-block' }} />
            Knowledge Base at a Glance
            <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${T.border}, transparent)`, display: 'inline-block' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 12 }}>
            {[
              { value: '44,193+', label: 'Documents',     sub: 'total indexed',       accent: T.cyan },
              { value: '31,757',  label: 'Hadiths',        sub: '7 major collections', accent: '#3b82f6' },
              { value: '6,236',   label: 'Quranic Verses', sub: '114 Surahs · complete', accent: T.green },
              { value: '~5M',     label: 'Tokens',         sub: 'knowledge corpus',    accent: T.amber },
              { value: '1,024',   label: 'Dimensions',     sub: 'Jina AI embedding',   accent: T.cyan },
              { value: '<500ms',  label: 'Latency',        sub: 'hybrid search',       accent: T.green },
              { value: '100%',    label: 'Cited',          sub: 'zero hallucination',  accent: T.green },
            ].map(m => (
              <div key={m.label} style={{
                textAlign: 'center',
                padding: '1rem 0.5rem',
                borderTop: `2px solid ${m.accent}30`,
                borderBottom: `1px solid ${T.border}`,
              }}>
                <div style={{
                  fontFamily: 'monospace',
                  fontSize: 'clamp(1.2rem, 3vw, 1.75rem)',
                  fontWeight: 900, color: m.accent,
                  letterSpacing: '-0.02em', lineHeight: 1,
                  textShadow: `0 0 20px ${m.accent}50`,
                }}>
                  {m.value}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.text, marginTop: 6 }}>{m.label}</div>
                <div style={{ fontSize: 10, color: T.muted, marginTop: 3 }}>{m.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: `1px solid ${T.border}`, padding: '1.1rem 1.25rem', background: T.surface }}>
        <div style={{ maxWidth: 780, margin: '0 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontSize: 11, color: T.muted, fontFamily: 'monospace' }}>
            TAZKIA AI · Bukhari · Muslim · Abu Dawud · Tirmidhi · Ibn Majah · Nasai · Muwatta · Tafsir Ibn Kathir
          </div>
          <a href="/api/health" style={{ fontSize: 11, color: T.cyan, textDecoration: 'none', fontWeight: 700, fontFamily: 'monospace' }}>
            API STATUS →
          </a>
        </div>
      </footer>
    </div>
  );
}
