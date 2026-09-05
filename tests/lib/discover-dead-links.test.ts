import { describe, it, expect } from 'vitest';
import {
  isPermanentFailure, deadFilenames, computeDelta, assertDeltaSane, DriftError,
  DEAD_URL_THRESHOLD, basenameKey, type Discovered, type DeadUrlRow,
} from '../../lib/ingest/discover';

const TC = 'https://indianrailways.gov.in/railwayboard/uploads/directorate/traffic_comm';
const found = (n: number, tag: string): Discovered[] =>
  Array.from({ length: n }, (_, i) => ({ source_url: `${TC}/2024/${tag}_${i}.pdf`, title: `${tag} ${i}`, domain: null }));

describe('isPermanentFailure', () => {
  it('treats 404/410/403 as permanent — the site lists a link it no longer serves', () => {
    expect(isPermanentFailure('http 404')).toBe(true);
    expect(isPermanentFailure('http 410')).toBe(true);
    expect(isPermanentFailure('http 403')).toBe(true);
  });

  it('treats a flaky-server failure as NOT permanent, so it is retried', () => {
    expect(isPermanentFailure('empty/too small')).toBe(false);
    expect(isPermanentFailure('no extractable text')).toBe(false);
    expect(isPermanentFailure('fetch failed')).toBe(false);
    expect(isPermanentFailure('The operation was aborted')).toBe(false);
    expect(isPermanentFailure('http 503')).toBe(false);   // a transient server error, keep retrying
    expect(isPermanentFailure(null)).toBe(false);
  });
});

describe('deadFilenames', () => {
  it('skips a 404 after a SINGLE failure — a dead file never recovers', () => {
    const rows: DeadUrlRow[] = [{ filename: 'rc_99_2099.pdf', fail_count: 1, last_error: 'http 404' }];
    expect(deadFilenames(rows).has('rc_99_2099.pdf')).toBe(true);
  });

  it('does NOT skip a transient failure below the threshold — one abort must not blacklist a real doc', () => {
    const rows: DeadUrlRow[] = [{ filename: 'rc_01_2026.pdf', fail_count: DEAD_URL_THRESHOLD - 1, last_error: 'empty/too small' }];
    expect(deadFilenames(rows).has('rc_01_2026.pdf')).toBe(false);
  });

  it('skips a non-permanent failure once it has failed threshold times', () => {
    const rows: DeadUrlRow[] = [{ filename: 'rc_02_2026.pdf', fail_count: DEAD_URL_THRESHOLD, last_error: 'empty/too small' }];
    expect(deadFilenames(rows).has('rc_02_2026.pdf')).toBe(true);
  });

  it('normalises to the lowercased basename so the delta excludes on the same key it dedups on', () => {
    const rows: DeadUrlRow[] = [{ filename: 'RC_Mixed_Case.PDF', fail_count: 1, last_error: 'http 404' }];
    expect(deadFilenames(rows).has('rc_mixed_case.pdf')).toBe(true);
  });
});

describe('computeDelta excludes the dead-link skip set', () => {
  it('drops a discovered PDF whose basename is on the skip set', () => {
    const discovered = found(1, 'gone');
    const dead = new Set([basenameKey(discovered[0].source_url)]);
    expect(computeDelta(discovered, new Set(), new Set(), dead)).toHaveLength(0);
  });

  it('is backward-compatible: omitting the dead set excludes nothing', () => {
    const discovered = found(3, 'live');
    expect(computeDelta(discovered, new Set(), new Set())).toHaveLength(3);
  });
});

// The regression this whole change exists for: the first live crawl found 69 broken links the site
// still lists (mostly http 404). They are never in `documents`, so every night they re-appear as
// "new", the delta stays 69 > the 50 flood-guard ceiling, and the cron trips DRIFT forever with
// nothing real to ingest. The skip set must pull the delta back under the ceiling.
describe('regression: the dead-link phantom backlog no longer trips the flood guard', () => {
  const MAX_NEW = 50;

  it('reproduces the failure: 65 phantom-plus-real news trip assertDeltaSane', () => {
    const discovered = [...found(60, 'dead'), ...found(5, 'real')];
    const delta = computeDelta(discovered, new Set(), new Set());
    expect(delta).toHaveLength(65);
    expect(() => assertDeltaSane(delta.length, MAX_NEW)).toThrow(DriftError);
  });

  it('is fixed: with the 60 dead links on the skip set, only the 5 real docs remain and the guard passes', () => {
    const dead = [...found(60, 'dead')];
    const discovered = [...dead, ...found(5, 'real')];
    const deadRows: DeadUrlRow[] = dead.map(d => ({ filename: basenameKey(d.source_url), fail_count: 1, last_error: 'http 404' }));
    const delta = computeDelta(discovered, new Set(), new Set(), deadFilenames(deadRows));
    expect(delta).toHaveLength(5);
    expect(() => assertDeltaSane(delta.length, MAX_NEW)).not.toThrow();
  });
});
