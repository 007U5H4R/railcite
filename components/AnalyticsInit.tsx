'use client';
import { useEffect, useRef } from 'react';
import { initAnalytics, analytics } from '@/lib/analytics';
import { initClarity, applyClarityExclusion } from '@/lib/clarity';
import { useSession } from '@/hooks/useSession';

// Mounts once at the app root (app/layout.tsx) and initializes Mixpanel on the client. Renders
// nothing. Kept separate from Shell so analytics setup is a single, isolated concern — and so
// Clarity (deferred to ship) can slot in here later behind the same client boundary.
export function AnalyticsInit() {
  const { user, loading } = useSession();
  const prevId = useRef<string | null>(null);
  // Independently guarded: analytics must never throw into the app, and one vendor failing
  // (blocked storage, a script-stripping extension) must not stop the other from initializing.
  useEffect(() => {
    try { initAnalytics(); } catch (e) { console.warn('analytics init failed:', e); }
    try { initClarity(); } catch (e) { console.warn('clarity init failed:', e); }
  }, []);
  // Link analytics to the signed-in user (opaque Supabase UUID) for user-level retention. Reset
  // ONLY on an actual sign-out transition — never on anonymous first load, which would churn the
  // anonymous distinct_id and break funnel continuity. On sign-in, also exclude the builder's own
  // sessions from Clarity replay.
  useEffect(() => {
    if (loading) return;
    if (user) { analytics.identify(user.id); applyClarityExclusion(user.email); prevId.current = user.id; }
    else if (prevId.current) { analytics.resetIdentity(); prevId.current = null; }
    // Settled anonymous with no in-memory history: the session may have ended between page loads
    // (expiry, another tab, restart), leaving a persisted identity the ref can't know about.
    else analytics.resetIfStaleIdentity();
  }, [user, loading]);
  return null;
}
