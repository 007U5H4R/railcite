import { adminClient } from './db';
import { optionalEnv } from './env';
import type { QueryResponse } from './types';

// Answer cache (migrations/004_answer_cache.sql): identical or near-identical questions are
// served from a stored answered QueryResponse with NO model call. Lookup order: exact match on
// the normalized question (free, unambiguous — covers the suggested starter questions verbatim),
// then nearest-neighbour on the question's Voyage embedding above a HIGH similarity floor.
// The floor is deliberately conservative (default 0.95): serving a cached answer to a question
// that is merely related — not the same — would be a trust hazard. Every failure here is
// swallowed after a log: the cache is an optimization and must never break or block a query.

/** Exact-match key: lowercase, collapse whitespace, drop trailing punctuation. */
export function normalizeQuestion(q: string): string {
  return q.toLowerCase().replace(/\s+/g, ' ').trim().replace(/[?.!\s]+$/u, '');
}

/**
 * Drop every cached answer. Call this from ANYTHING that changes the corpus — not just
 * ingest, but any backfill that rewrites document metadata.
 *
 * A cached row stores the whole answered QueryResponse verbatim, including a snapshot of
 * each source document (circular_no, domain, is_ocr, text_quality). So a metadata migration
 * silently un-does itself on every cache hit: after the domain/label/quality backfills, a
 * cached "Vikalp scheme" answer kept replaying `title="FM-01", domain=goods, circular_no=null`
 * and was served five more times — looking exactly like the bug the backfill had just fixed.
 *
 * This lived as two copy-pasted lines inside the ingest scripts, which is why the backfills
 * did not honour it. One exported function, so the contract is findable from the cache module
 * that owns it.
 */
export async function invalidateAnswerCache(reason: string): Promise<void> {
  const { error } = await adminClient().from('answer_cache').delete().gte('created_at', '1970-01-01');
  if (error) throw new Error(`answer_cache invalidation failed (${reason}): ${error.message}`);
  console.log(`answer_cache cleared (${reason})`);
}

const threshold = () => Number(optionalEnv('ANSWER_CACHE_THRESHOLD', '0.95'));

/** Cached answered response for this question (exact, then semantic), or null. */
export async function findCachedAnswer(question: string, embedding: number[]): Promise<QueryResponse | null> {
  try {
    const sb = adminClient();
    const { data: exact, error: e1 } = await sb.from('answer_cache')
      .select('id, result').eq('question_norm', normalizeQuestion(question)).maybeSingle();
    if (e1) throw e1;
    let hit: { id: string; result: unknown } | null = exact ?? null;
    if (!hit) {
      const { data, error } = await sb.rpc('match_cached_answer',
        { query_embedding: embedding, min_similarity: threshold() });
      if (error) throw error;
      hit = (data as Array<{ id: string; result: unknown }> | null)?.[0] ?? null;
    }
    if (!hit) return null;
    // Usage bookkeeping — awaited (serverless kills post-response work, so a fired-and-forgotten
    // bump never lands); a failure still must not cost the hit, hence its own catch.
    await sb.rpc('bump_answer_cache_hit', { cache_id: hit.id }).then(() => {}, () => {});
    return hit.result as QueryResponse;
  } catch (e) {
    console.warn('answer cache lookup failed (non-blocking):', e);
    return null;
  }
}

/** Store an ANSWERED response for future hits. Refusals are never cached — the corpus may
 * later grow an answer, and a cached refusal would hide it. Upserts on the normalized
 * question so a re-ask refreshes rather than duplicates. */
export async function storeCachedAnswer(question: string, embedding: number[], result: QueryResponse): Promise<void> {
  if (result.status !== 'answered') return;
  try {
    const { error } = await adminClient().from('answer_cache').upsert(
      { question, question_norm: normalizeQuestion(question), embedding, result },
      { onConflict: 'question_norm' });
    if (error) throw error;
  } catch (e) {
    console.warn('answer cache store failed (non-blocking):', e);
  }
}
