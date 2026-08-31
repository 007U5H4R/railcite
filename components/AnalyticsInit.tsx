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
  useEffect(() => { initAnalytics(); initClarity(); }, []);
  // Link analytics to the signed-in user (opaque Supabase UUID) for user-level retention. Reset
  // ONLY on an actual sign-out transition — never on anonymous first load, which would churn the
  // anonymous distinct_id and break funnel continuity. On sign-in, also exclude the builder's own
  // sessions from Clarity replay.
  useEffect(() => {
    if (loading) return;
    if (user) { analytics.identify(user.id); applyClarityExclusion(user.email); prevId.current = user.id; }
    else if (prevId.current) { analytics.resetIdentity(); prevId.current = null; }
  }, [user, loading]);
  return null;
}
