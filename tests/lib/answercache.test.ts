import { vi } from 'vitest';
vi.mock('@/lib/db', () => ({ adminClient: vi.fn() }));

import { normalizeQuestion, findCachedAnswer, storeCachedAnswer } from '@/lib/answerCache';
import { adminClient } from '@/lib/db';
import type { QueryResponse } from '@/lib/types';

const EMB = [0.1, 0.2];
const ANSWERED = { status: 'answered', blocks: [], note: [], sources: [], lineage: null,
  meta: { searched: 1, matched: 1, above_threshold: 1 } } as unknown as QueryResponse;

/** Stand-in supabase client: `exact` answers the question_norm lookup, `semantic` the rpc. */
function mockDb(exact: unknown, semantic: unknown[] = []) {
  const maybeSingle = vi.fn(async () => ({ data: exact, error: null }));
  const upsert = vi.fn(async () => ({ error: null }));
  const from = vi.fn(() => ({
    select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })),
    upsert,
  }));
  const rpc = vi.fn((fn: string) => fn === 'match_cached_answer'
    ? Promise.resolve({ data: semantic, error: null })
    : Promise.resolve({ data: null, error: null }));
  vi.mocked(adminClient).mockReturnValue({ from, rpc } as never);
  return { from, rpc, upsert };
}

beforeEach(() => vi.mocked(adminClient).mockReset());

it('normalizeQuestion: case, whitespace, trailing punctuation', () => {
  expect(normalizeQuestion('  What   is Wharfage?  ')).toBe('what is wharfage');
  expect(normalizeQuestion('Demurrage waiver limits?!')).toBe('demurrage waiver limits');
  expect(normalizeQuestion('same text')).toBe(normalizeQuestion('SAME   TEXT ?'));
});

it('exact normalized match hits without touching the semantic rpc', async () => {
  const { rpc } = mockDb({ id: 'c1', result: ANSWERED });
  expect(await findCachedAnswer('What is wharfage?', EMB)).toEqual(ANSWERED);
  expect(rpc).not.toHaveBeenCalledWith('match_cached_answer', expect.anything());
});

it('semantic near-match hits when exact misses', async () => {
  mockDb(null, [{ id: 'c2', result: ANSWERED, similarity: 0.97 }]);
  expect(await findCachedAnswer('a paraphrased wharfage question', EMB)).toEqual(ANSWERED);
});

it('miss returns null; a lookup failure also returns null (cache never breaks a query)', async () => {
  mockDb(null, []);
  expect(await findCachedAnswer('novel question', EMB)).toBeNull();
  // Failure path: the db client blows up mid-lookup (thrown from a PLAIN function, not a vi.fn —
  // vitest 4 fails tests on errors thrown inside spy implementations even when the code under
  // test catches them). findCachedAnswer must swallow it and return null.
  vi.mocked(adminClient).mockReturnValue({ from: () => { throw new Error('db down'); } } as never);
  expect(await findCachedAnswer('novel question', EMB)).toBeNull();
});

it('stores answered responses, never refusals', async () => {
  const { upsert } = mockDb(null);
  await storeCachedAnswer('q', EMB, { status: 'refused', meta: { searched: 1, matched: 0, above_threshold: 0 } } as QueryResponse);
  expect(upsert).not.toHaveBeenCalled();
  await storeCachedAnswer('Some Question?', EMB, ANSWERED);
  expect(upsert).toHaveBeenCalledWith(
    expect.objectContaining({ question_norm: 'some question', result: ANSWERED }),
    { onConflict: 'question_norm' });
});
