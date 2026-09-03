import { describe, it, expect } from 'vitest';
import { shouldInvalidateCache, passesDateFloor } from '../../scripts/crawl-daily';

describe('shouldInvalidateCache', () => {
  // ingest-crawl clears the cache unconditionally at run start. For a job that
  // runs every night and usually finds nothing, that would wipe the cache daily
  // and destroy the hit rate that makes repeat questions free.
  it('does not clear the cache on a no-op night', () => {
    expect(shouldInvalidateCache(0)).toBe(false);
  });

  // A cached answer embeds a snapshot of its sources, so it must not outlive a
  // corpus change (migration 004's contract).
  it('clears the cache when something was actually ingested', () => {
    expect(shouldInvalidateCache(1)).toBe(true);
  });
});

describe('passesDateFloor', () => {
  const FLOOR = '2026-08-31';

  it('accepts a document issued after the floor', () => {
    expect(passesDateFloor('2026-09-02', FLOOR)).toBe(true);
  });

  it('rejects a document issued before the floor', () => {
    expect(passesDateFloor('2020-01-01', FLOOR)).toBe(false);
  });

  // FAILS OPEN. Some issue_date values in this corpus are simply wrong —
  // "FM-01 / 2007" is stamped 2021-08-16. The URL diff has already proven the
  // document is new; the floor only vetoes CLEAR evidence of age. A strict floor
  // over an untrustworthy field would silently drop genuinely new circulars.
  it('accepts a document with no issue_date rather than dropping it', () => {
    expect(passesDateFloor(null, FLOOR)).toBe(true);
  });

  it('accepts an unparseable issue_date rather than dropping it', () => {
    expect(passesDateFloor('not-a-date', FLOOR)).toBe(true);
  });

  it('accepts a document issued exactly on the floor date', () => {
    expect(passesDateFloor('2026-08-31', FLOOR)).toBe(true);
  });
});
