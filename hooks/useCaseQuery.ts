'use client';
import { useCallback, useRef, useState } from 'react';
import type { QueryRequest, QueryResponse } from '@/lib/types';
import { getAccessToken } from '@/lib/supabase-browser';

export type CaseQueryState =
  | { state: 'idle' } | { state: 'loading'; searched: number | null }
  | { state: 'done'; data: QueryResponse } | { state: 'auth_required' }
  | { state: 'error'; message: string };

export function useCaseQuery() {
  const [s, setS] = useState<CaseQueryState>({ state: 'idle' });
  const last = useRef<QueryRequest | null>(null);

  const submit = useCallback(async (req: QueryRequest) => {
    last.current = req;
    setS({ state: 'loading', searched: null });
    try {
      fetch('/api/stats').then(r => r.json())
        .then(st => setS(cur => cur.state === 'loading' ? { state: 'loading', searched: st.chunks } : cur))
        .catch(() => {});
      const token = await getAccessToken();
      if (!token) { setS({ state: 'auth_required' }); return; }
      const res = await fetch('/api/query', { method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(req) });
      if (res.status === 401) { setS({ state: 'auth_required' }); return; }
      if (!res.ok) { setS({ state: 'error', message: `Request failed (${res.status})` }); return; }
      const data: QueryResponse = await res.json();
      if (data.status === 'answered') {
        try { localStorage.setItem('railcite:last', JSON.stringify({ req, data, at: Date.now() })); } catch {}
      }
      setS({ state: 'done', data });
    } catch { setS({ state: 'error', message: 'Network error — check your connection.' }); }
  }, []);

  const retry = useCallback(() => { if (last.current) void submit(last.current); }, [submit]);
  const reset = useCallback(() => setS({ state: 'idle' }), []);
  return { s, submit, retry, reset };
}
