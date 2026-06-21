-- =============================================================================
-- 002_multi_connection_and_requests.sql
-- Delta migration for projects already running 001 (the original schema).
-- Folds in spec §5: multiple connections per tool, connection naming + tagging,
-- a per-user display preference, and the tool_requests capture table.
--
-- Every statement is idempotent — safe to run more than once and safe whether
-- or not connections/users already contain rows.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Allow multiple connections per tool — drop the unique (user_id, tool_id).
--    The inline constraint from 001 is named connections_user_id_tool_id_key.
-- ---------------------------------------------------------------------------
alter table public.connections
  drop constraint if exists connections_user_id_tool_id_key;

-- ---------------------------------------------------------------------------
-- 2. connections.name — defaults to the tool's name for any existing rows,
--    then enforced NOT NULL (the app supplies it on insert going forward).
-- ---------------------------------------------------------------------------
alter table public.connections add column if not exists name text;

update public.connections c
  set name = t.name
  from public.tools t
  where c.tool_id = t.id
    and c.name is null;

alter table public.connections alter column name set not null;

-- ---------------------------------------------------------------------------
-- 3. connections.tags — free-form labels (agency/client grouping).
-- ---------------------------------------------------------------------------
alter table public.connections
  add column if not exists tags text[] not null default '{}';

-- ---------------------------------------------------------------------------
-- 4. users.display_mode — flat vs grouped-by-tool dashboard default.
-- ---------------------------------------------------------------------------
alter table public.users
  add column if not exists display_mode text not null default 'flat';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_display_mode_check'
  ) then
    alter table public.users
      add constraint users_display_mode_check
      check (display_mode in ('flat', 'grouped'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. tool_requests — lightweight "request a tool" capture. Email deferred.
-- ---------------------------------------------------------------------------
create table if not exists public.tool_requests (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.users(id) on delete cascade,
  tool_name  text        not null,
  note       text,
  created_at timestamptz not null default now()
);

alter table public.tool_requests enable row level security;

drop policy if exists "tool_requests: insert own" on public.tool_requests;
create policy "tool_requests: insert own"
  on public.tool_requests for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "tool_requests: select own" on public.tool_requests;
create policy "tool_requests: select own"
  on public.tool_requests for select
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 6. Tool-detail page lists all connections for one user+tool (no longer unique).
-- ---------------------------------------------------------------------------
create index if not exists idx_connections_user_tool
  on public.connections using btree (user_id, tool_id);
