import { Embeddings } from '@langchain/core/embeddings';

const JINA_URL = 'https://api.jina.ai/v1/embeddings';

/**
 * Jina AI embeddings — 1M free tokens/month, no daily cap.
 * Model: jina-embeddings-v3, 1024 dims, symmetric (no task types).
 * Symmetric embedding ensures query and passage vectors live in the
 * same geometric space, giving accurate cosine similarity scores.
 */
class JinaEmbeddings extends Embeddings {
  private apiKey: string;

  constructor(apiKey: string) {
    super({});
    this.apiKey = apiKey;
  }

  async embedQuery(text: string): Promise<number[]> {
    const results = await this.callJina([text]);
    return results[0];
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return this.callJina(texts);
  }

  private async callJina(texts: string[], attempt = 1): Promise<number[][]> {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 25_000);
    const res = await fetch(JINA_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'jina-embeddings-v3',
        input: texts,
      }),
      signal: abort.signal,
    }).finally(() => clearTimeout(timer));

    const data = await res.json() as {
      data?: Array<{ embedding: number[] }>;
      error?: string;
      detail?: string;
    };

    if (!res.ok) {
      const msg = data.error ?? data.detail ?? `HTTP ${res.status}`;
      if (res.status === 429 && attempt < 4) {
        const wait = attempt * 10_000;
        await new Promise((r) => setTimeout(r, wait));
        return this.callJina(texts, attempt + 1);
      }
      throw new Error(`Jina embed error: ${msg}`);
    }

    return (data.data ?? []).map((d) => d.embedding);
  }
}

let _instance: JinaEmbeddings | null = null;

export function getEmbeddings(): JinaEmbeddings {
  if (!_instance) {
    _instance = new JinaEmbeddings(process.env.JINA_API_KEY!);
  }
  return _instance;
}
