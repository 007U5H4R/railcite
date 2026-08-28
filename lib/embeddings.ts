import { requireEnv } from './env';

const URL_ = 'https://api.voyageai.com/v1/embeddings';
const BATCH = 96;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function embedBatch(input: string[], input_type: 'document' | 'query'): Promise<number[][]> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(URL_, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${requireEnv('VOYAGE_API_KEY')}` },
      body: JSON.stringify({ model: 'voyage-3', input, input_type }),
    });
    if (res.ok) {
      const json = await res.json() as { data: { index: number; embedding: number[] }[] };
      return json.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
    }
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= 3) throw new Error(`voyage ${res.status}: ${await res.text()}`);
    await sleep(500 * 2 ** attempt);
  }
}

export async function embedTexts(texts: string[], inputType: 'document' | 'query'): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH)
    out.push(...await embedBatch(texts.slice(i, i + BATCH), inputType));
  return out;
}
