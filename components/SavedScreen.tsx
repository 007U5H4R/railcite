'use client';
import { useSession } from '@/hooks/useSession';
import { useCases } from '@/hooks/useCases';
import { getAccessToken } from '@/lib/supabase-browser';
import { SignInPrompt } from './SignInPrompt';
import { CaseListCard } from './CaseListCard';
import { LoadingSkeleton } from './LoadingSkeleton';
import type { RecentCase } from '@/hooks/useRecentCases';
import styles from './screens.module.css';

function shortLabel(question: string): string {
  return question.length > 60 ? `${question.slice(0, 60)}…` : question;
}

// Saved (R4e): the caller's bookmarked cases (GET /api/cases?saved=1 via useCases),
// each un-savable in place. Un-save is optimistic (PATCH { id, is_saved:false }): the
// row is removed immediately, and only rolled back (restoreLocal) if the request fails
// — mirroring how CaseConsole's own save toggle already treats a failed PATCH as
// non-blocking rather than surfacing a toast.
export function SavedScreen() {
  const { user, loading: sessionLoading } = useSession();
  const { cases, loading, error, refresh, removeLocal, restoreLocal } = useCases({ savedOnly: true });

  if (sessionLoading) {
    return (
      <section className="route-screen" aria-label="Saved">
        <LoadingSkeleton />
      </section>
    );
  }

  if (!user) {
    return (
      <section className="route-screen" aria-label="Saved">
        <SignInPrompt
          heading="Sign in to see your saved cases"
          sub="Bookmark a cited answer from any case and it’ll be collected here for quick reference."
        />
      </section>
    );
  }

  const handleUnsave = async (c: RecentCase) => {
    removeLocal(c.id);                                  // optimistic
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('no token');
      const res = await fetch('/api/cases', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: c.id, is_saved: false }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
    } catch {
      restoreLocal(c);                                   // roll back on failure
    }
  };

  return (
    <section className="route-screen" aria-label="Saved">
      <h1 className="route-title">Saved</h1>
      <p className="route-lede">Cases you’ve bookmarked, for quick reference.</p>
      <div className={styles.sectionGap}>
        <CaseListCard
          cases={cases}
          loading={loading}
          error={error}
          onRetry={refresh}
          emptyText="No saved cases yet — bookmark a cited answer to keep it here."
          renderAction={c => (
            <button
              type="button"
              className={styles.unsaveBtn}
              aria-label={`Remove "${shortLabel(c.question)}" from saved`}
              onClick={() => void handleUnsave(c)}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V20l-6-4-6 4V4.5Z" />
              </svg>
            </button>
          )}
        />
      </div>
    </section>
  );
}
