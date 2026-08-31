// Microsoft Clarity — session replay + heatmaps. PRIVACY-FIRST, matching RailCite's trust posture:
//  (1) Replay MASKING is enabled in the Clarity project settings, so no typed case text or circular
//      content is captured — only interactions/layout.
//  (2) The builder's OWN sessions are EXCLUDED: once the snowreaderofficial@gmail.com account signs
//      in on a device, a localStorage flag ("my-system") is set so that device is never recorded
//      again, and the current recording is stopped best-effort. Everyone else IS recorded.
// Disabled entirely when NEXT_PUBLIC_CLARITY_PROJECT_ID is absent (e.g. local dev) — a silent no-op,
// so nothing in the app depends on Clarity being configured.
'use client';

const PROJECT_ID = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;
const EXCLUDE_EMAIL = 'snowreaderofficial@gmail.com';
const EXCLUDE_FLAG = 'railcite:no-clarity'; // per-device "my-system" opt-out

let loaded = false;

function excludedDevice(): boolean {
  try { return localStorage.getItem(EXCLUDE_FLAG) === '1'; } catch { return false; }
}

// Load Clarity once on the client — unless this device is opted out. No-ops without a project id.
export function initClarity(): void {
  if (loaded || !PROJECT_ID || typeof window === 'undefined' || excludedDevice()) return;
  loaded = true;
  (function (c: Record<string, unknown> & { q?: unknown[] }, l: Document, a: string, r: string, i: string) {
    // Standard Clarity loader (queues calls until the async tag script arrives).
    c[a] = c[a] || function (...args: unknown[]) { ((c[a] as { q?: unknown[] }).q = (c[a] as { q?: unknown[] }).q || []).push(args); };
    const t = l.createElement(r) as HTMLScriptElement; t.async = true;
    t.src = 'https://www.clarity.ms/tag/' + i;
    const y = l.getElementsByTagName(r)[0]; y.parentNode!.insertBefore(t, y);
  })(window as unknown as Record<string, unknown>, document, 'clarity', 'script', PROJECT_ID);
}

// On sign-in: if this is the builder's own account, flag the device (excluded from now on) and stop
// the current recording. Best-effort — analytics must never throw into the app.
export function applyClarityExclusion(email: string | null): void {
  if (!PROJECT_ID || typeof window === 'undefined') return;
  if (email && email.toLowerCase() === EXCLUDE_EMAIL) {
    try { localStorage.setItem(EXCLUDE_FLAG, '1'); } catch { /* ignore */ }
    try { (window as unknown as { clarity?: (cmd: string) => void }).clarity?.('stop'); } catch { /* ignore */ }
  }
}
