import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

// Regression scar for a migration that silently un-did itself.
//
// answer_cache rows store the whole answered QueryResponse verbatim, including a snapshot of
// each source document. The domain / circular_no / text_quality backfills rewrote that
// metadata for 5,687 documents but did not clear the cache, so a cached "Vikalp scheme"
// answer kept replaying the pre-backfill snapshot (title="FM-01", domain=goods,
// circular_no=null) and was served five more times — indistinguishable from the bug the
// backfill had just fixed.
//
// migrations/004 states the contract: "a cached answer must never outlive the corpus snapshot
// that produced it". It was enforced by two copy-pasted lines inside the ingest scripts, which
// is exactly why a new corpus-writing script missed it. These tests assert that every script
// which writes to `documents` routes through the one shared helper.
describe('corpus-changing scripts invalidate the answer cache', () => {
  const CORPUS_WRITERS = [
    'scripts/ingest-crawl.ts',
    'scripts/ingest-local.ts',
    'scripts/backfill-domain.ts',
    'scripts/backfill-source-integrity.ts',
  ];

  it.each(CORPUS_WRITERS)('%s calls invalidateAnswerCache', file => {
    expect(read(file)).toContain('invalidateAnswerCache(');
  });

  it.each(CORPUS_WRITERS)('%s does not hand-roll its own cache delete', file => {
    // Hand-rolled deletes are how the contract drifted in the first place.
    expect(read(file)).not.toMatch(/answer_cache'\)\s*\.delete\(/);
  });

  it('the helper is exported from the module that owns the cache', () => {
    const src = read('lib/answerCache.ts');
    expect(src).toContain('export async function invalidateAnswerCache');
    expect(src).toMatch(/answer_cache'\)\s*\.delete\(/);
  });

  it('the helper fails loudly rather than leaving a stale cache behind', () => {
    // Swallowing this error would reintroduce the exact bug: the write succeeds, the cache
    // survives, and the corpus change is invisible to anyone hitting a cached answer.
    expect(read('lib/answerCache.ts')).toMatch(/invalidation failed/);
  });
});
