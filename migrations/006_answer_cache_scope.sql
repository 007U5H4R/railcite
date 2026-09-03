-- 006_answer_cache_scope.sql — the answer cache must be keyed by RETRIEVAL SCOPE, not by the
-- question alone.
--
-- THE BUG THIS FIXES. 004 keyed the cache on `question_norm` alone, which was correct at the
-- time: retrieval saw the whole corpus, so one question had exactly one right answer. Then the
-- domain filter landed (`match_chunks(..., filter_verified, filter_domain)` in 001) and gave the
-- user two knobs that change WHICH CHUNKS ARE ELIGIBLE. The cache never learned about them, and
-- app/api/query/route.ts consults it BEFORE calling matchChunks — so for any previously-asked
-- question the filter was silently skipped entirely.
--
-- Reproduced on the live corpus (2026-09-03): "Vikalp scheme" had been asked once with no domain
-- filter, caching an answer whose sources were CC-61, CC-73, CC-17, Corrigendum-30.05.2018
-- (coaching) AND four FM-01 passages (goods). Re-asking the SAME question with domain='coaching'
-- returned that row verbatim, FM-01 goods sources and all, while retrieval scoped to coaching
-- would have returned eight coaching passages and zero goods ones. The paraphrase "the Vikalp
-- scheme" (cosine 0.978, above the 0.95 floor) hit the same row through the semantic path, so
-- BOTH lookups were scope-blind.
--
-- That is the one failure mode RailCite exists to prevent. A user who narrows to Coaching is
-- making an assertion about which body of rules governs their case; serving them Freight
-- Marketing circulars under that filter, with no indication, is worse than refusing.
--
-- KEY DESIGN — composite unique (question_norm, domain, verified_only), NULLS NOT DISTINCT.
-- Rejected alternative: folding the scope into one opaque string key (e.g. "q\0domain\0v").
-- Two reasons the composite wins:
--   1. `domain` and `verified_only` have to be real, comparable columns REGARDLESS, because the
--      semantic path filters in SQL — a nearest-neighbour scan must be restricted to rows of the
--      same scope, and it cannot compare against a concatenated string. Given the columns exist,
--      a derived key column would be the same fact stored twice, free to drift.
--   2. NULLS NOT DISTINCT (PG >= 15; this instance is 17.6) lets `domain IS NULL` — "all domains",
--      what the Commercial Domain selector sends — be a real key value. The sentinel alternative
--      ('*' for all-domains) would misrepresent the column against `documents.domain`, which is
--      genuinely nullable, and would collide the day a real domain is named '*'.
-- Without NULLS NOT DISTINCT the default rule (NULLs are distinct from each other) would let two
-- rows for the same all-domains question coexist and defeat the upsert — the bug in a new shape.
--
-- Scope matching is STRICT EQUALITY, deliberately. domain=null is a superset of domain='goods',
-- and verified_only=false a superset of verified_only=true, so subsumption rules are tempting.
-- They are not worth it: the broader answer's conclusion text is synthesized from sources the
-- narrower scope excludes, so it is not the answer the narrow scope would have produced. A cache
-- miss costs one synthesis; a wrong-scope hit costs the product's only real promise.
--
-- NOT part of the key: RELEVANCE_THRESHOLD. It also changes results, but it is server config that
-- moves for everyone at once, not per-request user scope — a config change is a deploy, and a
-- deploy is the moment to run invalidateAnswerCache().

-- Every existing row was written before scope existed, so its scope is UNKNOWABLE — it could have
-- come from any filter combination. Purged, not back-filled: inventing a scope for these rows is
-- exactly the kind of plausible-but-unverified assertion this product refuses to make.
-- Runs BEFORE the columns are added so no row ever carries a guessed default.
delete from answer_cache;

alter table answer_cache
  add column if not exists domain        text,           -- null = no domain filter (all domains)
  add column if not exists verified_only boolean not null default false;

-- Swap the question-only uniqueness for the scoped one. Dropped by name; 004 created it as the
-- implicit index behind the inline `unique` on question_norm.
alter table answer_cache drop constraint if exists answer_cache_question_norm_key;
alter table answer_cache drop constraint if exists answer_cache_scope_key;
alter table answer_cache
  add constraint answer_cache_scope_key
  unique nulls not distinct (question_norm, domain, verified_only);

-- The semantic path needs the same filter, or a nearest-neighbour hit from another scope
-- reintroduces the bug through the back door. The scope arguments are REQUIRED — no defaults —
-- so a caller cannot omit them and silently get the old scope-blind behaviour; a stale caller
-- gets a hard "function does not exist" instead. Replacing the signature means dropping the old
-- one: `create or replace` would leave a scope-blind overload in place.
--
-- `is not distinct from` (not `=`) so filter_domain := null matches the null rows rather than
-- matching nothing, mirroring NULLS NOT DISTINCT above.
--
-- Ordering note: the HNSW index gives the nearest rows and the scope predicate filters them, so
-- a filtered scan can in principle walk past `limit 1`. Correctness is unaffected (the predicate
-- is applied either way) and the table holds tens of rows, not millions; no extra index is
-- warranted until it does.
drop function if exists match_cached_answer(vector, float);
create or replace function match_cached_answer(
  query_embedding        vector(1024),
  min_similarity         float,
  filter_domain          text,
  filter_verified_only   boolean
) returns table (id uuid, question text, result jsonb, similarity float)
language sql stable as $$
  select ac.id, ac.question, ac.result,
         1 - (ac.embedding <=> query_embedding) as similarity
  from answer_cache ac
  where ac.domain is not distinct from filter_domain
    and ac.verified_only = filter_verified_only
    and 1 - (ac.embedding <=> query_embedding) >= min_similarity
  order by ac.embedding <=> query_embedding
  limit 1;
$$;
