-- =============================================================================
-- 001_initial_schema.sql
-- QuotaCanary initial database schema
-- Phase 1: Foundation
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- public.users
-- Mirrors auth.users with application-level profile fields.
-- Created automatically by the handle_new_user trigger on signup.
create table public.users (
  id          uuid        not null references auth.users(id) on delete cascade,
  email       text        not null,
  name        text,
  org_id      uuid,                                                   -- nullable, Phase 2-3 prep
  timezone    text        not null default 'UTC',
  plan        text        not null default 'free'
                          check (plan in ('free', 'pro', 'team')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (id)
);

-- public.tools
-- Reference table: one row per supported credit-based tool.
-- Seeded with Tier 1 tools; additional tools added per phase.
create table public.tools (
  id                      text    primary key,                        -- e.g. 'neverbounce'
  name                    text    not null,
  logo_url                text,
  api_docs_url            text,
  key_instructions        text,
  category                text,                                       -- e.g. 'email_verification', 'ai'
  integration_type        text    not null default 'api'
                          check (integration_type in ('api', 'manual_only')),
  default_alert_threshold integer,
  is_active               boolean not null default true
);

-- public.connections
-- One row per user-tool pair; stores the encrypted API key and alert config.
create table public.connections (
  id                   uuid        primary key default gen_random_uuid(),
  user_id              uuid        not null references public.users(id) on delete cascade,
  tool_id              text        not null references public.tools(id),
  connection_type      text        not null
                       check (connection_type in ('api', 'manual')),
  encrypted_key        text,                                          -- null for manual connections
  key_hint             text,                                          -- last 4 chars for display
  status               text        not null default 'active'
                       check (status in ('active', 'stale', 'error', 'disconnected')),
  alert_enabled        boolean     not null default false,
  alert_threshold      integer,
  alert_fired_at       timestamptz,
  last_error           text,
  consecutive_failures integer     not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (user_id, tool_id)                                          -- prevents duplicate connections per tool
);

-- public.balances
-- Historical credit balance snapshots for a connection.
-- Phase 2+ uses recorded_at for burn rate trend calculation.
create table public.balances (
  id            uuid        primary key default gen_random_uuid(),
  connection_id uuid        not null references public.connections(id) on delete cascade,
  credit_type   text        not null,                                 -- e.g. 'paid_credits'
  label         text        not null,                                 -- display name, e.g. 'Paid Credits'
  balance       numeric     not null,
  balance_limit numeric,                                              -- max quota if known
  recorded_at   timestamptz not null default now(),                   -- Phase 2 burn rate prep
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

-- Enable RLS on all user-data tables
-- (tools is a public reference table — no RLS needed)
alter table public.users enable row level security;
alter table public.connections enable row level security;
alter table public.balances enable row level security;

-- ---------------------------------------------------------------------------
-- RLS Policies: users
-- Use (select auth.uid()) subquery pattern for 94% performance gain
-- Separate policies per operation — do NOT use FOR ALL
-- ---------------------------------------------------------------------------

create policy "users: select own row"
  on public.users for select
  using ((select auth.uid()) = id);

create policy "users: update own row"
  on public.users for update
  using ((select auth.uid()) = id);

-- ---------------------------------------------------------------------------
-- RLS Policies: connections
-- ---------------------------------------------------------------------------

create policy "connections: select own"
  on public.connections for select
  using ((select auth.uid()) = user_id);

create policy "connections: insert own"
  on public.connections for insert
  with check ((select auth.uid()) = user_id);

create policy "connections: update own"
  on public.connections for update
  using ((select auth.uid()) = user_id);

create policy "connections: delete own"
  on public.connections for delete
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- RLS Policies: balances
-- Access via connection_id — user must own the parent connection
-- ---------------------------------------------------------------------------

create policy "balances: select via own connection"
  on public.balances for select
  using (
    exists (
      select 1 from public.connections c
      where c.id = connection_id
        and (select auth.uid()) = c.user_id
    )
  );

-- ---------------------------------------------------------------------------
-- RLS Policies: tools
-- Public reference table — read access for all authenticated users
-- ---------------------------------------------------------------------------

alter table public.tools enable row level security;

create policy "tools: read for authenticated"
  on public.tools for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Trigger: auto-create public.users row on auth signup
-- ---------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.users (id, email, created_at, updated_at)
  values (
    new.id,
    new.email,
    now(),
    now()
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Indexes: performance for RLS and common queries
-- ---------------------------------------------------------------------------

-- Index user_id columns used in RLS policies (critical for per-user queries)
create index idx_connections_user_id on public.connections using btree (user_id);

-- Index for balance lookups by connection
create index idx_balances_connection_id on public.balances using btree (connection_id);

-- Index for latest balance queries (Phase 2+ burn rate calculations)
create index idx_balances_recorded_at on public.balances (connection_id, recorded_at desc);
