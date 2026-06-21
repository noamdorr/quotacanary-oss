-- =============================================================================
-- 015_alert_events_and_destinations.sql
-- Durable in-app alert events plus user-configured webhook destinations.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'alert_destination_kind') then
    create type public.alert_destination_kind as enum ('webhook', 'slack_webhook');
  end if;
end $$;

create table if not exists public.alert_events (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  connection_id   uuid references public.connections(id) on delete set null,
  level           public.alert_level not null
                  check (level in ('low'::public.alert_level, 'critical'::public.alert_level)),
  tool_name       text not null,
  connection_name text not null,
  title           text not null,
  body            text not null,
  pools           jsonb not null default '[]'::jsonb
                  check (jsonb_typeof(pools) = 'array'),
  dashboard_url   text not null,
  topup_url       text,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

create table if not exists public.alert_destinations (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.users(id) on delete cascade,
  kind                 public.alert_destination_kind not null,
  name                 text not null,
  encrypted_url        text not null,
  url_hint             text not null,
  min_level            public.alert_level not null default 'low'
                       check (min_level in ('low'::public.alert_level, 'critical'::public.alert_level)),
  is_enabled           boolean not null default true,
  last_sent_at         timestamptz,
  last_error           text,
  consecutive_failures integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.alert_events enable row level security;
alter table public.alert_destinations enable row level security;

create policy "alert_events: select own"
  on public.alert_events for select
  using ((select auth.uid()) = user_id);

create policy "alert_events: update own"
  on public.alert_events for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "alert_destinations: select own"
  on public.alert_destinations for select
  using ((select auth.uid()) = user_id);

create policy "alert_destinations: insert own"
  on public.alert_destinations for insert
  with check ((select auth.uid()) = user_id);

create policy "alert_destinations: update own"
  on public.alert_destinations for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "alert_destinations: delete own"
  on public.alert_destinations for delete
  using ((select auth.uid()) = user_id);

create index if not exists idx_alert_events_user_created
  on public.alert_events (user_id, created_at desc);

create index if not exists idx_alert_events_unread
  on public.alert_events (user_id, created_at desc)
  where read_at is null;

create index if not exists idx_alert_destinations_user_enabled
  on public.alert_destinations (user_id, is_enabled);
