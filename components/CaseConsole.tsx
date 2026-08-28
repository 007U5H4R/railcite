'use client';
import { useEffect, useState } from 'react';
import { Shell } from './Shell';
import { AccountChip } from './AccountChip';
import { ScopeRail, type Scope } from './ScopeRail';
import { CaseInput } from './CaseInput';
import { EmptyState } from './EmptyState';
import { AuthGate } from './AuthGate';
import { TransparencyLine } from './TransparencyLine';
import { useCaseQuery } from '@/hooks/useCaseQuery';
import { signInWithGoogle } from '@/lib/supabase-browser';

export function CaseConsole() {
  const [text, setText] = useState('');
  const [scope, setScope] = useState<Scope>({ verifiedOnly: false, domain: null });
  const { s, submit, retry, reset } = useCaseQuery();

  useEffect(() => {                       // restore draft after OAuth round-trip
    try { const d = localStorage.getItem('railcite:draft');
      if (d) { setText(d); localStorage.removeItem('railcite:draft'); } } catch {}
  }, []);

  const doSubmit = () => void submit({ case_text: text, verified_only: scope.verifiedOnly, domain: scope.domain });
  const onSignIn = () => { try { localStorage.setItem('railcite:draft', text); } catch {}; void signInWithGoogle(); };

  return (
    <Shell accountSlot={<AccountChip />} rail={<ScopeRail scope={scope} onChange={setScope} />}
      evidence={null /* T19 mounts EvidencePanel here via state lift */}>
      <div>
        <CaseInput value={text} onChange={setText} onSubmit={doSubmit} disabled={s.state === 'loading'} />
        {s.state === 'idle' && <EmptyState onPick={t => { setText(t); }} />}
        {s.state === 'loading' && (
          <TransparencyLine text={s.searched ? `Searching ${s.searched.toLocaleString('en-IN')} passages…` : 'Searching…'} />)}
        {s.state === 'auth_required' && <AuthGate onSignIn={onSignIn} />}
        {s.state === 'loading' && <p>TODO(T20 skeleton)</p>}
        {s.state === 'error' && <p>TODO(T20 error): {s.message} <button onClick={retry}>Try again</button></p>}
        {s.state === 'done' && s.data.status === 'refused' && <p>TODO(T20 refuse)</p>}
        {s.state === 'done' && s.data.status === 'answered' && <p>TODO(T18 conclusion)</p>}
      </div>
    </Shell>
  );
}
