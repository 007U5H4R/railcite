import { vi } from 'vitest';
vi.mock('@/lib/db', () => ({ adminClient: vi.fn() }));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeQuestion, findCachedAnswer, storeCachedAnswer, type CacheScope } from '@/lib/answerCache';
import { adminClient } from '@/lib/db';
import type { QueryResponse } from '@/lib/types';

const EMB = [0.1, 0.2];
const answered = (tag: string) => ({ status: 'answered', blocks: [{ text: tag, citations: [1] }],
  note: [], sources: [], lineage: null,
  meta: { searched: 1, matched: 1, above_threshold: 1 } } as unknown as QueryResponse);
const ANSWERED = answered('all-domains');

const ALL: CacheScope = { domain: null, verifiedOnly: false };
const COACHING: CacheScope = { domain: 'coaching', verifiedOnly: false };
const GOODS: CacheScope = { domain: 'goods', verifiedOnly: false };
const ALL_VERIFIED: CacheScope = { domain: null, verifiedOnly: true };

interface Row { id: string; question_norm: string; domain: string | null; verified_only: boolean; result: unknown }

/**
 * Stand-in supabase client backed by an in-memory `answer_cache` that ACTUALLY APPLIES the
 * filters it is given — `.eq` / `.is` for the exact path, the RPC's filter_* args for the
 * semantic one, with the same `is not distinct from` null semantics as migrations/006.
 *
 * A mock that ignored the filters (the previous one did) is precisely why the scope bug shipped
 * green: every one of these tests would have passed against the scope-blind code. The mock has to
 * model the constraint for the test to have any force.
 */
function mockDb(rows: Row[]) {
  const upsert = vi.fn(async () => ({ error: null }));
  const from = vi.fn(() => {
    const preds: Array<(r: Row) => boolean> = [];
    const b = {
      select: () => b,
      eq: (col: keyof Row, v: unknown) => { preds.push(r => r[col] === v); return b; },
      is: (col: keyof Row, v: unknown) => { preds.push(r => r[col] === v); return b; },
      maybeSingle: async () => ({ data: rows.find(r => preds.every(p => p(r))) ?? null, error: null }),
      upsert,
    };
    return b;
  });
  const rpc = vi.fn((fn: string, args: Record<string, unknown>) => {
    if (fn !== 'match_cached_answer') return Promise.resolve({ data: null, error: null });
    // Mirrors the SQL: scope must match (null matches null), then nearest above the floor.
    const data = rows.filter(r => r.domain === args.filter_domain
      && r.verified_only === args.filter_verified_only);
    return Promise.resolve({ data: data.slice(0, 1), error: null });
  });
  vi.mocked(adminClient).mockReturnValue({ from, rpc } as never);
  return { from, rpc, upsert };
}

const row = (over: Partial<Row> = {}): Row => ({ id: 'c1', question_norm: 'vikalp scheme',
  domain: null, verified_only: false, result: ANSWERED, ...over });

beforeEach(() => vi.mocked(adminClient).mockReset());

it('normalizeQuestion: case, whitespace, trailing punctuation', () => {
  expect(normalizeQuestion('  What   is Wharfage?  ')).toBe('what is wharfage');
  expect(normalizeQuestion('Demurrage waiver limits?!')).toBe('demurrage waiver limits');
  expect(normalizeQuestion('same text')).toBe(normalizeQuestion('SAME   TEXT ?'));
});

it('exact normalized match hits without touching the semantic rpc', async () => {
  const { rpc } = mockDb([row()]);
  expect(await findCachedAnswer('Vikalp scheme?', EMB, ALL)).toEqual(ANSWERED);
  expect(rpc).not.toHaveBeenCalledWith('match_cached_answer', expect.anything());
});

it('semantic near-match hits when exact misses', async () => {
  mockDb([row({ question_norm: 'something else entirely' })]);
  expect(await findCachedAnswer('a paraphrased vikalp question', EMB, ALL)).toEqual(ANSWERED);
});

it('miss returns null; a lookup failure also returns null (cache never breaks a query)', async () => {
  mockDb([]);
  expect(await findCachedAnswer('novel question', EMB, ALL)).toBeNull();
  // Failure path: the db client blows up mid-lookup (thrown from a PLAIN function, not a vi.fn —
  // vitest 4 fails tests on errors thrown inside spy implementations even when the code under
  // test catches them). findCachedAnswer must swallow it and return null.
  vi.mocked(adminClient).mockReturnValue({ from: () => { throw new Error('db down'); } } as never);
  expect(await findCachedAnswer('novel question', EMB, ALL)).toBeNull();
});

it('stores answered responses, never refusals', async () => {
  const { upsert } = mockDb([]);
  await storeCachedAnswer('q', EMB, { status: 'refused', meta: { searched: 1, matched: 0, above_threshold: 0 } } as QueryResponse, ALL);
  expect(upsert).not.toHaveBeenCalled();
  await storeCachedAnswer('Some Question?', EMB, ANSWERED, ALL);
  expect(upsert).toHaveBeenCalledWith(
    expect.objectContaining({ question_norm: 'some question', result: ANSWERED }),
    { onConflict: 'question_norm,domain,verified_only' });
});

