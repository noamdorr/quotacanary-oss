-- =============================================================================
-- 059_feedback_submissions.sql
-- QUO-18: in-app feedback and bug reports, plus a rate limit for the
-- notification they trigger.
-- =============================================================================
--
-- The store of record is a table in the operator's own database, not an email
-- and not a Linear issue. QuotaCanary is self-hostable: a self-hosted instance
-- must not post its users' feedback into someone else's inbox or tracker, and
-- an email-only path drops every submission when POSTMARK_SERVER_TOKEN is unset
-- (lib/email/client.ts logs and returns ok:false). The notification is
-- best-effort on top of a row that has already landed.
--
-- Unsupported-tool requests are deliberately NOT stored here. `tool_requests`
-- (migration 002) already captures them and QUO-15 will read that table as the
-- demand signal; a second capture path would split the stream in two.
--
-- The rate limit is the same shape as consume_test_delivery_rate_limit (057),
-- and for the same reason: this turns a signed-in session into an on-demand
-- outbound-email primitive pointed at the operator's inbox. The counter lives
-- on public.users because 052 column-scoped `authenticated`'s UPDATE there to
-- (notify_mode, view_mode, onboarded_at) - the columns below sit outside that
-- list, so the SECURITY DEFINER function is the only way to move them. A
-- counter on feedback_submissions itself would be pointless anyway, but the
-- table also gets no UPDATE grant at all: submissions are append-only.
-- =============================================================================

create table if not exists public.feedback_submissions (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references public.users(id) on delete cascade,
  -- Unsupported-tool requests go to tool_requests, so this is the pair that
  -- has nowhere else to land.
  category    text        not null check (category in ('bug', 'feedback')),
  message     text        not null,
  -- Diagnostic context. Deliberately no headers, no cookies, no request body:
  -- the point is to know which screen the user was on, not to reconstruct
  -- their session. API keys never pass through here.
  page_path   text,
  app_version text,
  user_agent  text,
  created_at  timestamptz not null default now()
);

alter table public.feedback_submissions enable row level security;

-- Same two-policy shape as tool_requests: a user may file their own and read
-- their own back. Triage happens with the service-role key, which bypasses RLS.
drop policy if exists "feedback_submissions: insert own"
  on public.feedback_submissions;
create policy "feedback_submissions: insert own"
  on public.feedback_submissions for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "feedback_submissions: select own"
  on public.feedback_submissions;
create policy "feedback_submissions: select own"
  on public.feedback_submissions for select
  using ((select auth.uid()) = user_id);

-- 036 and 039 set ALTER DEFAULT PRIVILEGES granting anon, authenticated and
-- service_role full DML on tables created later, so this table was born with
-- UPDATE and DELETE it should not have. RLS already blocks both (there is no
-- update or delete policy below), but the privilege should match the intent:
-- submissions are append-only, and anon has no business here at all.
revoke all on public.feedback_submissions from anon, authenticated;
grant select, insert on public.feedback_submissions to authenticated;

-- Triage reads the whole table with the service-role key, which bypasses RLS.
grant select on public.feedback_submissions to service_role;

-- Newest-first triage over the whole table.
create index if not exists idx_feedback_submissions_created_at
  on public.feedback_submissions using btree (created_at desc);

alter table public.users
  add column if not exists feedback_window_start timestamptz not null default now(),
  add column if not exists feedback_count integer not null default 0;

-- Fixed-window counter, same mechanics as 057: one UPDATE both resets the
-- window and increments the count, every SET expression reads the pre-update
-- row, and row-level write locking serializes concurrent calls on the same
-- user so they cannot race past the limit.
--
-- The subject is auth.uid(), not a parameter, and the limit is a constant, not
-- an argument: `authenticated` executes this directly, so anything the caller
-- supplies is something the caller can set to whatever suits them.
create or replace function public.consume_feedback_rate_limit()
returns table (allowed boolean, reset_seconds int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- 5 submissions per hour. Enough for a user hitting several bugs in one
  -- session, far too few to be worth pointing at the operator's inbox.
  c_limit constant int := 5;
  c_window_seconds constant int := 3600;
  v_user uuid := (select auth.uid());
  v_count int;
  v_window_start timestamptz;
begin
  if v_user is null then
    return query select false, c_window_seconds; -- no session: deny
    return;
  end if;

  update public.users
  set
    feedback_window_start = case
      when now() - feedback_window_start >= make_interval(secs => c_window_seconds)
        then now() else feedback_window_start end,
    feedback_count = case
      when now() - feedback_window_start >= make_interval(secs => c_window_seconds)
        then 1 else feedback_count + 1 end
  where id = v_user
  returning feedback_count, feedback_window_start
  into v_count, v_window_start;

  if v_count is null then
    return query select false, c_window_seconds; -- no profile row: deny
    return;
  end if;

  return query select
    v_count <= c_limit,
    least(
      greatest(
        ceil(
          c_window_seconds - extract(epoch from (now() - v_window_start))
        )::int,
        0
      ),
      c_window_seconds
    );
end;
$$;

-- Functions default EXECUTE to public, so strip that off before granting the
-- roles that should hold it.
revoke execute on function public.consume_feedback_rate_limit()
  from public, anon;
grant execute on function public.consume_feedback_rate_limit()
  to authenticated, service_role;
