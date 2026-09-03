'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CaseInput } from './CaseInput';
import { EmptyState } from './EmptyState';
import { AuthGate } from './AuthGate';
import { TransparencyLine } from './TransparencyLine';
import { ConclusionCard } from './ConclusionCard';
import { SourcesPanel } from './SourcesPanel';
import { SourceLegend } from './SourceLegend';
import { DraftedNote } from './DraftedNote';
import { LineagePanel } from './LineagePanel';
import { SourceReader } from './SourceReader';
import { LoadingSkeleton } from './LoadingSkeleton';
import { ErrorState } from './ErrorState';
import { RefuseState } from './RefuseState';
import { OfflineBanner, useOnline } from './OfflineBanner';
import { useCaseQuery } from '@/hooks/useCaseQuery';
import { useSignOutReset } from '@/hooks/useSignOutReset';
import { signInWithGoogle, getAccessToken } from '@/lib/supabase-browser';
import { searching, type Language } from '@/lib/i18n';
import { useLanguagePref } from '@/hooks/useLanguagePref';
import type { CaseDetail, QueryResponse, SourceView } from '@/lib/types';
import styles from './console.module.css';

type AnsweredResponse = Extract<QueryResponse, { status: 'answered' }>;

// Scope filter state (verified-only + domain single-select). Was ScopeRail's exported
// type; ScopeRail itself was retired in R3 (superseded by the filter pills rendered
// directly below), so the type now lives here, its sole consumer.
export interface Scope { verifiedOnly: boolean; domain: string | null }

// Domain scope options. `documents.domain` is derived from the Board's own directorate
// folders (see scripts/backfill-domain.ts): Commercial Circulars -> 'coaching', the
// Freight Marketing / Freight Rate / Rates Master family -> 'goods'. Documents we cannot
// place from their path keep domain = null, so they are reachable under Commercial Domain
// but never claimed for either side.
const DOMAINS: { label: string; value: string | null; hint: string }[] = [
  { label: 'Commercial Domain', value: null, hint: 'Search the whole Traffic Commercial corpus — Goods, Coaching and unclassified circulars' },
  { label: 'Goods', value: 'goods', hint: 'Freight only — Freight Marketing, Freight Rate and Rates Master circulars' },
  { label: 'Coaching', value: 'coaching', hint: 'Coaching only — Commercial Circulars (CC series)' },
];

// Scope is a real three-way choice again. It was collapsed to a single inert
// "Commercial Domain" label in R3 because documents.domain was unusable — the bulk crawl
// had written 'goods' onto 5,685 of 5,687 rows, so filtering could not discriminate. With
// domain backfilled from the Board's folder taxonomy, the filter does real work: a
// Coaching query no longer retrieves Freight-Marketing circulars.

