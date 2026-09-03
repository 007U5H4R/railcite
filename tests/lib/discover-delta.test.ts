import { describe, it, expect } from 'vitest';
import {
  computeDelta, assertSectionProductive, assertDeltaSane, DriftError,
} from '../../lib/ingest/discover';
import { canonicalUrl } from '../../scripts/ingest-crawl';

const d = (u: string) => ({ source_url: u, title: 't', domain: 'goods' as const });

describe('computeDelta', () => {
  it('drops urls already in the corpus', () => {
    const known = new Set([canonicalUrl('https://x.gov.in/a.pdf')]);
    expect(computeDelta([d('https://x.gov.in/a.pdf'), d('https://x.gov.in/b.pdf')], known, new Set()))
      .toEqual([expect.objectContaining({ source_url: expect.stringContaining('b.pdf') })]);
  });

  // The manifest carried ~92 groups of http/https and percent-encoding twins of
  // the same file; exact-string dedup let them through and 68 duplicate document
  // groups reached the live DB. The delta must canonicalise before comparing.
  it('treats an http twin of a known https url as already held', () => {
    const known = new Set([canonicalUrl('https://x.gov.in/a.pdf')]);
    expect(computeDelta([d('http://x.gov.in/a.pdf')], known, new Set())).toEqual([]);
  });

  it('deduplicates within the discovered set itself', () => {
    expect(computeDelta([d('https://x.gov.in/a.pdf'), d('https://x.gov.in/a.pdf')], new Set(), new Set()))
      .toHaveLength(1);
  });

  it('stores the canonical form, which is what documents.source_url holds', () => {
    const [only] = computeDelta([d('http://X.gov.in/a.pdf')], new Set(), new Set());
    expect(only.source_url).toBe(canonicalUrl('http://X.gov.in/a.pdf'));
  });

  // A live dry-run found 335 "new" docs; 211 were the same filename already in the
  // corpus under a different URL (the daily crawl reads the modern CMS section pages,
  // but the corpus was seeded from an older static manifest). URL-only comparison
  // missed these; filename dedup catches them.
  it('treats a doc whose FILENAME is already in the corpus as held, even under a different URL', () => {
    const knownFiles = new Set(['cc-73_2016.pdf']);
    const found = [{ source_url: 'https://x.gov.in/directorate/traffic_comm/NEW_FOLDER/CC-73_2016.pdf', title: 't', domain: 'coaching' as const }];
    expect(computeDelta(found, new Set(), knownFiles)).toEqual([]);
  });

  it('a genuinely new filename passes both dedup checks', () => {
    const found = [{ source_url: 'https://x.gov.in/directorate/traffic_comm/y/BRAND_NEW.pdf', title: 't', domain: 'goods' as const }];
    expect(computeDelta(found, new Set(), new Set(['old.pdf']))).toHaveLength(1);
  });
});

describe('assertSectionProductive', () => {
  // The legacy traffic_comm/*.jsp index pages froze at 2011 when the site
  // reorganised and nobody noticed for a decade. A crawler that finds nothing
  // looks exactly like a quiet day, so zero is an error, never a silent success.
  it('raises when a section yields no pdfs at all', () => {
    expect(() => assertSectionProductive('Freight Marketing', 0)).toThrow(DriftError);
  });

  it('passes when the section yielded pdfs', () => {
    expect(() => assertSectionProductive('Freight Marketing', 3)).not.toThrow();
  });
});

describe('assertDeltaSane', () => {
  // A sudden flood means something upstream changed. Mass-ingesting unreviewed
  // documents into a citable corpus is the wrong response to surprise.
  it('raises when the delta exceeds the ceiling', () => {
    expect(() => assertDeltaSane(51, 50)).toThrow(DriftError);
  });

  it('allows a delta at the ceiling', () => {
    expect(() => assertDeltaSane(50, 50)).not.toThrow();
  });

  it('allows the ordinary case of nothing new', () => {
    expect(() => assertDeltaSane(0, 50)).not.toThrow();
  });
});
