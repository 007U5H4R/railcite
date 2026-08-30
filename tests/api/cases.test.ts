import { vi } from 'vitest';
vi.mock('@/lib/auth', () => ({ getUserFromRequest: vi.fn(async () => ({ id: 'u1' })) }));
vi.mock('@/lib/supabase-user', () => ({ bearerToken: vi.fn(() => 'tok'), userClient: vi.fn() }));

import { POST, GET, PATCH } from '@/app/api/cases/route';
import { getUserFromRequest } from '@/lib/auth';
import { bearerToken, userClient } from '@/lib/supabase-user';

// A minimal fluent stand-in for the supabase-js query builder: every chain method returns
// itself, and it resolves to `result` whether the route ends the chain with .single(),
// .maybeSingle(), or awaits the builder directly (list queries).
function chainOf(result: { data: unknown; error: unknown }) {
  const chain: any = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.insert = vi.fn(self);
  chain.update = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.order = vi.fn(self);
  chain.limit = vi.fn(self);
  chain.single = vi.fn(async () => result);
  chain.maybeSingle = vi.fn(async () => result);
  chain.then = (onFulfilled: (v: typeof result) => unknown) => Promise.resolve(result).then(onFulfilled);
  return chain;
}
function mockDb(result: { data: unknown; error: unknown }) {
  const chain = chainOf(result);
  const from = vi.fn(() => chain);
  vi.mocked(userClient).mockReturnValue({ from } as any);
  return chain;
}

const authed = (extra: HeadersInit = {}) => ({ authorization: 'Bearer tok', ...extra });
const post = (body: unknown, headers: HeadersInit = authed()) => new Request('http://x/api/cases',
  { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const get = (qs = '', headers: HeadersInit = authed()) => new Request(`http://x/api/cases${qs}`, { headers });
const patch = (body: unknown, headers: HeadersInit = authed()) => new Request('http://x/api/cases',
  { method: 'PATCH', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.mocked(getUserFromRequest).mockReset().mockResolvedValue({ id: 'u1' });
  vi.mocked(bearerToken).mockReset().mockReturnValue('tok');
  vi.mocked(userClient).mockReset();
});

it('POST 401 when unauthenticated', async () => {
  vi.mocked(bearerToken).mockReturnValue(null);
  const res = await POST(post({ question: 'q', status: 'answered' }, {}));
  expect(res.status).toBe(401);
});
it('GET 401 when unauthenticated', async () => {
  vi.mocked(bearerToken).mockReturnValue(null);
  expect((await GET(get('', {}))).status).toBe(401);
});
it('PATCH 401 when unauthenticated', async () => {
  vi.mocked(bearerToken).mockReturnValue(null);
  expect((await PATCH(patch({ id: '00000000-0000-0000-0000-000000000000', is_saved: true }, {}))).status).toBe(401);
});

it('POST 400 on invalid body (unknown field rejected)', async () => {
  const res = await POST(post({ question: 'q', status: 'answered', evil: 1 }));
  expect(res.status).toBe(400);
});
it('POST 400 on bad status enum', async () => {
  const res = await POST(post({ question: 'q', status: 'bogus' }));
  expect(res.status).toBe(400);
});

it('POST 400s if the body tries to smuggle a user_id (strict schema rejects it outright)', async () => {
  const res = await POST(post({ question: 'demurrage question text', status: 'answered',
    result: { status: 'answered' }, user_id: 'someone-else' }));
  expect(res.status).toBe(400);
});
it('POST sets user_id on the insert from the verified token (u1), regardless of caller identity claims', async () => {
  const chain = mockDb({ data: { id: 'case1', created_at: '2026-01-01T00:00:00Z' }, error: null });
  const res = await POST(post({ question: 'demurrage question text', status: 'answered',
    result: { status: 'answered' } }));
  expect(res.status).toBe(201);
  expect((await res.json()).id).toBe('case1');
  const inserted = chain.insert.mock.calls[0][0];
  expect(inserted.user_id).toBe('u1');
});

it('GET lists the caller\'s cases newest first', async () => {
  const chain = mockDb({ data: [{ id: 'c1' }, { id: 'c2' }], error: null });
  const j = await (await GET(get())).json();
  expect(j.cases).toHaveLength(2);
  expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
});
it('GET ?saved=1 filters on is_saved', async () => {
  const chain = mockDb({ data: [], error: null });
  await GET(get('?saved=1'));
  expect(chain.eq).toHaveBeenCalledWith('is_saved', true);
});
it('GET ?id= 400 on a non-uuid id', async () => {
  expect((await GET(get('?id=not-a-uuid'))).status).toBe(400);
});
it('GET ?id= 404 when RLS finds no owned row', async () => {
  mockDb({ data: null, error: null });
  expect((await GET(get('?id=00000000-0000-0000-0000-000000000000'))).status).toBe(404);
});
it('GET ?id= returns the case with its result when owned', async () => {
  mockDb({ data: { id: 'c1', result: { status: 'refused', meta: {} } }, error: null });
  const j = await (await GET(get('?id=00000000-0000-0000-0000-000000000000'))).json();
  expect(j.case.id).toBe('c1');
  expect(j.case.result.status).toBe('refused');
});

it('PATCH 404s when the row isn\'t (visibly) the caller\'s — RLS blocked the update', async () => {
  mockDb({ data: null, error: null });
  const res = await PATCH(patch({ id: '00000000-0000-0000-0000-000000000000', is_saved: true }));
  expect(res.status).toBe(404);
});
it('PATCH toggles is_saved on success', async () => {
  const chain = mockDb({ data: { id: 'c1', is_saved: true }, error: null });
  const j = await (await PATCH(patch({ id: '00000000-0000-0000-0000-000000000000', is_saved: true }))).json();
  expect(j).toEqual({ id: 'c1', is_saved: true });
  expect(chain.update).toHaveBeenCalledWith({ is_saved: true });
});
it('PATCH persists a result merge (Hindi translation folded into the saved answer)', async () => {
  const chain = mockDb({ data: { id: 'c1', is_saved: false }, error: null });
  const result = { status: 'answered', blocks: [], note: [], sources: [], lineage: null, meta: {},
    translations: { hi: { blocks: ['हिंदी'], noteSub: null, noteContent: [] } } };
  const res = await PATCH(patch({ id: '00000000-0000-0000-0000-000000000000', result }));
  expect(res.status).toBe(200);
  expect(chain.update).toHaveBeenCalledWith({ result });
});
it('PATCH 400 when neither is_saved nor result is provided', async () => {
  const res = await PATCH(patch({ id: '00000000-0000-0000-0000-000000000000' }));
  expect(res.status).toBe(400);
});
