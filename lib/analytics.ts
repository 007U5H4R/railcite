// Mixpanel instrumentation for RailCite. PRIVACY-FIRST: no case text, no question content, and
// no user PII (no email, no name) ever leaves the app — only the six funnel events below, each
// carrying at most a single numeric count. The ONE user linkage is identify() with the OPAQUE
// Supabase user UUID (never email/name) — a deliberate ship-time trade to get user-level retention
// while keeping PII out; resetIdentity() returns to an anonymous id on sign-out. The Mixpanel
// project lives in the EU region, so the SDK points at the EU ingestion host.
'use client';
import mixpanel from 'mixpanel-browser';

const TOKEN = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;
let ready = false;

// Init once, client-side only. No-ops when the token is absent (local dev without a token,
// or during SSR) so nothing in the app ever depends on analytics being configured.
export function initAnalytics(): void {
  if (ready || !TOKEN || typeof window === 'undefined') return;
  mixpanel.init(TOKEN, {
    api_host: 'https://api-eu.mixpanel.com', // EU data residency (project created in the EU)
    autocapture: false,      // no automatic click/DOM/pageview capture — we fire ONLY the six events below
    track_pageview: false,   // SPA; we don't emit pageviews
    persistence: 'localStorage',
    ignore_dnt: false,       // honor the browser's Do-Not-Track signal
    // mixpanel attaches $current_url/$referrer to every event by default; on /ask?case=<uuid>
    // that would ship a case UUID. Blacklist them so NO URL/referrer ever leaves — keeping the
    // "only a numeric count leaves" guarantee literally true.
    property_blacklist: ['$current_url', '$referrer', '$initial_referrer'],
  });
  ready = true;
}

// Fire-and-forget. Guards on `ready` so a missing token is a silent no-op, and the try/catch
// guarantees an analytics failure can never throw into the app's render/interaction paths.
function track(event: string, props?: Record<string, number | string | boolean>): void {
  if (!ready) return;
  try { mixpanel.track(event, props); } catch { /* analytics must never break the app */ }
}

// The six events from Design.md Appendix B / Solution-PRD §8. citation_count is the only
// property, and it is a count — never the citation text.
export const analytics = {
  caseSubmitted: () => track('case_submitted'),
  conclusionGenerated: (citationCount: number) => track('conclusion_generated', { citation_count: citationCount }),
  citationClickedThrough: () => track('citation_clicked_through'),
  draftNoteCopied: () => track('draft_note_copied'),
  draftNoteExported: () => track('draft_note_exported'),
  noRuleFoundShown: () => track('no_rule_found_shown'),
  // User-level retention: link events to the signed-in user by their opaque Supabase UUID (never
  // email/name). identify() on sign-in; resetIdentity() on sign-out returns to an anonymous id.
  identify: (userId: string) => {
    if (!ready) return;
    try { mixpanel.identify(userId); } catch { /* analytics must never break the app */ }
  },
  resetIdentity: () => {
    if (!ready) return;
    try { mixpanel.reset(); } catch { /* analytics must never break the app */ }
  },
  // Reset when the SDK still holds a signed-in identity but nobody is signed in. The in-memory
  // sign-out transition alone was not enough: mixpanel persists distinct_id in localStorage, so a
  // session that ended between page loads (token expiry, sign-out in another tab, browser
  // restart) left the departed user's UUID attached — on a shared office machine the next
  // person's events attributed to them, and their sign-in would merge the two identities.
  resetIfStaleIdentity: () => {
    if (!ready) return;
    try {
      const id = mixpanel.get_distinct_id?.();
      if (typeof id === 'string' && !id.startsWith('$device:')) mixpanel.reset();
    } catch { /* analytics must never break the app */ }
  },
};
