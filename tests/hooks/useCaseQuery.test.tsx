// @vitest-environment jsdom
import { renderHook, act, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
vi.mock('@/lib/supabase-browser', () => ({ getAccessToken: vi.fn(async () => 'tok') }));
import { useCaseQuery } from '@/hooks/useCaseQuery';
import { getAccessToken } from '@/lib/supabase-browser';

const ANSWER = { status: 'answered', blocks: [{ text: 'x', citations: [1] }], note: [],
  sources: [], lineage: null, meta: { searched: 10, matched: 1, above_threshold: 1 } };

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

it('idle → loading → done, and persists last answer', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) =>
    url.includes('/api/stats') ? Response.json({ documents: 2, chunks: 10 })
      : Response.json(ANSWER)));
  const { result } = renderHook(() => useCaseQuery());
  expect(result.current.s.state).toBe('idle');
  await act(() => result.current.submit({ case_text: 'a real case text here' }));
  await waitFor(() => expect(result.current.s.state).toBe('done'));
  expect(JSON.parse(localStorage.getItem('railcite:last')!).data.status).toBe('answered');
});
it('401 → auth_required', async () => {
  vi.mocked(getAccessToken).mockResolvedValueOnce(null);
  vi.stubGlobal('fetch', vi.fn(async (url: string) =>
    url.includes('/api/stats') ? Response.json({ documents: 2, chunks: 10 })
      : new Response(JSON.stringify({ error: 'auth_required' }), { status: 401 })));
  const { result } = renderHook(() => useCaseQuery());
  await act(() => result.current.submit({ case_text: 'a real case text here' }));
  await waitFor(() => expect(result.current.s.state).toBe('auth_required'));
});
const HI = { blocks: ['हिंदी'], noteSub: null, noteContent: [] };

it('translate("hi") fetches /api/translate, merges the payload into data, and toggles translating', async () => {
  const f = vi.fn(async (url: string) =>
    url.includes('/api/stats') ? Response.json({ documents: 2, chunks: 10 })
      : url.includes('/api/translate') ? Response.json(HI)
      : Response.json(ANSWER));
  vi.stubGlobal('fetch', f);
  const { result } = renderHook(() => useCaseQuery());
  await act(() => result.current.submit({ case_text: 'a real case text here' }));
  await waitFor(() => expect(result.current.s.state).toBe('done'));

  await act(() => result.current.translate('hi'));
  await waitFor(() => expect(result.current.translating).toBe(false));
  expect(f.mock.calls.some(c => String(c[0]).includes('/api/translate'))).toBe(true);
  expect((result.current.s as any).data.translations.hi).toEqual(HI);
});

it('translate("hi") is a no-op when that translation is already cached (no second call)', async () => {
  const f = vi.fn(async (url: string) =>
    url.includes('/api/stats') ? Response.json({ documents: 2, chunks: 10 })
      : url.includes('/api/translate') ? Response.json(HI)
      : Response.json(ANSWER));
  vi.stubGlobal('fetch', f);
  const { result } = renderHook(() => useCaseQuery());
  await act(() => result.current.submit({ case_text: 'a real case text here' }));
  await waitFor(() => expect(result.current.s.state).toBe('done'));
  await act(() => result.current.translate('hi'));
  await waitFor(() => expect((result.current.s as any).data.translations.hi).toEqual(HI));
  const before = f.mock.calls.filter(c => String(c[0]).includes('/api/translate')).length;
  await act(() => result.current.translate('hi'));
  const after = f.mock.calls.filter(c => String(c[0]).includes('/api/translate')).length;
  expect(after).toBe(before);
});

it('network failure → error; retry resubmits same request', async () => {
  const f = vi.fn()
    .mockResolvedValueOnce(Response.json({ documents: 2, chunks: 10 }))
    .mockRejectedValueOnce(new Error('net'))
    .mockResolvedValueOnce(Response.json({ documents: 2, chunks: 10 }))
    .mockResolvedValueOnce(Response.json(ANSWER));
  vi.stubGlobal('fetch', f);
  const { result } = renderHook(() => useCaseQuery());
  await act(() => result.current.submit({ case_text: 'a real case text here' }));
  await waitFor(() => expect(result.current.s.state).toBe('error'));
  await act(() => { result.current.retry(); });
  await waitFor(() => expect(result.current.s.state).toBe('done'));
});

it('a translation that resolves after the case was replaced is DROPPED (never merged or PATCHed)', async () => {
  // Regression (P0 data corruption): translate() re-checks the generation after `await res.json()`.
  // Without it, a translation fetched for case A merged into whichever case is displayed now AND
  // was PATCHed onto A's saved row — permanently overwriting A's stored answer with B's.
  let releaseTranslate: (v: unknown) => void = () => {};
  const patches: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/api/stats')) return Response.json({ documents: 2, chunks: 10 });
    if (url.includes('/api/cases') && init?.method === 'PATCH') { patches.push(init.body); return Response.json({ id: 'c1' }); }
    if (url.includes('/api/cases')) return Response.json({ id: 'c1' }, { status: 201 });
    if (url.includes('/api/translate')) {
      return new Promise(res => { releaseTranslate = () => res(Response.json({ blocks: ['हिंदी'], noteSub: null, noteContent: [] })); });
    }
    return Response.json(ANSWER);
  }));
  const { result } = renderHook(() => useCaseQuery());
  await act(() => result.current.submit({ case_text: 'a real case text here' }));
  await waitFor(() => expect(result.current.s.state).toBe('done'));

  act(() => { void result.current.translate('hi'); });          // starts, stays pending
  await act(async () => { result.current.reopen('other-case-id', ANSWER as never); });   // bumps generation
  await act(async () => { releaseTranslate(null); await Promise.resolve(); });

  const s = result.current.s as { state: string; data: { translations?: unknown } };
  expect(s.data.translations).toBeUndefined();                   // not merged onto the new case
  expect(patches).toHaveLength(0);                               // and never written to any row
});

it('translate() will not fire a second concurrent call for the same language', async () => {
  // Regression: only a CACHED translation was guarded, so a re-render (or the other segment's
  // toggle) fired duplicate paid model calls.
  let calls = 0;
  let release: (v: unknown) => void = () => {};
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('/api/stats')) return Response.json({ documents: 2, chunks: 10 });
    if (url.includes('/api/cases')) return Response.json({ id: 'c1' }, { status: 201 });
    if (url.includes('/api/translate')) {
      calls++;
      return new Promise(res => { release = () => res(Response.json({ blocks: ['हिं'], noteSub: null, noteContent: [] })); });
    }
    return Response.json(ANSWER);
  }));
  const { result } = renderHook(() => useCaseQuery());
  await act(() => result.current.submit({ case_text: 'a real case text here' }));
  await waitFor(() => expect(result.current.s.state).toBe('done'));
  await act(async () => { void result.current.translate('hi'); void result.current.translate('hi'); });
  expect(calls).toBe(1);   // the second call is refused by the in-flight guard
  await act(async () => { release(null); await Promise.resolve(); });
});
