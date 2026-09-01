'use client';
import { Analytics } from '@vercel/analytics/next';

// Vercel Web Analytics (pageviews / visitors). It reports the page URL, and RailCite's reopen
// route is /ask?case=<uuid> — so a naive install would ship case UUIDs to Vercel and break the
// guarantee lib/analytics.ts already enforces for Mixpanel ("NO URL ever leaves"). `beforeSend`
// redacts every identifier out of the URL before the beacon is sent, so Vercel only ever sees
// the ROUTE SHAPE (/ask, /saved, /you), never which case was opened.
//
// Must be a client component: `beforeSend` is a function, and functions cannot cross the
// server→client boundary from app/layout.tsx.

/** Query keys whose VALUES identify a user's own data and must never leave the app. */
const REDACT = ['case', 'id'];

/** Strip identifying query values from a pageview URL, keeping the route shape intact. */
export function redactUrl(raw: string): string {
  try {
    const url = new URL(raw);
    for (const key of REDACT) {
      if (url.searchParams.has(key)) url.searchParams.set(key, 'redacted');
    }
    return url.toString();
  } catch {
    return raw;   // never let a malformed URL break analytics (or the page)
  }
}

export function VercelAnalytics() {
  return <Analytics beforeSend={event => ({ ...event, url: redactUrl(event.url) })} />;
}
