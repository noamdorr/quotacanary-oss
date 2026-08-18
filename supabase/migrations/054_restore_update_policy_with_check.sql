-- =============================================================================
-- 054_restore_update_policy_with_check.sql
-- Restore the WITH CHECK clauses 014 added, so prod matches the migrations again
-- =============================================================================
--
-- This is DRIFT CLEANUP, not a security fix. Prod is not exploitable without it.
-- Read the "why this is not a vulnerability" section before deciding it is urgent.
--
-- What drifted
-- ------------
-- 014_update_policy_with_check.sql added a WITH CHECK to the two UPDATE policies
-- that shipped with only a USING clause in 001_initial_schema.sql. A repo sweep on
-- 2026-08-09 found `supabase migration list` reports 014 applied on both local and
-- remote, while `supabase db dump --linked` shows prod's catalog with no WITH CHECK
-- on either policy:
--
--   CREATE POLICY "connections: update own" ON "public"."connections"
--     FOR UPDATE USING (((SELECT auth.uid()) = "user_id"));
--   CREATE POLICY "users: update own row" ON "public"."users"
--     FOR UPDATE USING (((SELECT auth.uid()) = "id"));
--
-- How prod lost the clause was not determined. A Dashboard edit that dropped and
-- recreated the policies is consistent with the evidence but unproven.
--
-- Why this is not a vulnerability
-- -------------------------------
-- The obvious reading is that a signed-in user could reassign a row they own to
-- someone else, since prod also carries a table-wide
-- `grant all on public.connections to authenticated` (036; 052 column-scoped
-- `users` and `api_tokens` but not `connections`). That reading was tested against
-- a from-zero local database on 2026-08-09 and is WRONG:
--
--   * With prod's exact policy set (UPDATE USING ownership, no WITH CHECK),
--     `update connections set user_id = <other user> where id = <own row>` fails
--     with "new row violates row-level security policy".
--   * Isolating the cause: with the UPDATE policy relaxed to USING (true) and no
--     WITH CHECK, the same statement is STILL rejected. Relaxing
--     "connections: select own" to USING (true) as well is what finally lets it
--     through.
--
-- So the SELECT policy is the control that actually blocks a cross-owner write:
-- Postgres applies SELECT policies to the NEW row on UPDATE, and the post-update
-- row would be owned by someone else. Postgres additionally falls back to the
-- USING expression as the WITH CHECK when the clause is absent, which points the
-- same way, though the probes above could not isolate that from the SELECT policy.
-- Either way the ownership write is closed in prod today.
--
-- Why apply it anyway
-- -------------------
-- Parity. While prod and the migrations disagree, `supabase db diff --linked`
-- reports these two policies on every run, and standing noise in a drift check is
-- how the next real drift gets skimmed past. Making the clause explicit also means
-- the protection no longer rests on a Postgres fallback and on a SELECT policy
-- staying exactly as it is.
--
-- Uses the project convention of the cached subquery `(select auth.uid())`
-- (NOT bare auth.uid()) for the RLS performance gain.
--
-- Backward-compatible: this only ADDS a WITH CHECK mirroring the existing USING
-- ownership predicate. Any update a user can already perform on their own row
-- leaves the owner unchanged and still passes. Verified from zero with
-- `supabase db reset`: renaming your own connection still succeeds.
-- =============================================================================

alter policy "users: update own row"
  on public.users
  with check ((select auth.uid()) = id);

alter policy "connections: update own"
  on public.connections
  with check ((select auth.uid()) = user_id);
