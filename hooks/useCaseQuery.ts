'use client';
import { useCallback, useRef, useState } from 'react';
import type { QueryRequest, QueryResponse, Translation } from '@/lib/types';
import type { Language } from '@/lib/i18n';
import { getAccessToken } from '@/lib/supabase-browser';
import { analytics } from '@/lib/analytics';

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
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState(false);
  const last = useRef<QueryRequest | null>(null);
  // Monotonic generation. Each submit captures the current value; reset/reopen/a newer submit
  // bump it, so an in-flight request that finds the generation changed drops its result rather
  // than overwriting fresh state (e.g. the drawer's "New case" clicked mid-load).
  const gen = useRef(0);

  const submit = useCallback(async (req: QueryRequest) => {
    const myGen = ++gen.current;
    last.current = req;
    setS({ state: 'loading', searched: null });
    analytics.caseSubmitted();               // funnel entry — fires on the user's submit, before auth/network
    try {
      fetch('/api/stats').then(r => r.json())
        .then(st => setS(cur => (gen.current === myGen && cur.state === 'loading') ? { state: 'loading', searched: st.chunks } : cur))
        .catch(() => {});
      const token = await getAccessToken();
      if (gen.current !== myGen) return;                                       // superseded while authing
      if (!token) { setS({ state: 'auth_required' }); return; }
      const res = await fetch('/api/query', { method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(req) });
      if (gen.current !== myGen) return;                                       // superseded while querying
      if (res.status === 401) { setS({ state: 'auth_required' }); return; }
      if (!res.ok) { setS({ state: 'error', message: `Request failed (${res.status})` }); return; }
      const data: QueryResponse = await res.json();
      if (gen.current !== myGen) return;                                       // superseded — don't show/count a stale answer
      if (data.status === 'answered') {
        analytics.conclusionGenerated(data.sources.length);   // property is a COUNT, never the citation text
        try { localStorage.setItem('railcite:last', JSON.stringify({ req, data, at: Date.now() })); } catch {}
      } else {
        analytics.noRuleFoundShown();                         // honesty signal — a refuse was shown
      }
      setS({ state: 'done', data, caseId: null });
      // Non-blocking: the answer is already on screen; attach the case id once (if) it saves.
      void persistCase(req, data, token).then(id => {
        if (!id || gen.current !== myGen) return;
        setS(cur => cur.state === 'done' && cur.data === data ? { ...cur, caseId: id } : cur);
      });
    } catch { if (gen.current === myGen) setS({ state: 'error', message: 'Network error — check your connection.' }); }
  }, []);

  const retry = useCallback(() => { if (last.current) void submit(last.current); }, [submit]);
  const reset = useCallback(() => { gen.current++; setS({ state: 'idle' }); }, []);
  // R4: rehydrate a past case (from history/saved) without re-querying — see CaseConsole's
  // `?case=<id>` handling. Bumps the generation so any in-flight submit can't clobber it.
  const reopen = useCallback((caseId: string, data: QueryResponse) => {
    gen.current++;
    last.current = null;
    setTranslating(false); setTranslateError(false);
    setS({ state: 'done', data, caseId });
  }, []);

  // Lazily translate the current answered result into `lang` (Hindi for now). Idempotent —
  // a cached translation short-circuits with no network call. The English answer is never
  // re-fetched or re-validated; only its prose is translated (see app/api/translate). On
  // success the translation is merged into `data` (so the toggle is instant thereafter) and,
  // when the case is persisted, folded back into the saved row via PATCH /api/cases.
  const translate = useCallback(async (lang: Exclude<Language, 'en'>) => {
    const cur = s;
    if (cur.state !== 'done' || cur.data.status !== 'answered') return;
    if (cur.data.translations?.[lang]) return;   // already cached — instant, no cost
    const myGen = gen.current;
    setTranslateError(false); setTranslating(true);
    try {
      const token = await getAccessToken();
      if (!token) { setTranslateError(true); return; }
      const res = await fetch('/api/translate', { method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ blocks: cur.data.blocks, note: cur.data.note, target: lang }) });
      if (gen.current !== myGen) return;                       // answer was replaced mid-translate
      if (!res.ok) { setTranslateError(true); return; }
      const payload: Translation = await res.json();
      let merged: QueryResponse | null = null;
      setS(prev => {
        if (prev.state !== 'done' || prev.data.status !== 'answered') return prev;
        merged = { ...prev.data, translations: { ...prev.data.translations, [lang]: payload } };
        try { localStorage.setItem('railcite:last', JSON.stringify({ req: last.current, data: merged, at: Date.now() })); } catch {}
        return { ...prev, data: merged };
      });
      // Non-blocking: fold the translation into the saved case so reopening is instant/offline.
      if (cur.caseId && merged) {
        void fetch('/api/cases', { method: 'PATCH',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({ id: cur.caseId, result: merged }) }).catch(() => {});
      }
    } catch {
      if (gen.current === myGen) setTranslateError(true);
    } finally {
      if (gen.current === myGen) setTranslating(false);
    }
  }, [s]);

  return { s, submit, retry, reset, reopen, translate, translating, translateError };
}
