// Only http(s) URLs are safe to place in a rendered <a href>. Guards stored data (e.g.
// document.source_url, echoed back verbatim when a self-persisted case is reopened) against
// a `javascript:`/`data:`/etc. payload executing on click. Returns undefined for anything
// that isn't a parseable http/https URL, including empty/absent input.
export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  let protocol: string;
  try { protocol = new URL(url).protocol; } catch { return undefined; }
  return protocol === 'http:' || protocol === 'https:' ? url : undefined;
}
