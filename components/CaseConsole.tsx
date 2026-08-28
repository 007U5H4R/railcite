'use client';
import { useEffect, useMemo, useState } from 'react';
import { Shell } from './Shell';
import { AccountChip } from './AccountChip';
import { ScopeRail, type Scope } from './ScopeRail';
import { CaseInput } from './CaseInput';
import { EmptyState } from './EmptyState';
import { AuthGate } from './AuthGate';
import { TransparencyLine } from './TransparencyLine';
import { ConclusionCard } from './ConclusionCard';
import { EvidencePanel } from './EvidencePanel';
import { SourceReader } from './SourceReader';
import { LoadingSkeleton } from './LoadingSkeleton';
import { ErrorState } from './ErrorState';
import { RefuseState } from './RefuseState';
import { OfflineBanner, useOnline } from './OfflineBanner';
import { useCaseQuery } from '@/hooks/useCaseQuery';
import { signInWithGoogle } from '@/lib/supabase-browser';
import type { QueryResponse, SourceView } from '@/lib/types';

type AnsweredResponse = Extract<QueryResponse, { status: 'answered' }>;

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
      <Shell accountSlot={<AccountChip />} rail={<ScopeRail scope={scope} onChange={setScope} />}
        evidence={s.state === 'done' && s.data.status === 'answered'
          ? <EvidencePanel sources={s.data.sources} lineage={s.data.lineage}
              activeChunkId={activeChunkId} onOpen={setOpenSource} />
          : null}>
        <div>
          <CaseInput value={text} onChange={setText} onSubmit={doSubmit} disabled={s.state === 'loading'} />
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
            <ConclusionCard blocks={s.data.blocks} sources={s.data.sources}
              onCite={src => setActiveChunkId(src.chunk_id)} />)}
          {cachedLast && s.state !== 'done' && (
            <ConclusionCard blocks={cachedLast.blocks} sources={cachedLast.sources} onCite={() => {}} />)}
        </div>
      </Shell>
      {openSource && <SourceReader source={openSource} onClose={() => setOpenSource(null)} />}
    </>
  );
}
