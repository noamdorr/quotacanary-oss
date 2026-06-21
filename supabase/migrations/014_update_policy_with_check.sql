-- =============================================================================
-- 014_update_policy_with_check.sql
-- Defense-in-depth: add WITH CHECK to UPDATE RLS policies
-- =============================================================================
--
-- For an UPDATE, Postgres uses the USING clause to decide which existing rows
-- a user may target, and the WITH CHECK clause to validate the NEW row values
-- after the update. Two UPDATE policies from 001_initial_schema.sql have a
-- USING clause but NO WITH CHECK:
--
--   - "users: update own row"  on public.users        (using (auth.uid()) = id)
--   - "connections: update own" on public.connections (using (auth.uid()) = user_id)
--
-- Without WITH CHECK, the NEW row values are not re-validated. Today the
-- ownership column is not user-writable in practice, but a future column or
-- policy edit could open a write path that lets a row be updated into another
-- user's ownership (e.g. reassigning user_id / id). Adding WITH CHECK that
-- mirrors the existing USING expression closes that latent footgun.
--
-- Uses the project convention of the cached subquery `(select auth.uid())`
-- (NOT bare auth.uid()) for the 94% RLS performance gain.
--
-- Backward-compatible: this only ADDS a WITH CHECK that mirrors the existing
-- USING ownership predicate. Any update a user can already perform on their own
-- row keeps the row's owner unchanged and therefore still passes. No existing,
-- legitimate write path is restricted; only cross-owner writes are blocked.
-- =============================================================================

alter policy "users: update own row"
  on public.users
  with check ((select auth.uid()) = id);

alter policy "connections: update own"
  on public.connections
  with check ((select auth.uid()) = user_id);
