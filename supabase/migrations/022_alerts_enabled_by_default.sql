-- New connections should fulfill QuotaCanary's core promise by default:
-- notify when watched credits cross their thresholds.
update public.connections
  set alert_enabled = true,
      updated_at = now()
  where alert_enabled = false;

alter table public.connections
  alter column alert_enabled set default true;
