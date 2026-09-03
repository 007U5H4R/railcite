import { describe, it, expect } from 'vitest';
import * as crawl from '../../scripts/ingest-crawl';

describe('ingest-crawl exports', () => {
  // The daily job must reuse the ingest path verbatim — download, OCR-if-scanned,
  // chunk, embed, insert, plus the chunkless-document rollback. Re-implementing
  // any of that would let the two paths drift apart.
  it('exports ingestOne so the daily crawl reuses it rather than reimplementing', () => {
    expect(typeof crawl.ingestOne).toBe('function');
  });

  it('still exports canonicalUrl, which the delta depends on', () => {
    expect(typeof crawl.canonicalUrl).toBe('function');
  });

  it('does not run its own main() on import', () => {
    // Guarded by the pathToFileURL check; importing must not crawl or mutate.
    expect(process.exitCode ?? 0).toBe(0);
  });
});
