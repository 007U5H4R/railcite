'use client';
import { useEffect, useMemo, useState } from 'react';
import { CaseInput } from './CaseInput';
import { EmptyState } from './EmptyState';
import { AuthGate } from './AuthGate';
import { TransparencyLine } from './TransparencyLine';
import { ConclusionCard } from './ConclusionCard';
import { SourcesPanel } from './SourcesPanel';
import { SourceReader } from './SourceReader';
import { LoadingSkeleton } from './LoadingSkeleton';
import { ErrorState } from './ErrorState';
import { RefuseState } from './RefuseState';
import { OfflineBanner, useOnline } from './OfflineBanner';
import { useCaseQuery } from '@/hooks/useCaseQuery';
import { signInWithGoogle } from '@/lib/supabase-browser';
import type { QueryResponse, SourceView } from '@/lib/types';
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
  const { s, submit, retry, reset } = useCaseQuery();
  const [openSource, setOpenSource] = useState<SourceView | null>(null);      // card click -> reader
  const [activeChunkId, setActiveChunkId] = useState<string | null>(null);    // chip click -> highlight

  useEffect(() => {                       // restore draft after OAuth round-trip
    try { const d = localStorage.getItem('railcite:draft');
      if (d) { setText(d); localStorage.removeItem('railcite:draft'); } } catch {}
  }, []);

  const doSubmit = () => void submit({ case_text: text, verified_only: scope.verifiedOnly, domain: scope.domain });
  const onSignIn = () => { try { localStorage.setItem('railcite:draft', text); } catch {}; void signInWithGoogle(); };

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
        <>
          <ConclusionCard blocks={s.data.blocks} sources={s.data.sources}
            onCite={src => setActiveChunkId(src.chunk_id)} />
          <div className={styles.sourcesHead}>
            Sources <span className={styles.sourcesCount}>{s.data.sources.length}</span>
          </div>
          <SourcesPanel sources={s.data.sources} activeChunkId={activeChunkId} onOpen={setOpenSource} />
        </>)}
      {cachedLast && s.state !== 'done' && (
        <ConclusionCard blocks={cachedLast.blocks} sources={cachedLast.sources} onCite={() => {}} />)}

      {openSource && <SourceReader source={openSource} onClose={() => setOpenSource(null)} />}
    </>
  );
}
