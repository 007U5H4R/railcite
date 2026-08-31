'use client';
import { useEffect } from 'react';

// Route-level error boundary. Without one, a single malformed value (e.g. an old or partially
// written saved case whose `result` lacks blocks/sources) throws during render and Next shows a
// bare "Application error" for the WHOLE app — and, because the crash re-fires on every load of
// that URL, the offending history entry becomes a permanent landmine. Here the failure stays
// contained and always offers a way forward.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('render error:', error); }, [error]);
  return (
    <div role="alert" style={{
      maxWidth: '32rem', margin: '3rem auto', padding: '1.5rem 1.25rem', borderRadius: '1rem',
      background: '#fff', border: '1px solid #e2e8f0', boxShadow: '0 10px 30px -18px rgba(24,54,120,.35)',
      fontFamily: 'var(--font-sans, system-ui), sans-serif', color: '#1e293b',
    }}>
      <h1 style={{ margin: '0 0 .5rem', fontSize: '1.125rem', fontWeight: 700 }}>Something went wrong on this screen.</h1>
      <p style={{ margin: '0 0 1.25rem', fontSize: '.9375rem', lineHeight: 1.55, color: '#475569' }}>
        Nothing was lost — your saved cases are intact. Try again, or start a new case.
      </p>
      <div style={{ display: 'flex', gap: '.625rem', flexWrap: 'wrap' }}>
        <button type="button" onClick={reset} style={{
          minHeight: 44, padding: '0 1.125rem', borderRadius: '.75rem', border: 'none',
          background: '#1c62d6', color: '#fff', fontWeight: 600, fontSize: '.9375rem', cursor: 'pointer',
        }}>Try again</button>
        <a href="/ask?new=1" style={{
          minHeight: 44, padding: '0 1.125rem', display: 'inline-flex', alignItems: 'center',
          borderRadius: '.75rem', border: '1px solid #cbd5e1', color: '#334155',
          fontWeight: 600, fontSize: '.9375rem', textDecoration: 'none',
        }}>New case</a>
      </div>
    </div>
  );
}
