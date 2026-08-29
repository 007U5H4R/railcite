'use client';
import { BholuMascot } from './BholuMascot';
import { signInWithGoogle } from '@/lib/supabase-browser';
import consoleStyles from './console.module.css';
import authStyles from './auth.module.css';

// Shared "signed out" pattern for Home / Saved / You (R4d–f): the same Bholu-hero card
// EmptyState uses on /ask (consoleStyles.emptyCard/.h1/.sub) topped with the same Google
// button AuthGate uses (authStyles.googleBtn + the identical multicolor "G" glyph) — no
// new visual language, just screen-appropriate copy plugged into the established pattern.
export function SignInPrompt({ heading, sub }: { heading: string; sub: string }) {
  return (
    <div className={consoleStyles.emptyCard}>
      <BholuMascot variant="greet" />
      <h1 className={consoleStyles.h1}>{heading}</h1>
      <p className={consoleStyles.sub}>{sub}</p>
      <button type="button" className={authStyles.googleBtn} onClick={() => void signInWithGoogle()}>
        <svg aria-hidden width="18" height="18" viewBox="0 0 48 48">
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.1 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.4 17.7 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.4 5.8C43.9 38 46.5 31.8 46.5 24.5z" />
          <path fill="#FBBC05" d="M10.4 28.7a14.5 14.5 0 0 1 0-9.4l-7.8-6.1a24 24 0 0 0 0 21.6l7.8-6.1z" />
          <path fill="#34A853" d="M24 48c6.1 0 11.2-2 15-5.5l-7.4-5.8c-2 1.4-4.6 2.2-7.6 2.2-6.3 0-11.7-3.9-13.6-9.5l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
        </svg>
        Continue with Google
      </button>
    </div>
  );
}
