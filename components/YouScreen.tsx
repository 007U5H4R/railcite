'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/hooks/useSession';
import { SignInPrompt } from './SignInPrompt';
import { LoadingSkeleton } from './LoadingSkeleton';
import statesStyles from './states.module.css';
import styles from './screens.module.css';

const CHECK = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 13l4 4L19 7" />
  </svg>
);

const ABOUT_POINTS = [
  'Updated till 31 August 2026 — the knowledge cutoff. RailCite answers from Traffic Commercial circulars and manuals issued up to that date; anything published later is not yet in the corpus.',
  'Extractive only — every answer is built strictly from retrieved circular and manual passages, never from general knowledge.',
  'Every claim is cited — each sentence in a conclusion links to the real passage it came from.',
  'Refuses when no rule is found — if no governing passage exists, RailCite says so instead of guessing.',
  'Verify against the original before relying on a citation operationally.',
  'Independent tool — not an official Indian Railways product.',
  'Not a legal-finality determination — supports research and drafting, not a final ruling.',
];

// You (R4f): the account screen. Profile (avatar/name/email) comes straight from
// useSession(), the same hook AccountChip reads. Sign out calls the SAME
// useSession().signOut — not a re-implementation — so there is exactly one place that
// calls supabase auth.signOut(). "About RailCite" restates TrustFooter's posture as a
// dedicated card instead of duplicating TrustFooter itself (which Shell already renders
// on every route, including this one).
export function YouScreen() {
  const { user, loading, signOut } = useSession();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  // Replay the first-run tour: flag it for OnboardingTour and route to /ask, where its anchors live.
  const replayTour = () => {
    try { sessionStorage.setItem('railcite:replayTour', '1'); } catch { /* storage may be blocked */ }
    router.push('/ask');
  };

  if (loading) {
    return (
      <section className="route-screen" aria-label="You">
        <LoadingSkeleton />
      </section>
    );
  }

  if (!user) {
    return (
      <section className="route-screen" aria-label="You">
        <SignInPrompt
          heading="Sign in to view your account"
          sub="See your Google profile, manage sign-in, and review RailCite’s trust posture."
        />
      </section>
    );
  }

  const handleSignOut = async () => {
    setSigningOut(true);
    setSignOutError(null);
    try { await signOut(); }
    catch { setSignOutError('Couldn’t sign out — try again.'); }
    finally { setSigningOut(false); }
  };

  return (
    <section className="route-screen" aria-label="You">
      <h1 className="route-title">You</h1>

      <div className={styles.profileCard}>
        {user.avatarUrl
          ? // eslint-disable-next-line @next/next/no-img-element -- remote Google avatar; same pattern as AccountChip
            <img src={user.avatarUrl} alt="" width={76} height={76} className={styles.avatarLg} referrerPolicy="no-referrer" />
          : <span aria-hidden="true" className={styles.avatarLgFallback}>{(user.name ?? '?').slice(0, 1)}</span>}
        <p className={styles.profileName}>{user.name ?? 'Signed in'}</p>
        {user.email && <p className={styles.profileEmail}>{user.email}</p>}
        <div className={styles.signOutRow}>
          <button type="button" className={statesStyles.quietBtn} onClick={replayTour}>
            Replay tour
          </button>
          <button type="button" className={statesStyles.quietBtn} onClick={() => void handleSignOut()} disabled={signingOut}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
        {signOutError && <p role="alert" className={styles.inlineError}>{signOutError}</p>}
      </div>

      <div className={styles.aboutCard}>
        <h2 className={styles.aboutH}>About RailCite</h2>
        <ul className={styles.aboutList}>
          {ABOUT_POINTS.map(point => (
            <li key={point} className={styles.aboutItem}>
              <span className={styles.aboutIcon} aria-hidden="true">{CHECK}</span>
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