// ---------------------------------------------------------------------------------------------
// Regression scars for the scope-blind cache (migrations/006_answer_cache_scope.sql).
//
// The domain filter is enforced as a hard SQL filter inside match_chunks, but the route consults
// this cache BEFORE it ever calls match_chunks. With a question-only cache key, any repeat
// question skipped retrieval entirely and replayed whatever scope happened to be asked first.
// Live on 2026-09-03: "Vikalp scheme" cached with no filter (4 goods FM-01 sources among 8) was
// served verbatim to a query narrowed to Coaching, which should have seen zero goods sources.
//
// Serving out-of-domain circulars to a user who explicitly narrowed scope, with no indication,
// is the exact failure cite-or-refuse exists to prevent. These tests fail against any code that
// drops the scope from either lookup path or from the store.
// ---------------------------------------------------------------------------------------------
describe('the answer cache is keyed by retrieval scope, not the question alone', () => {
  it('EXACT: an all-domains answer is NOT served to a coaching-scoped query', async () => {
    mockDb([row({ domain: null })]);
    expect(await findCachedAnswer('Vikalp scheme', EMB, COACHING)).toBeNull();
  });

  it('EXACT: a coaching answer is NOT served to an all-domains query', async () => {
    mockDb([row({ domain: 'coaching' })]);
    expect(await findCachedAnswer('Vikalp scheme', EMB, ALL)).toBeNull();
  });

  it('EXACT: one domain never leaks into another', async () => {
    mockDb([row({ domain: 'goods' })]);
    expect(await findCachedAnswer('Vikalp scheme', EMB, COACHING)).toBeNull();
    expect(await findCachedAnswer('Vikalp scheme', EMB, GOODS)).toEqual(ANSWERED);
  });

  it('EXACT: verified_only is part of the key too — it also changes which chunks are eligible', async () => {
    mockDb([row({ verified_only: false })]);
    expect(await findCachedAnswer('Vikalp scheme', EMB, ALL_VERIFIED)).toBeNull();
    expect(await findCachedAnswer('Vikalp scheme', EMB, ALL)).toEqual(ANSWERED);
  });

  it('EXACT: the right scope still hits — scoping must not just disable the cache', async () => {
    mockDb([row({ id: 'a', domain: null, result: answered('all') }),
            row({ id: 'b', domain: 'coaching', result: answered('coaching') })]);
    expect(await findCachedAnswer('Vikalp scheme', EMB, ALL)).toEqual(answered('all'));
    expect(await findCachedAnswer('Vikalp scheme', EMB, COACHING)).toEqual(answered('coaching'));
  });

  it('SEMANTIC: a nearest-neighbour hit from another scope is the same bug, and must not happen', async () => {
    // Exact misses (different question_norm) so the lookup falls through to the embedding path —
    // the path that served "the Vikalp scheme" (cosine 0.978) the all-domains row in production.
    mockDb([row({ question_norm: 'vikalp scheme', domain: null })]);
    expect(await findCachedAnswer('the Vikalp scheme', EMB, COACHING)).toBeNull();
    expect(await findCachedAnswer('the Vikalp scheme', EMB, GOODS)).toBeNull();
    expect(await findCachedAnswer('the Vikalp scheme', EMB, ALL_VERIFIED)).toBeNull();
    expect(await findCachedAnswer('the Vikalp scheme', EMB, ALL)).toEqual(ANSWERED);
  });

  it('SEMANTIC: the scope is actually passed to the rpc, with null preserved as null', async () => {
    // `.eq('domain', null)` renders as `domain=eq.null` in PostgREST and matches nothing, so the
    // all-domains row must be looked up with IS NULL — and the rpc must receive null, not '' or
    // undefined, or the SQL's `is not distinct from` matches the wrong rows.
    const { rpc } = mockDb([]);
    await findCachedAnswer('some novel question', EMB, ALL);
    expect(rpc).toHaveBeenCalledWith('match_cached_answer',
      expect.objectContaining({ filter_domain: null, filter_verified_only: false }));
    await findCachedAnswer('some novel question', EMB, COACHING);
    expect(rpc).toHaveBeenCalledWith('match_cached_answer',
      expect.objectContaining({ filter_domain: 'coaching', filter_verified_only: false }));
  });

  it('STORE: the scope is written with the row, or nothing above can distinguish it', async () => {
    const { upsert } = mockDb([]);
    await storeCachedAnswer('Vikalp scheme', EMB, ANSWERED, COACHING);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ domain: 'coaching', verified_only: false }),
      { onConflict: 'question_norm,domain,verified_only' });
    await storeCachedAnswer('Vikalp scheme', EMB, ANSWERED, ALL_VERIFIED);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ domain: null, verified_only: true }), expect.anything());
  });
});

// The scope lives in three places that must stay in lockstep: the TS CacheScope, the unique
// constraint, and the semantic RPC's filter. The bug was these drifting apart — match_chunks
// grew a filter the cache never learned about. Read the SQL so a migration that adds a column to
// one and not the other cannot pass.
describe('migration 006 keys and filters on the same scope the code sends', () => {
  const sql = readFileSync(join(__dirname, '..', '..', 'migrations', '006_answer_cache_scope.sql'), 'utf8');

  it('the unique key covers question_norm AND both scope fields', () => {
    expect(sql).toMatch(/unique nulls not distinct \(question_norm, domain, verified_only\)/);
  });

  it('uses NULLS NOT DISTINCT so the all-domains row has ONE key, not one per insert', () => {
    // Default null semantics would let two domain-is-null rows for the same question coexist and
    // defeat the upsert — the same silent-wrong-answer bug in a new shape.
    expect(sql).toContain('nulls not distinct');
  });

  it('the semantic rpc filters on both scope fields', () => {
    expect(sql).toMatch(/ac\.domain is not distinct from filter_domain/);
    expect(sql).toMatch(/ac\.verified_only = filter_verified_only/);
  });

  it('the rpc scope args are REQUIRED, so no caller can silently fall back to scope-blind', () => {
    const fn = sql.slice(sql.indexOf('create or replace function match_cached_answer'));
    expect(fn.slice(0, fn.indexOf(')'))).not.toMatch(/default/i);
  });

  it('pre-scope rows are purged, never back-filled with a guessed scope', () => {
    expect(sql).toMatch(/delete from answer_cache;/);
  });
});
