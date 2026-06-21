-- 012_alert_emails.sql
-- Alert email delivery: per-user notification preference (on public.users) and
-- a per-connection notified level used as an escalate-only high-water mark for
-- anti-spam. New signups inherit notify_mode via the column default, so the
-- existing handle_new_user trigger (migration 001) needs no change.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'notify_mode') then
    create type public.notify_mode as enum ('off', 'critical', 'low_and_critical');
  end if;
  if not exists (select 1 from pg_type where typname = 'alert_level') then
    create type public.alert_level as enum ('none', 'low', 'critical');
  end if;
end $$;

alter table public.users
  add column if not exists notify_mode public.notify_mode not null default 'low_and_critical';

alter table public.connections
  add column if not exists notified_level public.alert_level not null default 'none';
