import type { SearchResult } from './types';

// ── Constants ──────────────────────────────────────────────────────────────

// Keywords that indicate the model might be issuing a religious ruling
const FATWA_PATTERNS = [
  /\bit is (permissible|forbidden|haram|halal|obligatory|prohibited|makruh|mustahab)\b/i,
  /\byou (must|should|are required to|are forbidden from)\b/i,
  /\bislamic (law|ruling|jurisprudence) (says|states|requires|permits|forbids)\b/i,
  /\baccording to (fiqh|sharia|islamic law)\b/i,
  /\bfatwa\b/i,
  /\bshariah? ruling\b/i,
];

const MIN_SOURCES = 1;
const MIN_SIMILARITY = 0.1; // Jina embeddings score lower than OpenAI — calibrated for jina-embeddings-v3

// ── Types ──────────────────────────────────────────────────────────────────

export interface GuardrailResult {
  passed: boolean;
  reason?: 'insufficient_sources' | 'low_confidence' | 'ok';
  confidence: number;
  disclaimer?: string;
}

// ── Functions ──────────────────────────────────────────────────────────────

/** Gate 1: are there enough high-quality sources? */
export function checkSources(sources: SearchResult[]): GuardrailResult {
  if (sources.length < MIN_SOURCES) {
    return { passed: false, reason: 'insufficient_sources', confidence: 0 };
  }

  const avgSim = sources.reduce((s, r) => s + r.similarity, 0) / sources.length;
  const topSim = sources[0]?.similarity ?? 0;

  // At least one source must be strongly relevant
  if (topSim < MIN_SIMILARITY) {
    return { passed: false, reason: 'low_confidence', confidence: avgSim };
  }

  return { passed: true, reason: 'ok', confidence: avgSim };
}

/** Gate 2: does the generated text contain fatwa-style rulings? */
export function detectFatwas(response: string): boolean {
  return FATWA_PATTERNS.some((re) => re.test(response));
}

/**
 * Gate 3: compute how well the response is grounded in the retrieved sources.
 * Returns a 0–1 score (1 = fully grounded).
 */
export function groundingScore(response: string, sources: SearchResult[]): number {
  const sourceText = sources.map((s) => s.content.toLowerCase()).join(' ');
  // Extract meaningful words (>4 chars) from the response
  const words = response
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 4);

  if (words.length === 0) return 0;

  const groundedCount = words.filter((w) => sourceText.includes(w)).length;
  return Math.min(groundedCount / words.length, 1);
}

/** Combine confidence from retrieval similarity + grounding score */
export function computeConfidence(
  retrievalConfidence: number,
  groundingRatio: number
): number {
  // 60% retrieval quality, 40% answer grounding
  return Math.round((retrievalConfidence * 0.6 + groundingRatio * 0.4) * 100) / 100;
}

// ── Canned responses ───────────────────────────────────────────────────────

export const SCHOLAR_REFERRAL =
  'This topic involves religious rulings or personal guidance. Please consult a qualified Islamic scholar (alim) for a formal fatwa.';

export const NO_SOURCES_RESPONSE =
  'No relevant verses, hadiths, or tafsir were found for your question. ' +
  'Please try rephrasing, or this may require consultation with a qualified scholar.';

export const LOW_CONFIDENCE_RESPONSE =
  'The available sources are not sufficiently specific to your question. ' +
  'I cannot provide an accurate answer without risking error. ' +
  'Please consult a qualified Islamic scholar for guidance on this topic.';
