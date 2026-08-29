-- 002_cases.sql — case history (user-owned). Powers the history drawer + the Saved screen.
-- One row per submitted case (answered or refused). Unlike documents/chunks (global corpus,
-- service-role-only with RLS-deny-all), cases are USER data — so RLS is user-scoped and the
-- /api/cases route accesses this table with the USER's JWT, letting Postgres enforce ownership
-- even if app-level scoping ever slips (defense-in-depth).

create table if not exists cases (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  question      text not null,
  verified_only boolean not null default false,
  domain        text,                                             -- null = all; else 'goods' | 'coaching'
  status        text not null check (status in ('answered','refused')),
  result        jsonb,                                            -- full QueryResponse for 'answered'; refuse meta for 'refused'
  is_saved      boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists cases_user_recent_idx on cases (user_id, created_at desc);
create index if not exists cases_user_saved_idx  on cases (user_id) where is_saved;

-- RLS: each user may read/write ONLY their own rows.
alter table cases enable row level security;

create policy cases_select_own on cases
  for select using (auth.uid() = user_id);
create policy cases_insert_own on cases
  for insert with check (auth.uid() = user_id);
create policy cases_update_own on cases
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy cases_delete_own on cases
  for delete using (auth.uid() = user_id);
