'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CaseInput } from './CaseInput';
import { EmptyState } from './EmptyState';
import { AuthGate } from './AuthGate';
import { TransparencyLine } from './TransparencyLine';
import { ConclusionCard } from './ConclusionCard';
import { SourcesPanel } from './SourcesPanel';
import { DraftedNote } from './DraftedNote';
import { LineagePanel } from './LineagePanel';
import { SourceReader } from './SourceReader';
import { LoadingSkeleton } from './LoadingSkeleton';
import { ErrorState } from './ErrorState';
import { RefuseState } from './RefuseState';
import { OfflineBanner, useOnline } from './OfflineBanner';
import { useCaseQuery } from '@/hooks/useCaseQuery';
import { signInWithGoogle, getAccessToken } from '@/lib/supabase-browser';
import type { CaseDetail, QueryResponse, SourceView } from '@/lib/types';
import styles from './console.module.css';

type AnsweredResponse = Extract<QueryResponse, { status: 'answered' }>;

// Scope filter state (verified-only + domain single-select). Was ScopeRail's exported
// type; ScopeRail itself was retired in R3 (superseded by the filter pills rendered
// directly below), so the type now lives here, its sole consumer.
export interface Scope { verifiedOnly: boolean; domain: string | null }

// Domain filter options (single-select). null = all domains.
const DOMAINS: { label: string; value: string | null }[] = [
  { label: 'All domains', value: null },
  { label: 'Goods', value: 'goods' },
  { label: 'Coaching', value: 'coaching' },
];

// Ask screen recomposed into the mockup's single column: case field, filter pills, then the
// cited conclusion with its sources inline below, then the five states. Query state, the
// /api/query call, and the AuthGate flow are UNCHANGED from the original 3-zone console —
// only layout/composition moved. The Shell (TopBar / bottom nav / drawer) is provided by
// app/layout.tsx, so this component renders just the Ask content.
export function CaseConsole() {
  const [text, setText] = useState('');
  const [scope, setScope] = useState<Scope>({ verifiedOnly: false, domain: null });
  const { s, submit, retry, reset, reopen } = useCaseQuery();
  const router = useRouter();
  const [openSource, setOpenSource] = useState<SourceView | null>(null);      // card click -> reader
  const [activeChunkId, setActiveChunkId] = useState<string | null>(null);    // chip click -> highlight
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());           // case ids toggled saved
  const [savePending, setSavePending] = useState(false);

  useEffect(() => {                       // restore draft after OAuth round-trip
    try { const d = localStorage.getItem('railcite:draft');
      if (d) { setText(d); localStorage.removeItem('railcite:draft'); } } catch {}
  }, []);

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

  // The drawer's "New case" links to /ask?new=1 — a one-shot signal that resets even when
  // already on /ask, where identical-route navigation would otherwise keep this state intact.
  useEffect(() => {
    if (!newSignal) return;
    askAnother();
    router.replace('/ask');   // consume the signal so a refresh doesn't re-fire it
  }, [newSignal, askAnother, router]);

  const doSubmit = () => void submit({ case_text: text, verified_only: scope.verifiedOnly, domain: scope.domain });
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

      <div className={styles.filters} role="group" aria-label="Scope filters">
        <button type="button" aria-pressed={scope.verifiedOnly}
          className={`${styles.pill} ${scope.verifiedOnly ? styles.pillOn : ''}`}
          onClick={() => setScope({ ...scope, verifiedOnly: !scope.verifiedOnly })}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 13l4 4L19 7" />
          </svg>
          Verified only
        </button>
        {DOMAINS.map(d => (
          <button key={d.label} type="button" aria-pressed={scope.domain === d.value}
            className={`${styles.pill} ${scope.domain === d.value ? styles.pillOn : ''}`}
            onClick={() => setScope({ ...scope, domain: d.value })}>
            {d.label}
          </button>
        ))}
      </div>

      {s.state === 'idle' && !cachedLast && <EmptyState onPick={t => { setText(t); }} />}
      {s.state === 'loading' && (
        <TransparencyLine text={s.searched ? `Searching ${s.searched.toLocaleString('en-IN')} passages…` : 'Searching…'} />)}
      {s.state === 'auth_required' && <AuthGate onSignIn={onSignIn} />}
      {s.state === 'loading' && <LoadingSkeleton />}
      {s.state === 'error' && <ErrorState message={s.message} onRetry={retry} />}
      {s.state === 'done' && s.data.status === 'refused' && (
        <RefuseState meta={s.data.meta}
          onBroaden={scope.verifiedOnly ? () => {
            setScope({ ...scope, verifiedOnly: false });
            void submit({ case_text: text, verified_only: false, domain: scope.domain });
          } : null}
          onRephrase={() => document.querySelector('textarea')?.focus()} />)}
      {s.state === 'done' && s.data.status === 'answered' && (
        <div className={styles.answerGrid}>
          <div className={styles.answerMain}>
            <ConclusionCard blocks={s.data.blocks} sources={s.data.sources}
              onCite={src => setActiveChunkId(src.chunk_id)}
              isSaved={caseId != null && savedIds.has(caseId)}
              saveDisabled={caseId == null || savePending}
              onToggleSave={caseId == null ? null : toggleSave} />
            <div className={styles.sourcesHead}>
              Sources <span className={styles.sourcesCount}>{s.data.sources.length}</span>
            </div>
            <SourcesPanel sources={s.data.sources} activeChunkId={activeChunkId} onOpen={setOpenSource} />
            {/* Lineage sits between the evidence and the note it feeds: sources -> how they
                supersede/amend each other -> the note drafted from them. */}
            {s.data.lineage && <LineagePanel lineage={s.data.lineage} />}
            {s.data.note?.length > 0 && (
              <DraftedNote note={s.data.note} sources={s.data.sources}
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
        <ConclusionCard blocks={cachedLast.blocks} sources={cachedLast.sources} onCite={() => {}} />)}

      {openSource && <SourceReader source={openSource} onClose={() => setOpenSource(null)} />}
    </>
  );
}
