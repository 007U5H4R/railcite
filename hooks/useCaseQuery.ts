'use client';
import { useCallback, useRef, useState } from 'react';
import type { QueryRequest, QueryResponse } from '@/lib/types';
import { getAccessToken } from '@/lib/supabase-browser';

export type CaseQueryState =
  | { state: 'idle' } | { state: 'loading'; searched: number | null }
  | { state: 'done'; data: QueryResponse; caseId: string | null } | { state: 'auth_required' }
  | { state: 'error'; message: string };

// R4: fire-and-forget save of a resolved (answered OR refused) case to /api/cases.
// Failure-tolerant by design — persistence must never break or block the answer UI, so
// every failure is caught and swallowed (logged only). Resolves the new case id, or null.
async function persistCase(req: QueryRequest, data: QueryResponse, token: string): Promise<string | null> {
  try {
    const res = await fetch('/api/cases', { method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ question: req.case_text, verified_only: req.verified_only ?? false,
        domain: req.domain ?? null, status: data.status, result: data }) });
    if (!res || !res.ok) return null;
    const j = await res.json();
    return typeof j?.id === 'string' ? j.id : null;
  } catch (e) { console.warn('case persist failed (non-blocking):', e); return null; }
}

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
      setS({ state: 'done', data, caseId: null });
      // Non-blocking: the answer is already on screen; attach the case id once (if) it saves.
      void persistCase(req, data, token).then(id => {
        if (!id) return;
        setS(cur => cur.state === 'done' && cur.data === data ? { ...cur, caseId: id } : cur);
      });
    } catch { setS({ state: 'error', message: 'Network error — check your connection.' }); }
  }, []);

  const retry = useCallback(() => { if (last.current) void submit(last.current); }, [submit]);
  const reset = useCallback(() => setS({ state: 'idle' }), []);
  // R4: rehydrate a past case (from history/saved) without re-querying — see CaseConsole's
  // `?case=<id>` handling.
  const reopen = useCallback((caseId: string, data: QueryResponse) => {
    last.current = null;
    setS({ state: 'done', data, caseId });
  }, []);
  return { s, submit, retry, reset, reopen };
}
