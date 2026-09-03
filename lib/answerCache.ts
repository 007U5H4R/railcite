import { adminClient } from './db';
import { optionalEnv } from './env';
import type { QueryResponse } from './types';

// Answer cache (migrations/004_answer_cache.sql, scoped by 006_answer_cache_scope.sql):
// identical or near-identical questions are served from a stored answered QueryResponse with NO
// model call. Lookup order: exact match on the normalized question (free, unambiguous — covers
// the suggested starter questions verbatim), then nearest-neighbour on the question's Voyage
// embedding above a HIGH similarity floor. The floor is deliberately conservative (default 0.95):
// serving a cached answer to a question that is merely related — not the same — would be a trust
// hazard. Every failure here is swallowed after a log: the cache is an optimization and must
// never break or block a query.
//
// THE KEY IS (question, scope) — NOT the question alone. `domain` and `verified_only` are the
// user's own assertion about which body of rules governs their case, and match_chunks enforces
// them as hard SQL filters. Because the route consults this cache BEFORE it calls matchChunks, a
// scope-blind key means the filter is skipped outright for any repeat question. That actually
// happened: a "Vikalp scheme" answer cached with no filter kept being served, four goods FM-01
// sources included, to users who had narrowed to Coaching. Both lookup paths carry the scope, and
// so does the store — a nearest-neighbour hit from a different scope is the same bug.

/** Exact-match key: lowercase, collapse whitespace, drop trailing punctuation. */
export function normalizeQuestion(q: string): string {
  return q.toLowerCase().replace(/\s+/g, ' ').trim().replace(/[?.!\s]+$/u, '');
}

/**
 * The retrieval scope a cached answer was produced under. Every field here changes WHICH CHUNKS
 * ARE ELIGIBLE in match_chunks, so every field is part of the cache key. Adding a new retrieval
 * filter means adding it here, to migrations' unique constraint, and to match_cached_answer —
 * the three places kept in lockstep by tests/lib/answercache.test.ts.
 */
export interface CacheScope {
  domain: string | null;      // null = no domain filter (all domains)
  verifiedOnly: boolean;
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

/**
 * Cached answered response for this question IN THIS SCOPE (exact, then semantic), or null.
 *
 * Scope match is strict equality on both fields, never subsumption. It is true that domain=null
 * retrieves a superset of domain='goods', but the cached CONCLUSION was synthesized from sources
 * the narrower scope excludes — so it is not the answer the narrow scope would have produced.
 * A miss costs one synthesis; a wrong-scope hit costs the cite-or-refuse promise.
 */
export async function findCachedAnswer(question: string, embedding: number[],
                                       scope: CacheScope): Promise<QueryResponse | null> {
  try {
    const sb = adminClient();
    // `.is('domain', null)` — NOT `.eq(..., null)`, which PostgREST renders as `domain=eq.null`
    // and matches nothing. The unique constraint is NULLS NOT DISTINCT, so null is a real key
    // value here (the all-domains row) and has to be looked up with IS NULL.
    let q = sb.from('answer_cache').select('id, result')
      .eq('question_norm', normalizeQuestion(question))
      .eq('verified_only', scope.verifiedOnly);
    q = scope.domain === null ? q.is('domain', null) : q.eq('domain', scope.domain);
    const { data: exact, error: e1 } = await q.maybeSingle();
    if (e1) throw e1;
    let hit: { id: string; result: unknown } | null = exact ?? null;
    if (!hit) {
      const { data, error } = await sb.rpc('match_cached_answer',
        { query_embedding: embedding, min_similarity: threshold(),
          filter_domain: scope.domain, filter_verified_only: scope.verifiedOnly });
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

/** Store an ANSWERED response for future hits, TAGGED WITH THE SCOPE THAT PRODUCED IT. Refusals
 * are never cached — the corpus may later grow an answer, and a cached refusal would hide it.
 * Upserts on (question_norm, domain, verified_only) so a re-ask in the SAME scope refreshes,
 * while the same question in another scope becomes its own row rather than overwriting. */
export async function storeCachedAnswer(question: string, embedding: number[],
                                        result: QueryResponse, scope: CacheScope): Promise<void> {
  if (result.status !== 'answered') return;
  try {
    const { error } = await adminClient().from('answer_cache').upsert(
      { question, question_norm: normalizeQuestion(question), embedding, result,
        domain: scope.domain, verified_only: scope.verifiedOnly },
      { onConflict: 'question_norm,domain,verified_only' });
    if (error) throw error;
  } catch (e) {
    console.warn('answer cache store failed (non-blocking):', e);
  }
}