// Ask screen recomposed into the mockup's single column: case field, filter pills, then the
// cited conclusion with its sources inline below, then the five states. Query state, the
// /api/query call, and the AuthGate flow are UNCHANGED from the original 3-zone console —
// only layout/composition moved. The Shell (TopBar / bottom nav / drawer) is provided by
// app/layout.tsx, so this component renders just the Ask content.
export function CaseConsole() {
  const [text, setText] = useState('');
  const [scope, setScope] = useState<Scope>({ verifiedOnly: false, domain: null });
  const { s, submit, retry, reset, reopen, translate, translating, translateError } = useCaseQuery();
  // ONE remembered output language for the whole answered view (response, note, refuse card,
  // loading line). Both segment toggles drive it, so flipping either switches everything and the
  // choice survives the next case — a Hindi-reading officer no longer re-flips two controls per
  // case, and the refuse card's Hindi copy is finally reachable.
  const [lang, setLang] = useLanguagePref();
  const router = useRouter();
  const [openSource, setOpenSource] = useState<SourceView | null>(null);      // card click -> reader
  const [activeChunkId, setActiveChunkId] = useState<string | null>(null);    // chip click -> highlight
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());           // case ids toggled saved
  const [savePending, setSavePending] = useState(false);

  useEffect(() => {                       // restore draft after OAuth round-trip
    try { const d = localStorage.getItem('railcite:draft');
      if (d) { setText(d); localStorage.removeItem('railcite:draft'); } } catch {}
  }, []);

  // Sign-out wipes the departing user's case from the screen AND from local storage. RailCite
  // runs on shared office machines — the next person at the desk must not see the previous
  // officer's question, answer, offline copy, or draft. (AnalyticsInit resets the analytics
  // identity on this same transition; this is the UI-side counterpart.)
  useSignOutReset(useCallback(() => {
    setText('');
    reset();
    try { localStorage.removeItem('railcite:last'); localStorage.removeItem('railcite:draft'); } catch {}
  }, [reset]));

  // R4 reopen: /ask?case=<id> (from HistoryDrawer) rehydrates the full cited answer without
  // re-querying. useSearchParams (not a one-shot window.location read) so clicking a
  // *different* history case while already on /ask — the common path, since the drawer is
  // reachable from every route — re-triggers this without a full page reload.
  const params = useSearchParams();
  const reopenId = params.get('case');
  const newSignal = params.get('new');
  useEffect(() => {
    if (!reopenId) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token || cancelled) return;
        const res = await fetch(`/api/cases?id=${encodeURIComponent(reopenId)}`,
          { headers: { authorization: `Bearer ${token}` } });
        if (!res.ok || cancelled) return;
        const { case: c }: { case: CaseDetail } = await res.json();
        if (!c || cancelled) return;
        setText(c.question);
        setScope({ verifiedOnly: c.verified_only, domain: c.domain });
        // Full rehydration when the row carries its result; otherwise the question/scope
        // prefill above is still applied (partial reopen) — there's just no cited answer
        // to show without re-asking, since older/incomplete rows may have no `result`.
        if (c.result) {
          reopen(c.id, c.result);
          if (c.is_saved) setSavedIds(prev => new Set(prev).add(c.id));
        }
      } catch { /* reopen is a convenience, not critical path — fail silently */ }
    })();
    return () => { cancelled = true; };
  }, [reopenId, reopen]);

  // "Ask another" (below an answer) and the drawer's "New case" both reset to a clean slate:
  // idle state, empty field, cursor back in the case field, scrolled to top. Each question is
  // a discrete case (the previous is saved in History), so the next is a full reset — not a
  // conversational continuation.
  const askAnother = useCallback(() => {
    setText('');
    reset();
    requestAnimationFrame(() => {
      document.querySelector('textarea')?.focus();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }, [reset]);

  // Picking a suggested question drops it into the case field AND brings the field into view:
  // the chips sit well below the fold, so without this the user fills the prompt but never sees
  // it. Focus (cursor at the end) so they can immediately edit before submitting; preventScroll
  // avoids a jarring instant jump before the smooth scroll to the top runs.
  const pickExample = useCallback((t: string) => {
    setText(t);
    requestAnimationFrame(() => {
      document.querySelector('textarea')?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }, []);

  // The drawer's "New case" links to /ask?new=1 — a one-shot signal that resets even when
  // already on /ask, where identical-route navigation would otherwise keep this state intact.
  useEffect(() => {
    if (!newSignal) return;
    askAnother();
    router.replace('/ask');   // consume the signal so a refresh doesn't re-fire it
  }, [newSignal, askAnother, router]);

  // Hindi selected on an answered result we haven't translated yet → fetch it once (one call
  // yields both the response and the note). The hook guards cached AND in-flight calls, so this
  // effect can safely re-run as state changes; the status shows at the toggle that triggered it.
  useEffect(() => {
    if (lang === 'hi' && s.state === 'done'
        && s.data.status === 'answered' && !s.data.translations?.hi) {
      void translate('hi');
    }
  }, [lang, s, translate]);

  const doSubmit = () => void submit({ case_text: text, verified_only: scope.verifiedOnly, domain: scope.domain });
  const uiLang: Language = lang;
  const onSignIn = () => { try { localStorage.setItem('railcite:draft', text); } catch {}; void signInWithGoogle(); };

  const caseId = s.state === 'done' ? s.caseId : null;
  const toggleSave = async () => {
    if (!caseId) return;
    const nextSaved = !savedIds.has(caseId);
    setSavePending(true);
    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch('/api/cases', { method: 'PATCH',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: caseId, is_saved: nextSaved }) });
      if (res.ok) setSavedIds(prev => {
        const next = new Set(prev);
        if (nextSaved) next.add(caseId); else next.delete(caseId);
        return next;
      });
    } catch { /* non-blocking: the toggle simply doesn't visually flip */ }
    finally { setSavePending(false); }
  };

  // Offline fallback: when the network drops, surface the last cited answer we persisted
  // (T15 writes `railcite:last` on every answered response). Read-only — no live retrieval.
  const online = useOnline();
  const cachedLast = useMemo<AnsweredResponse | null>(() => {
    if (online) return null;
    try {
      const raw = localStorage.getItem('railcite:last');
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { data?: QueryResponse };
      if (parsed?.data?.status === 'answered') return parsed.data;
    } catch {}
    return null;
  }, [online]);

  return (
    <>
      <OfflineBanner />
      <CaseInput value={text} onChange={setText} onSubmit={doSubmit} disabled={s.state === 'loading'} />

      {/* Domain scope. The selected value is passed to /api/query and applied by
          match_chunks() as a SQL filter on documents.domain BEFORE ranking — so an
          out-of-domain circular never enters the candidate set, rather than being
          discouraged in the prompt. `null` = the whole commercial corpus. */}
      <div className={styles.filters} role="radiogroup" aria-label="Domain scope" data-tour="scope">
        {DOMAINS.map(d => {
          const on = scope.domain === d.value;
          return (
            <button
              key={d.label}
              type="button"
              role="radio"
              aria-checked={on}
              title={d.hint}
              disabled={s.state === 'loading'}
              className={`${styles.pill} ${on ? styles.pillOn : ''}`}
              onClick={() => setScope({ ...scope, domain: d.value })}
            >
              {d.label}
            </button>
          );
        })}
      </div>

      {s.state === 'idle' && !cachedLast && <EmptyState onPick={pickExample} />}
      {s.state === 'loading' && <TransparencyLine text={searching(s.searched, uiLang)} />}
      {s.state === 'auth_required' && <AuthGate onSignIn={onSignIn} />}
      {s.state === 'loading' && <LoadingSkeleton />}
      {s.state === 'error' && <ErrorState message={s.message} detail={s.detail} onRetry={retry} />}
      {s.state === 'done' && s.data.status === 'refused' && (
        <RefuseState meta={s.data.meta} lang={uiLang}
          onBroaden={scope.verifiedOnly ? () => {
            setScope({ ...scope, verifiedOnly: false });
            void submit({ case_text: text, verified_only: false, domain: scope.domain });
          } : null}
          onRephrase={() => document.querySelector('textarea')?.focus()} />)}
      {s.state === 'done' && s.data.status === 'answered' && (
        <div className={styles.answerGrid}>
          <div className={styles.answerMain}>
            <ConclusionCard blocks={s.data.blocks} sources={s.data.sources}
              lang={lang} onLangChange={setLang}
              langBusy={lang === 'hi' && translating}
              onLangRetry={lang === 'hi' && translateError ? () => void translate('hi') : null}
              hindiBlocks={lang === 'hi' ? s.data.translations?.hi?.blocks : undefined}
              onCite={src => setActiveChunkId(src.chunk_id)}
              isSaved={caseId != null && savedIds.has(caseId)}
              saveDisabled={caseId == null || savePending}
              onToggleSave={caseId == null ? null : toggleSave} />
            <div className={styles.sourcesHead}>
              Sources <span className={styles.sourcesCount}>{s.data.sources.length}</span>
              <SourceLegend sources={s.data.sources} />
            </div>
            <SourcesPanel sources={s.data.sources} activeChunkId={activeChunkId} onOpen={setOpenSource} />
            {/* Lineage sits between the evidence and the note it feeds: sources -> how they
                supersede/amend each other -> the note drafted from them. */}
            {s.data.lineage && <LineagePanel lineage={s.data.lineage}
              citedDocumentIds={s.data.sources.map(src => src.document.id)} />}
            {s.data.note?.length > 0 && (
              <DraftedNote note={s.data.note} sources={s.data.sources}
                lang={lang} onLangChange={setLang}
                langBusy={lang === 'hi' && translating}
                onLangRetry={lang === 'hi' && translateError ? () => void translate('hi') : null}
                hi={lang === 'hi' ? s.data.translations?.hi : undefined}
                onCite={src => setActiveChunkId(src.chunk_id)} />
            )}
            <button type="button" className={styles.askAnother} onClick={askAnother}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Ask another question
            </button>
          </div>
        </div>)}
      {cachedLast && s.state !== 'done' && (
        <ConclusionCard blocks={cachedLast.blocks} sources={cachedLast.sources}
          lang={lang} onLangChange={setLang}
          hindiBlocks={lang === 'hi' ? cachedLast.translations?.hi?.blocks : undefined}
          onCite={src => setActiveChunkId(src.chunk_id)} />)}

      {openSource && <SourceReader source={openSource} onClose={() => setOpenSource(null)} />}
    </>
  );
}
