'use client';
import { useEffect } from 'react';
import { initAnalytics } from '@/lib/analytics';

// Mounts once at the app root (app/layout.tsx) and initializes Mixpanel on the client. Renders
// nothing. Kept separate from Shell so analytics setup is a single, isolated concern — and so
// Clarity (deferred to ship) can slot in here later behind the same client boundary.
export function AnalyticsInit() {
  useEffect(() => { initAnalytics(); }, []);
  return null;
}
