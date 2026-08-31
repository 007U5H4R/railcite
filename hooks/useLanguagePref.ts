'use client';
import { useCallback, useEffect, useState } from 'react';
import type { Language } from '@/lib/i18n';

const KEY = 'railcite:lang';

// ONE remembered output language for the answered view — the response, the drafted note, the
// refuse card and the loading line all follow it.
//
// It replaces two independent per-segment toggles that reset to English on every submit: a
// Hindi-reading officer had to flip two 32px controls for every single case, and the refuse card's
// Hindi copy was effectively unreachable because submitting always reset the language. Persisted
// per device, so the preference survives reloads.
//
// The cost guard the reset was protecting is kept elsewhere: a translation is still fetched
// lazily, once, only when the language is actually Hindi — and it is cached on the answer.
export function useLanguagePref(): [Language, (l: Language) => void] {
  const [lang, setLangState] = useState<Language>('en');

  // Read after mount (never during render) so server and client markup agree.
  useEffect(() => {
    try { if (localStorage.getItem(KEY) === 'hi') setLangState('hi'); } catch { /* private mode */ }
  }, []);

  const setLang = useCallback((l: Language) => {
    setLangState(l);
    try { localStorage.setItem(KEY, l); } catch { /* non-fatal — preference just won't persist */ }
  }, []);

  return [lang, setLang];
}
