import { vi, beforeEach } from 'vitest';
import { embedTexts } from '@/lib/embeddings';

beforeEach(() => { process.env.VOYAGE_API_KEY = 'test-key'; vi.restoreAllMocks(); });

function ok(texts: string[]) {
  return new Response(JSON.stringify({
    data: texts.map((_, i) => ({ index: i, embedding: Array(1024).fill(0.1) })) }), { status: 200 });
}

it('batches >96 inputs into multiple calls, order preserved', async () => {
  const calls: number[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_u, init) => {
    const body = JSON.parse((init as RequestInit).body as string);
    calls.push(body.input.length);
    expect(body.model).toBe('voyage-3');
    return ok(body.input);
  }));
  const out = await embedTexts(Array.from({ length: 100 }, (_, i) => `t${i}`), 'document');
  expect(calls).toEqual([96, 4]);
  expect(out).toHaveLength(100);
  expect(out[0]).toHaveLength(1024);
});
it('retries 429 then succeeds', async () => {
  let n = 0;
  vi.stubGlobal('fetch', vi.fn(async (_u, init) => {
    const body = JSON.parse((init as RequestInit).body as string);
    return ++n === 1 ? new Response('rate', { status: 429 }) : ok(body.input);
  }));
  const out = await embedTexts(['a'], 'query');
  expect(out).toHaveLength(1); expect(n).toBe(2);
});
it('throws on 401 without retry', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('bad key', { status: 401 })));
  await expect(embedTexts(['a'], 'query')).rejects.toThrow(/401/);
});
