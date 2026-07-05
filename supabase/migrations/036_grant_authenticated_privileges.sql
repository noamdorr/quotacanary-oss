-- =============================================================================
-- 036_grant_authenticated_privileges.sql
-- Grant table-level privileges to the `authenticated` role.
--
-- Every table in `public` has RLS enabled with per-user policies (see 001+),
-- but RLS runs *after* SQL table-level privilege checks. Migrations 001-035
-- created the tables and the policies but never issued the underlying GRANTs,
-- so the `authenticated` role had no SELECT/INSERT/UPDATE/DELETE on any table.
--
-- Supabase's HOSTED platform masks this: it pre-configures default privileges
-- that auto-grant migration-created tables to anon/authenticated/service_role.
-- A clean-from-zero `supabase db reset` (local dev + self-host) does NOT, so a
-- freshly installed instance returns `permission denied for table connections`
-- for every signed-in user the moment they load the dashboard.
--
-- These grants are coarse (table-level); RLS remains the real per-row gate, so
-- broad DML to `authenticated` stays safe - a user still only sees/writes their
-- own rows. This mirrors Supabase's own default grant block.
-- =============================================================================

grant usage on schema public to authenticated;

grant select, insert, update, delete
  on all tables in schema public
  to authenticated;

grant usage, select
  on all sequences in schema public
  to authenticated;

-- Future tables/sequences created in this schema inherit the same grants, so a
-- later migration that adds a table doesn't reintroduce the permission gap.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

alter default privileges in schema public
  grant usage, select on sequences to authenticated;
