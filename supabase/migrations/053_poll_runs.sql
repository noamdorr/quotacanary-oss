-- =============================================================================
-- 053_poll_runs.sql
-- QUO-30: a durable summary row per poll run.
--
-- The poll route's counters previously existed only in the HTTP response, which
-- lands in a cron log that nobody keeps and that says nothing about the run
-- before it. Without history there is no way to answer "when did balances last
-- refresh", "how long has alert delivery been broken", or "did the schedule
-- stop firing" - the three questions the runbook
-- (docs/runbooks/poll-cron.md) exists to answer.
--
-- Deliberately metrics-only: no connection ids, no user ids, no vendor names,
-- no error strings. Failure detail stays in the server log, where it is already
-- written and where it is not readable through PostgREST. That keeps this table
-- safe to hand to a dashboard or an ops query without leaking who is watching
-- what.
--
-- Growth is negligible - one row per run, ~35k rows/year at the 15-minute
-- cadence - so this gets no prune function of its own.
-- =============================================================================

create table if not exists public.poll_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null,
  finished_at timestamptz not null default now(),
  duration_ms integer not null,
  outcome text not null check (outcome in ('ok', 'degraded', 'failed')),
  connections_polled integer not null default 0,
  refresh_ok integer not null default 0,
  refresh_failed integer not null default 0,
  alerts_sent integer not null default 0,
  alerts_failed integer not null default 0,
  alerts_degraded boolean not null default false,
  pruned integer not null default 0,
  -- Scheduled runs the gap since the previous row implies were skipped. The
  -- only in-app trace that the hosted schedule was paused or retimed.
  missed_runs integer not null default 0
);

-- Every read is "the most recent run(s)": the route's own previous-run lookup
-- and every runbook query.
create index if not exists poll_runs_started_at_idx
  on public.poll_runs (started_at desc);

-- RLS on with no policies at all: this is operator telemetry, and no end user
-- has any business reading the fleet's poll history. The service role bypasses
-- RLS, which is the only writer.
alter table public.poll_runs enable row level security;

-- 036 and 039 set ALTER DEFAULT PRIVILEGES granting anon, authenticated and
-- service_role full CRUD on tables created later in this schema, so this table
-- was born with those grants. RLS already blocks the two user-facing roles, but
-- leaving the privilege in place means one accidental permissive policy is all
-- that stands between an end user and this table. Take it away instead.
revoke all on public.poll_runs from anon, authenticated;

-- Explicit rather than inherited: a fresh install that ran 053 before the
-- default-privilege migrations, or one whose owner role differs, would
-- otherwise leave the poll route unable to record its own runs (the exact
-- fresh-install grants gap 036 and 039 were written for).
grant select, insert on public.poll_runs to service_role;
