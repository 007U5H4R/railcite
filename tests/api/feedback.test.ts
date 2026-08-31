import { vi } from 'vitest';
vi.mock('@/lib/auth', () => ({ getUserFromRequest: vi.fn(async () => ({ id: 'u1' })) }));
vi.mock('@/lib/supabase-user', () => ({ bearerToken: vi.fn(() => 'tok'), userClient: vi.fn() }));

import { POST } from '@/app/api/feedback/route';
import { getUserFromRequest } from '@/lib/auth';
import { bearerToken, userClient } from '@/lib/supabase-user';

// Fluent supabase-js stand-in: insert() resolves to `result` when awaited.
function mockDb(result: { data: unknown; error: unknown }) {
  const chain: any = {};
  chain.insert = vi.fn(() => Promise.resolve(result));
  const from = vi.fn(() => chain);
  vi.mocked(userClient).mockReturnValue({ from } as any);
  return chain;
}

const authed = (extra: HeadersInit = {}) => ({ authorization: 'Bearer tok', ...extra });
const post = (body: unknown, headers: HeadersInit = authed()) => new Request('http://x/api/feedback',
  { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.mocked(getUserFromRequest).mockReset().mockResolvedValue({ id: 'u1' } as any);
  vi.mocked(bearerToken).mockReset().mockReturnValue('tok');
  vi.mocked(userClient).mockReset();
});

it('401 when unauthenticated', async () => {
  vi.mocked(bearerToken).mockReturnValue(null);
  expect((await POST(post({ message: 'nice tool' }, {}))).status).toBe(401);
});

it('400 on empty message', async () => {
  mockDb({ data: null, error: null });
  expect((await POST(post({ message: '   ' }))).status).toBe(400);
});

it('400 on unknown field', async () => {
  mockDb({ data: null, error: null });
  expect((await POST(post({ message: 'ok', rating: 5 }))).status).toBe(400);
});

it('201 and inserts the caller uid + trimmed message', async () => {
  const chain = mockDb({ data: null, error: null });
  const res = await POST(post({ message: '  great, more Hindi please  ' }));
  expect(res.status).toBe(201);
  expect(chain.insert).toHaveBeenCalledWith({ user_id: 'u1', message: 'great, more Hindi please' });
});

it('500 when the insert errors', async () => {
  mockDb({ data: null, error: { message: 'boom' } });
  expect((await POST(post({ message: 'ok' }))).status).toBe(500);
});
