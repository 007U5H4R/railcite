'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from '@/hooks/useSession';
import { useCases } from '@/hooks/useCases';
import { SignInPrompt } from './SignInPrompt';
import { CaseListCard } from './CaseListCard';
import { LoadingSkeleton } from './LoadingSkeleton';
import consoleStyles from './console.module.css';
import styles from './screens.module.css';

const CASE_CAP = 8;

// Home (R4d): signed-in greeting + primary CTA + recent cases + corpus stat line, or a
// welcoming signed-out intro. Cases come from GET /api/cases via useCases() — the same
// authed-fetch pattern as hooks/useRecentCases.ts (token via getAccessToken, Bearer
// header). Stats are best-effort: GET /api/stats needs no auth and a failure just hides
// the line, matching how useCaseQuery.ts already treats the same endpoint (non-blocking).
export function HomeScreen() {
  const { user, loading: sessionLoading } = useSession();
  const { cases, loading, error, refresh } = useCases();
  const [stats, setStats] = useState<{ documents: number; chunks: number } | null>(null);

  const signedIn = !!user;
  useEffect(() => {
    if (!signedIn) { setStats(null); return; }
    let cancelled = false;
    fetch('/api/stats').then(r => r.json()).then(s => { if (!cancelled) setStats(s); }).catch(() => {});
    return () => { cancelled = true; };
  }, [signedIn]);

  if (sessionLoading) {
    return (
      <section className="route-screen" aria-label="Home">
        <LoadingSkeleton />
      </section>
    );
  }

  if (!user) {
    return (
      <section className="route-screen" aria-label="Home">
        <SignInPrompt
          heading="Cite the rule. Show the lineage. Or say there isn’t one."
          sub="RailCite searches real Indian Railways circulars and manuals, answers only with cited passages, and refuses when no governing rule is found. Sign in to start your first case."
        />
      </section>
    );
  }

  const firstName = user.name?.trim().split(/\s+/)[0] || 'there';

  return (
    <section className="route-screen" aria-label="Home">
      <h1 className="route-title">Hi, {firstName}</h1>
      {stats && (
        <p className={styles.statLine}>
          {stats.chunks.toLocaleString('en-IN')} passages across {stats.documents.toLocaleString('en-IN')} circulars &amp; manuals
        </p>
      )}

      <Link href="/ask" className={styles.primaryCta}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        New case
      </Link>

      <div className={consoleStyles.sourcesHead}>
        Recent cases {!loading && !error && <span className={consoleStyles.sourcesCount}>{cases.length}</span>}
      </div>
      <CaseListCard
        cases={cases.slice(0, CASE_CAP)}
        loading={loading}
        error={error}
        onRetry={refresh}
        emptyText="No cases yet — ask your first one above."
        hint={cases.length > CASE_CAP
          ? `Showing your ${CASE_CAP} most recent — tap the history icon (top left) for your full list.`
          : undefined}
      />
    </section>
  );
}
