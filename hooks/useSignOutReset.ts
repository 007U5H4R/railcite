'use client';
import { useEffect, useRef } from 'react';
import { useSession } from './useSession';

// Fires `onSignedOut` exactly once per signed-in → signed-out TRANSITION — never on an anonymous
// first load, never while the session is still resolving, and never on sign-in or a token
// refresh. RailCite runs on shared office machines: whatever the departing officer had on screen
// (their case, its cited answer, drafts) must not survive their sign-out for the next person.
// The callback is kept in a ref so callers may pass a fresh closure every render without
// re-arming the effect.
export function useSignOutReset(onSignedOut: () => void) {
  const { user, loading } = useSession();
  const prevUid = useRef<string | null>(null);
  const cb = useRef(onSignedOut);
  cb.current = onSignedOut;
  useEffect(() => {
    if (loading) return;                       // a resolving session is not a transition
    const prev = prevUid.current;
    prevUid.current = user?.id ?? null;
    if (prev && !user) cb.current();
  }, [user, loading]);
}
