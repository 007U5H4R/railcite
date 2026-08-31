-- 003_feedback.sql — user-submitted product feedback (free text from the "Feedback" tab).
-- Like `cases` (002), this is USER data, not global corpus: RLS is user-scoped and the
-- /api/feedback route accesses it with the caller's own JWT, so Postgres enforces ownership
-- (auth.uid() = user_id) even if app-level scoping ever slips (defense-in-depth). Insert-only
-- from the app; nobody edits or deletes their feedback through the UI. Reviewers read it out
-- of band with the service role (which bypasses RLS), so no broad select policy is granted.

create table if not exists feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  message    text not null check (char_length(message) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists feedback_recent_idx on feedback (created_at desc);

-- RLS: a signed-in user may insert (and read back) only their own feedback. No update/delete
-- policies — feedback is immutable once sent; service-role reviewers bypass RLS entirely.
alter table feedback enable row level security;

create policy feedback_insert_own on feedback
  for insert with check (auth.uid() = user_id);
create policy feedback_select_own on feedback
  for select using (auth.uid() = user_id);
