-- 004_answer_cache.sql — cached answered QueryResponses, keyed by the question.
-- An identical (normalized) or near-identical (embedding-similar) question is served straight
-- from this table with NO model call — the suggested starter questions and common repeats stop
-- costing Anthropic tokens and return instantly. GLOBAL data, not per-user: an answer is an
-- extractive fact about the corpus, the same for everyone. Like documents/chunks it is
-- service-role-only (RLS enabled with no policies = deny-all; adminClient bypasses).
--
-- STALENESS CONTRACT: rows reflect the corpus AT GENERATION TIME. Any ingest that adds or
-- supersedes circulars must `truncate answer_cache` (scripts/ingest-* should do this), or a
-- cached answer could contradict a newer corrigendum — a trust hazard RailCite must never risk.
-- Refusals are NEVER cached (the corpus may later grow an answer).

create table if not exists answer_cache (
  id            uuid primary key default gen_random_uuid(),
  question      text not null,
  question_norm text not null unique,             -- lowercased/whitespace-collapsed exact key
  embedding     vector(1024) not null,            -- voyage-3 query embedding of `question`
  result        jsonb not null,                   -- the full answered QueryResponse, verbatim
  hits          int not null default 0,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz not null default now()
);
create index if not exists answer_cache_embedding_idx
  on answer_cache using hnsw (embedding vector_cosine_ops);

alter table answer_cache enable row level security;   -- no policies: deny-all except service role

-- Nearest cached question above a similarity floor (cosine), or no rows.
create or replace function match_cached_answer(
  query_embedding vector(1024),
  min_similarity float
) returns table (id uuid, question text, result jsonb, similarity float)
language sql stable as $$
  select ac.id, ac.question, ac.result,
         1 - (ac.embedding <=> query_embedding) as similarity
  from answer_cache ac
  where 1 - (ac.embedding <=> query_embedding) >= min_similarity
  order by ac.embedding <=> query_embedding
  limit 1;
$$;

create or replace function bump_answer_cache_hit(cache_id uuid)
returns void language sql as $$
  update answer_cache set hits = hits + 1, last_used_at = now() where id = cache_id;
$$;
