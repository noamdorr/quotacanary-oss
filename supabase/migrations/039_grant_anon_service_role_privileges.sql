-- =============================================================================
-- 039_grant_anon_service_role_privileges.sql
-- Complete the fresh-install grants that 036 started: 036 fixed the
-- `authenticated` role, but `service_role` and `anon` have the same gap.
--
-- Found by running the poll pipeline against a clean `supabase db reset`:
-- /api/poll failed with `permission denied for table connections` because the
-- service-role client had no DML on any table (only the REFERENCES / TRIGGER /
-- TRUNCATE residue of the local template). Supabase's HOSTED platform masks
-- this with default privileges that grant anon / authenticated / service_role
-- on every table, so prod never saw it - exactly how the 036 blocker hid.
--
-- service_role is what the poll cron, alert dispatch, and API-token auth run
-- as. anon gets the same block for parity with hosted defaults (the marketing
-- catalog reads with the anon key); RLS remains the real per-row gate, and
-- anon has no RLS policies granting it rows on user tables.
-- =============================================================================

grant usage on schema public to anon, service_role;

grant select, insert, update, delete
  on all tables in schema public
  to anon, service_role;

grant usage, select
  on all sequences in schema public
  to anon, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, service_role;

alter default privileges in schema public
  grant usage, select on sequences to anon, service_role;
