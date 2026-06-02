import { OpenAIEmbeddings } from '@langchain/openai';

// Module-level singleton — reused across warm Vercel invocations.
let _instance: OpenAIEmbeddings | null = null;

export function getEmbeddings(): OpenAIEmbeddings {
  if (!_instance) {
    _instance = new OpenAIEmbeddings({
      modelName: 'text-embedding-3-small',
      dimensions: 1536,
      openAIApiKey: process.env.OPENAI_API_KEY!,
      batchSize: 512,
      stripNewLines: true,
    });
  }
  return _instance;
}
