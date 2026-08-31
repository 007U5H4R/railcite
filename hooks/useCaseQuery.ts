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
  // The persisted case id for the CURRENT generation. Read AFTER translate's awaits (never
  // captured before them): the id is attached asynchronously by persistCase, so a pre-await
  // snapshot is null exactly when the user toggles Hindi straight after an answer lands.
  const caseIdRef = useRef<{ gen: number; id: string } | null>(null);
  // Language currently being fetched, so a re-render (or the other segment's toggle) can't fire
  // a second concurrent /api/translate — each one is a paid model call.
  const inFlight = useRef<string | null>(null);

  // Clears the transient translation UI. submit/reset must do this too, or a superseded
  // translate's flags (whose `finally` is skipped on a generation change) leak into the next case.
  const clearTranslation = useCallback(() => {
    inFlight.current = null;
    setTranslating(false); setTranslateError(false);
  }, []);

  const submit = useCallback(async (req: QueryRequest) => {
    const myGen = ++gen.current;
    last.current = req;
    caseIdRef.current = null;
    clearTranslation();
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
        caseIdRef.current = { gen: myGen, id };
        // Attach by GENERATION, not by `cur.data === data` identity: a translation that merges
        // first replaces `data`, and an identity check would then silently never attach the id —
        // leaving the answer permanently unsaveable. The gen guard above already proves this is
        // still the same query.
        setS(cur => cur.state === 'done' ? { ...cur, caseId: id } : cur);
      });
    } catch { if (gen.current === myGen) setS({ state: 'error', message: 'Network error — check your connection.' }); }
  }, [clearTranslation]);

  const retry = useCallback(() => { if (last.current) void submit(last.current); }, [submit]);
  const reset = useCallback(() => {
    gen.current++; caseIdRef.current = null; clearTranslation(); setS({ state: 'idle' });
  }, [clearTranslation]);
  // R4: rehydrate a past case (from history/saved) without re-querying — see CaseConsole's
  // `?case=<id>` handling. Bumps the generation so any in-flight submit can't clobber it.
  const reopen = useCallback((caseId: string, data: QueryResponse) => {
    gen.current++;
    last.current = null;
    caseIdRef.current = { gen: gen.current, id: caseId };
    clearTranslation();
    setS({ state: 'done', data, caseId });
  }, [clearTranslation]);

  // Lazily translate the current answered result into `lang` (Hindi for now). Idempotent —
  // a cached translation short-circuits with no network call. The English answer is never
  // re-fetched or re-validated; only its prose is translated (see app/api/translate). On
  // success the translation is merged into `data` (so the toggle is instant thereafter) and,
  // when the case is persisted, folded back into the saved row via PATCH /api/cases.
  const translate = useCallback(async (lang: Exclude<Language, 'en'>) => {
    const cur = s;
    if (cur.state !== 'done' || cur.data.status !== 'answered') return;
    if (cur.data.translations?.[lang]) return;   // already cached — instant, no cost
    if (inFlight.current === lang) return;       // already fetching it — never pay twice
    const myGen = gen.current;
    const source = cur.data;                     // the exact answer these strings belong to
    inFlight.current = lang;
    setTranslateError(false); setTranslating(true);
    try {
      const token = await getAccessToken();
      if (gen.current !== myGen) return;
      if (!token) { setTranslateError(true); return; }
      const res = await fetch('/api/translate', { method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ blocks: source.blocks, note: source.note, target: lang }) });
      if (gen.current !== myGen) return;                       // answer was replaced mid-translate
      if (!res.ok) { setTranslateError(true); return; }
      const payload: Translation = await res.json();
      // Re-check AFTER the body resolves — reading the body is itself an await, and skipping this
      // check let a translation fetched for one case land on whatever case is displayed now (and
      // then be PATCHed onto the *old* case's row, overwriting its saved answer).
      if (gen.current !== myGen) return;

      const merged: QueryResponse = { ...source, translations: { ...source.translations, [lang]: payload } };
      // Pure updater — merge only if the displayed answer is still the one we translated.
      setS(prev => (prev.state === 'done' && prev.data === source) ? { ...prev, data: merged } : prev);
      // Only the LIVE last answer belongs in the offline cache; a reopened historical case
      // (last.current === null) must not hijack it.
      if (last.current) {
        try { localStorage.setItem('railcite:last', JSON.stringify({ req: last.current, data: merged, at: Date.now() })); } catch {}
      }
      // Non-blocking: fold the translation into the saved case so reopening is instant/offline.
      // The id is read HERE (post-await) because persistCase attaches it asynchronously, and we
      // send only the translation — the saved answer itself is immutable server-side.
      const caseId = caseIdRef.current?.gen === myGen ? caseIdRef.current.id : null;
      if (caseId) {
        void fetch('/api/cases', { method: 'PATCH',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({ id: caseId, translations: { [lang]: payload } }) }).catch(() => {});
      }
    } catch {
      if (gen.current === myGen) setTranslateError(true);
    } finally {
      if (inFlight.current === lang) inFlight.current = null;
      if (gen.current === myGen) setTranslating(false);
    }
  }, [s]);

  return { s, submit, retry, reset, reopen, translate, translating, translateError };
}
