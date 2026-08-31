'use client';
import { useState } from 'react';
import { useSession } from '@/hooks/useSession';
import { getAccessToken } from '@/lib/supabase-browser';
import { SignInPrompt } from './SignInPrompt';
import { LoadingSkeleton } from './LoadingSkeleton';
import styles from './screens.module.css';

const MAX = 4000;
const CHECK = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 13l4 4L19 7" />
  </svg>
);

// Feedback (bottom-nav tab): a signed-in user writes free-text product feedback; POST /api/feedback
// persists it (RLS-scoped to them). Same auth gating as YouScreen — loading skeleton, then a
// sign-in prompt for signed-out visitors, then the form. States: idle → sending → sent (with a
// "send more" reset) or an inline error that keeps the typed text so nothing is lost on failure.
export function FeedbackScreen() {
  const { user, loading } = useSession();
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  if (loading) {
    return <section className="route-screen" aria-label="Feedback"><LoadingSkeleton /></section>;
  }
  if (!user) {
    return (
      <section className="route-screen" aria-label="Feedback">
        <SignInPrompt
          heading="Sign in to send feedback"
          sub="Tell us what’s working, what’s missing, or a circular RailCite got wrong — your notes go straight to the team."
        />
      </section>
    );
  }

  const trimmed = text.trim();
  const ok = trimmed.length >= 1 && trimmed.length <= MAX;

  const submit = async () => {
    if (!ok || status === 'sending') return;
    setStatus('sending');
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) { setError('Your session expired — sign in again to send feedback.'); setStatus('idle'); return; }
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: trimmed }),
      });
      if (!res.ok) { setError('Couldn’t send that — try again.'); setStatus('idle'); return; }
      setText('');
      setStatus('sent');
    } catch {
      setError('Couldn’t send that — check your connection and try again.');
      setStatus('idle');
    }
  };

  return (
    <section className="route-screen" aria-label="Feedback">
      <h1 className="route-title">Feedback</h1>

      {status === 'sent' ? (
        <div className={styles.feedbackCard}>
          <span className={styles.feedbackSentIcon} aria-hidden="true">{CHECK}</span>
          <p className={styles.feedbackSentH}>Thanks — we’ve got it.</p>
          <p className={styles.feedbackSentSub}>Your feedback helps us decide what to build next.</p>
          <button type="button" className={styles.quietCta} onClick={() => setStatus('idle')}>
            Send more feedback
          </button>
        </div>
      ) : (
        <div className={styles.feedbackCard}>
          <label className={styles.feedbackLabel} htmlFor="feedback-msg">What’s on your mind?</label>
          <textarea
            id="feedback-msg"
            className={styles.feedbackTextarea}
            placeholder="Share what’s working, what’s missing, or a case RailCite handled wrong…"
            value={text}
            maxLength={MAX}
            rows={6}
            disabled={status === 'sending'}
            onChange={e => setText(e.target.value)}
          />
          <div className={styles.feedbackFoot}>
            <span className={styles.feedbackCount}>{trimmed.length}/{MAX}</span>
            <button type="button" className={styles.feedbackSubmit} disabled={!ok || status === 'sending'} onClick={() => void submit()}>
              {status === 'sending' ? 'Sending…' : 'Send feedback'}
            </button>
          </div>
          {error && <p role="alert" className={styles.inlineError}>{error}</p>}
        </div>
      )}
    </section>
  );
}
