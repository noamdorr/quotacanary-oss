-- =============================================================================
-- 003_balances_insert_policy.sql
-- Original 001 enabled RLS on public.balances but defined only a SELECT policy.
-- That blocked the user-context balance write in connectTool (and later manual
-- refresh), surfacing as "Connected, but couldn't record the balance."
--
-- Add the matching INSERT policy: a user may insert balance rows for a
-- connection they own (mirrors "balances: select via own connection").
-- The background poll route uses the service-role client and bypasses RLS,
-- so it is unaffected either way.
--
-- Idempotent.
-- =============================================================================

drop policy if exists "balances: insert via own connection" on public.balances;
create policy "balances: insert via own connection"
  on public.balances for insert
  with check (
    exists (
      select 1 from public.connections c
      where c.id = connection_id
        and (select auth.uid()) = c.user_id
    )
  );
