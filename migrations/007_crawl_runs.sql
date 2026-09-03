-- 007_crawl_runs.sql — one row per daily crawl.
--
-- Two jobs. First, forensics: when a run fails, the counts say whether discovery
-- broke (sections_checked/pdfs_seen at zero) or ingest did (new_found high,
-- ingested low). Second, freshness: the app can answer "corpus last checked:
-- <date>" from the newest ok row — a procurement-grade claim that is only cheap
-- to make because the run is recorded.
--
-- Silence is the failure mode this guards. A crawler that quietly stops looks
-- exactly like a quiet week; the legacy traffic_comm index pages rotted for a
-- decade that way.

create table if not exists crawl_runs (
  id               uuid primary key default gen_random_uuid(),
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  sections_checked int not null default 0,
  pdfs_seen        int not null default 0,
  new_found        int not null default 0,
  ingested         int not null default 0,
  failed           int not null default 0,
  status           text not null default 'running' check (status in ('running','ok','failed')),
  error            text
);

create index if not exists crawl_runs_recent_idx on crawl_runs (started_at desc);

-- Operational data, not user data: service role only, like documents/chunks.
alter table crawl_runs enable row level security;
