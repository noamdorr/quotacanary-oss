-- 009_redesign_thresholds_and_views.sql
-- Adds the low-warning threshold, per-tool defaults + billing URLs, and the
-- table/cards view preference for the dashboard redesign.

-- connections: low-warning threshold (critical reuses existing alert_threshold)
alter table public.connections
  add column if not exists low_threshold integer;

-- tools: default low threshold + billing/top-up page
alter table public.tools
  add column if not exists default_low_threshold integer,
  add column if not exists topup_url text;

-- Sensible default: warn at 3x the critical (alert) threshold where one exists.
update public.tools
  set default_low_threshold = default_alert_threshold * 3
  where default_alert_threshold is not null
    and default_low_threshold is null;

-- Known billing pages (extend as more are verified; null = no top-up link shown).
update public.tools set topup_url = 'https://app.neverbounce.com/account/billing' where id = 'neverbounce';
update public.tools set topup_url = 'https://app.millionverifier.com/'             where id = 'millionverifier';
update public.tools set topup_url = 'https://openrouter.ai/credits'                where id = 'openrouter';

-- users: dashboard view preference (table vs cards), independent of grouping.
alter table public.users
  add column if not exists view_mode text not null default 'table';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_view_mode_check'
  ) then
    alter table public.users
      add constraint users_view_mode_check
      check (view_mode in ('table', 'cards'));
  end if;
end $$;
