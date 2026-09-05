-- 008_dead_urls.sql — the crawl's skip set for links the site lists but no longer serves.
--
-- The Traffic Commercial index pages still link PDFs that 404 (dead files never
-- pruned from the CMS). They are never in `documents`, so the daily delta counts
-- them as "new" on every single run. Left alone, that phantom backlog sits above
-- the flood guard (assertDeltaSane / CRAWL_MAX_NEW) forever and every nightly run
-- trips DRIFT with nothing real to ingest.
--
-- This table remembers a failed URL so computeDelta can exclude it next time:
--   * a 4xx (404/410/403) is permanent — the file is gone; skip after one failure.
--   * anything else (a random abort, a truncated body) might be the flaky gov
--     server, so fail_count must reach the threshold before we stop retrying.
--   * any later success DELETES the row (crawl-daily.ts) — self-healing, so a
--     transient blip can never blacklist a real document for good.
--
-- filename (the decoded, lowercased basename) mirrors documents' identity key:
-- the corpus and the CMS disagree on URL form, so the delta dedups on basename,
-- and the skip set must exclude on the same key or a dead link slips back in
-- under a different path.

create table if not exists dead_urls (
  url             text primary key,
  filename        text not null,
  first_failed_at timestamptz not null default now(),
  last_failed_at  timestamptz not null default now(),
  fail_count      int not null default 1,
  last_error      text
);

-- The delta exclusion loads the whole (small) table each run, but keep the
-- basename lookup cheap for any ad-hoc "why was this skipped?" query.
create index if not exists dead_urls_filename_idx on dead_urls (filename);

-- Operational data, not user data: service role only, like crawl_runs/documents.
alter table dead_urls enable row level security;
