import { safeHref } from '@/lib/safe-href';

it('passes through http and https URLs', () => {
  expect(safeHref('https://example.com/a.pdf')).toBe('https://example.com/a.pdf');
  expect(safeHref('http://example.com/a.pdf')).toBe('http://example.com/a.pdf');
});
it('rejects javascript: and other non-http(s) schemes', () => {
  expect(safeHref('javascript:alert(1)')).toBeUndefined();
  expect(safeHref('data:text/html,<script>alert(1)</script>')).toBeUndefined();
  expect(safeHref('file:///etc/passwd')).toBeUndefined();
});
it('rejects unparseable and empty/absent values', () => {
  expect(safeHref('not a url')).toBeUndefined();
  expect(safeHref('')).toBeUndefined();
  expect(safeHref(null)).toBeUndefined();
  expect(safeHref(undefined)).toBeUndefined();
});
