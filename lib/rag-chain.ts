import { getEmbeddings } from './embeddings';
import { hybridSearch } from './vectorstore';
import { checkSources, LOW_CONFIDENCE_RESPONSE, NO_SOURCES_RESPONSE } from './guardrails';
import { detectSourceTypes } from './detect-source';
import type { AskRequest, SearchResult } from './types';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL = () => process.env.GOOGLE_MODEL ?? 'gemini-2.0-flash';
const headers = () => ({
  'x-goog-api-key': process.env.GOOGLE_API_KEY!,
  'Content-Type': 'application/json',
});

export const PIPELINE_STEPS = [
  { step: 1, label: 'Query Rewrite',    tech: 'Gemini AI' },
  { step: 2, label: 'Vector Embedding', tech: 'Jina AI · 1024-dim' },
  { step: 3, label: 'Hybrid Search',    tech: 'pgvector + FTS' },
  { step: 4, label: 'Context Assembly', tech: 'RAG Pipeline' },
  { step: 5, label: 'AI Response',      tech: 'Gemini 2.0 Flash' },
] as const;

// ── Prompts ──────────────────────────────────────────────────────────────────

const REWRITE_PROMPT = (question: string) =>
  `You are helping retrieve Islamic knowledge. Rewrite the question below to be more specific
and include relevant Islamic terminology (Arabic terms if applicable).
Return ONLY the rewritten query — no explanation, no punctuation changes.

Question: ${question}
Rewritten:`;

const RAG_PROMPT = (context: string, question: string) =>
  `You are Tazkia, a respectful Islamic knowledge assistant. Answer using ONLY the sources below.

RULES (NON-NEGOTIABLE):
1. Use ONLY information present in the provided sources. Do not add anything external.
2. Cite every claim: [Quran 2:255], [Bukhari #1], [Tafsir Ibn Kathir], etc.
3. If sources are insufficient: "Based on the available sources, I cannot fully answer this question."
4. Do NOT issue fatwas. If asked for a ruling: "This requires consultation with a qualified Islamic scholar."
5. Maintain a calm, scholarly, non-sectarian tone.

SOURCES:
${context}

QUESTION: ${question}

Answer (with citations):`;

// ── Helpers ──────────────────────────────────────────────────────────────────

export async function rewriteQuery(question: string): Promise<string> {
  try {
    const res = await fetch(`${BASE}/models/${MODEL()}:generateContent`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        contents: [{ parts: [{ text: REWRITE_PROMPT(question) }] }],
      }),
    });
    const data = await res.json() as { candidates?: Array<{ content: { parts: Array<{ text: string }> } }> };
    return data.candidates?.[0]?.content.parts[0]?.text?.trim() || question;
  } catch {
    return question;
  }
}

export function formatContext(sources: SearchResult[]): string {
  return sources
    .map((s, idx) => {
      const m = s.metadata;
      let tag = '';
      if (m.source_type === 'quran')
        tag = `[Quran ${m.surah_number}:${m.verse_number}]`;
      else if (m.source_type === 'hadith')
        tag = `[${capitalize(m.book ?? 'Hadith')} #${m.hadith_number ?? '?'}${m.grade ? ` — ${m.grade}` : ''}]`;
      else if (m.source_type === 'tafsir')
        tag = `[Tafsir — ${m.author ?? m.tafsir_name ?? 'Unknown'}]`;
      return `[${idx + 1}] ${tag}\n${s.content}`;
    })
    .join('\n\n---\n\n');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface RAGContext {
  sources: SearchResult[];
  confidence: number;
  fallbackMessage?: string;
}

export async function buildRAGContext(request: AskRequest): Promise<RAGContext> {
  const embeddings = getEmbeddings();

  const rewrittenQuery = await rewriteQuery(request.query);
  const [origVec, rewrittenVec] = await Promise.all([
    embeddings.embedQuery(request.query),
    embeddings.embedQuery(rewrittenQuery),
  ]);
  const avgVec = origVec.map((v, i) => (v + rewrittenVec[i]) / 2);

  const sources = await hybridSearch({
    query: rewrittenQuery,
    queryEmbedding: avgVec,
    sourceTypes: request.source_types ?? detectSourceTypes(request.query),
    language: request.language ?? 'en',
    topK: Math.min(request.top_k ?? 5, 8),
  });

  if (sources.length === 0)
    return { sources: [], confidence: 0, fallbackMessage: NO_SOURCES_RESPONSE };

  const gate = checkSources(sources);
  if (!gate.passed)
    return { sources, confidence: gate.confidence, fallbackMessage: LOW_CONFIDENCE_RESPONSE };

  return { sources, confidence: gate.confidence };
}

/**
 * Streams the LLM answer using Gemini's streamGenerateContent REST endpoint.
 * The response is a JSON array streamed as newline-delimited chunks.
 */
export async function* streamAnswer(
  question: string,
  sources: SearchResult[]
): AsyncGenerator<string> {
  const context = formatContext(sources);

  const res = await fetch(
    `${BASE}/models/${MODEL()}:streamGenerateContent`,
    {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        contents: [{ parts: [{ text: RAG_PROMPT(context, question) }] }],
      }),
    }
  );

  if (!res.ok || !res.body) {
    const err = await res.text();
    throw new Error(`Gemini stream error: ${err}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Gemini streams a JSON array — parse each line as a partial JSON object
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim().replace(/^,/, '');
      if (!trimmed || trimmed === '[' || trimmed === ']') continue;
      try {
        const chunk = JSON.parse(trimmed) as {
          candidates?: Array<{ content: { parts: Array<{ text?: string }> } }>;
        };
        const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) yield text;
      } catch {
        // incomplete JSON line — will be completed in next chunk
      }
    }
  }
}
