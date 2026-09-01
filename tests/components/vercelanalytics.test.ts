import { redactUrl } from '@/components/VercelAnalytics';

// Vercel Web Analytics reports the page URL. RailCite's reopen route carries a case UUID, and
// lib/analytics.ts promises no URL/identifier ever leaves the app — these pin that promise.

it('redacts the case UUID from a reopen URL, keeping the route shape', () => {
  const out = redactUrl('https://railcite.vercel.app/ask?case=6f1c2b7e-6a1d-4a55-9c33-9f2f2c1a77bd');
  expect(out).not.toContain('6f1c2b7e');
  expect(out).toContain('/ask');
  expect(out).toContain('case=redacted');
});

it('redacts an id param too, and leaves non-identifying params alone', () => {
  expect(redactUrl('https://railcite.vercel.app/ask?id=abc123')).toContain('id=redacted');
  const kept = redactUrl('https://railcite.vercel.app/ask?new=1');
  expect(kept).toContain('new=1');
});

it('passes clean URLs through untouched', () => {
  const clean = 'https://railcite.vercel.app/saved';
  expect(redactUrl(clean)).toBe(clean);
});

it('never throws on a malformed URL (analytics must not break the page)', () => {
  expect(redactUrl('not-a-url')).toBe('not-a-url');
});
