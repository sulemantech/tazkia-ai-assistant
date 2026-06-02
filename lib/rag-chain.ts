import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import { getEmbeddings } from './embeddings';
import { hybridSearch } from './vectorstore';
import { checkSources, LOW_CONFIDENCE_RESPONSE, NO_SOURCES_RESPONSE } from './guardrails';
import type { AskRequest, SearchResult } from './types';

// ── Prompts ─────────────────────────────────────────────────────────────────

const REWRITE_PROMPT = PromptTemplate.fromTemplate(
  `You are helping retrieve Islamic knowledge. Rewrite the question below to be more specific
and include relevant Islamic terminology (Arabic terms if applicable).
Return ONLY the rewritten query — no explanation, no punctuation changes.

Question: {question}
Rewritten:`
);

// Strict grounding prompt: model is forbidden from going beyond the sources
const RAG_PROMPT = PromptTemplate.fromTemplate(
  `You are Tazkia, a respectful Islamic knowledge assistant. Answer using ONLY the sources below.

RULES (NON-NEGOTIABLE):
1. Use ONLY information present in the provided sources. Do not add anything external.
2. Cite every claim with its reference tag: [Quran 2:255], [Bukhari #1], [Tafsir Ibn Kathir], etc.
3. If the sources do not contain enough information, say exactly:
   "Based on the available sources, I cannot fully answer this question."
4. Do NOT issue fatwas or rulings. If the question asks for a ruling, say:
   "This requires consultation with a qualified Islamic scholar."
5. Maintain a calm, scholarly, and non-sectarian tone.

═══════════════════════════
SOURCES:
{context}
═══════════════════════════

QUESTION: {question}

Answer (with citations):`
);

// ── LLM ─────────────────────────────────────────────────────────────────────

function makeLLM(streaming: boolean): ChatOpenAI {
  return new ChatOpenAI({
    modelName: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    temperature: 0.05, // near-deterministic for factual accuracy
    maxTokens: 1000,
    streaming,
    openAIApiKey: process.env.OPENAI_API_KEY!,
    timeout: 8500, // leave 1.5 s buffer before Vercel's 10 s hard cut-off
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Rewrite the user query for better embedding recall.
 * Falls back to the original query on any error (never block the request).
 */
async function rewriteQuery(query: string): Promise<string> {
  try {
    const chain = RunnableSequence.from([
      REWRITE_PROMPT,
      makeLLM(false),
      new StringOutputParser(),
    ]);
    const rewritten = await chain.invoke({ question: query });
    return rewritten.trim() || query;
  } catch {
    return query;
  }
}

/** Build the context block injected into the RAG prompt */
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

/**
 * Phase 1 — retrieve: rewrite query, embed, hybrid-search Supabase.
 * Returns sources + confidence, or a fallback message if retrieval fails.
 */
export async function buildRAGContext(request: AskRequest): Promise<RAGContext> {
  const embeddings = getEmbeddings();

  // Rewrite + embed in parallel (original + rewritten → average embedding)
  const rewrittenQuery = await rewriteQuery(request.query);
  const [origVec, rewrittenVec] = await Promise.all([
    embeddings.embedQuery(request.query),
    embeddings.embedQuery(rewrittenQuery),
  ]);
  const avgVec = origVec.map((v, i) => (v + rewrittenVec[i]) / 2);

  const sources = await hybridSearch({
    query: rewrittenQuery,
    queryEmbedding: avgVec,
    sourceTypes: request.source_types,
    language: request.language ?? 'en',
    topK: Math.min(request.top_k ?? 5, 8), // cap at 8 for prompt budget
  });

  if (sources.length === 0) {
    return { sources: [], confidence: 0, fallbackMessage: NO_SOURCES_RESPONSE };
  }

  const gate = checkSources(sources);
  if (!gate.passed) {
    return {
      sources,
      confidence: gate.confidence,
      fallbackMessage: LOW_CONFIDENCE_RESPONSE,
    };
  }

  return { sources, confidence: gate.confidence };
}

/**
 * Phase 2 — generate: stream the LLM answer given pre-retrieved sources.
 * Yields string chunks compatible with the SSE encoder in the API route.
 */
export async function* streamAnswer(
  question: string,
  sources: SearchResult[]
): AsyncGenerator<string> {
  const context = formatContext(sources);
  const llm = makeLLM(true);

  const chain = RunnableSequence.from([
    RAG_PROMPT,
    llm,
    new StringOutputParser(),
  ]);

  const stream = await chain.stream({ context, question });
  for await (const chunk of stream) {
    yield chunk;
  }
}
