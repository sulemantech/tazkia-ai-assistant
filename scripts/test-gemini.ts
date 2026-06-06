import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const apiKey = process.env.GOOGLE_API_KEY!;
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const HEADERS = { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' };

console.log(`API key prefix: ${apiKey?.slice(0, 8)}...\n`);

async function main() {
  // ── Test 1: LLM — exactly as shown in the REST docs ────────
  console.log('── Test 1: gemini-3.5-flash (generateContent) ──');
  const llmRes = await fetch(
    `${BASE}/models/gemini-3.5-flash:generateContent`,
    {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Say "Bismillah" and nothing else.' }] }],
      }),
    }
  );
  const llmData = await llmRes.json() as { candidates?: Array<{ content: { parts: Array<{ text: string }> } }>, error?: { message: string } };
  if (llmData.error) {
    console.log(`✗ LLM failed: ${llmData.error.message}`);
  } else {
    console.log(`✓ LLM response: ${llmData.candidates?.[0]?.content.parts[0]?.text}`);
  }

  // ── Test 2: List models — find embedding-capable ones ──────
  console.log('\n── Test 2: Available models ────────────────────');
  const listRes = await fetch(`${BASE}/models`, { headers: HEADERS });
  const listData = await listRes.json() as { models?: Array<{ name: string; supportedGenerationMethods?: string[] }>, error?: { message: string } };

  if (listData.error) {
    console.log(`✗ List failed: ${listData.error.message}`);
    return;
  }

  const models = listData.models ?? [];
  const embedModels = models.filter(m => m.supportedGenerationMethods?.includes('embedContent'));
  const chatModels  = models.filter(m => m.supportedGenerationMethods?.includes('generateContent'));

  console.log(`Embedding models (${embedModels.length}):`);
  embedModels.forEach(m => console.log(`  ${m.name}`));
  console.log(`\nChat/LLM models (${chatModels.length}):`);
  chatModels.forEach(m => console.log(`  ${m.name}`));

  // ── Test 3: Try first available embedding model ─────────────
  if (embedModels.length > 0) {
    const embedModelName = embedModels[0].name!.replace('models/', '');
    console.log(`\n── Test 3: ${embedModelName} (embedContent) ──`);
    const embedRes = await fetch(
      `${BASE}/models/${embedModelName}:embedContent`,
      {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({
          content: { parts: [{ text: 'What is patience in Islam?' }] },
        }),
      }
    );
    const embedData = await embedRes.json() as { embedding?: { values: number[] }, error?: { message: string } };
    if (embedData.error) {
      console.log(`✗ Embed failed: ${embedData.error.message}`);
    } else {
      const dims = embedData.embedding?.values?.length ?? 0;
      console.log(`✓ Embedding dims: ${dims}`);
    }
  }
}

main().catch(console.error);
