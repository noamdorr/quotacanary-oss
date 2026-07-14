-- Remove secret-bearing path segments from legacy display hints.
update public.alert_destinations
set url_hint = split_part(url_hint, '/', 1)
where url_hint like '%/%';

-- Hints are display-only hosts. Full destination URLs remain encrypted.
alter table public.alert_destinations
  add constraint alert_destinations_url_hint_host_only
  check (url_hint !~ '[/@?#]');
