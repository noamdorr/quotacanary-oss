-- =============================================================================
-- 038_prune_balances.sql
-- Retention for the balances table, which otherwise grows unbounded
-- (~96 rows/day/pool at the 15-minute poll cadence).
--
-- prune_balances() deletes readings older than `retention_days`, but always
-- keeps the newest `keep_per_pool` rows of each (connection_id, credit_type)
-- pool. The keep-newest guard matters for stale/errored connections: a pure
-- date cutoff would eventually delete their last known readings and make
-- their pools vanish from the dashboard.
--
-- Called by the poll route (service role) after each run. The window scan is
-- a full-table pass, which stays cheap because retention itself caps the
-- table; no extra index is worth the per-insert cost.
-- =============================================================================

create or replace function public.prune_balances(
  retention_days integer default 90,
  keep_per_pool integer default 50
) returns integer
language plpgsql
as $$
declare
  deleted integer;
begin
  delete from public.balances b
  where b.recorded_at < now() - make_interval(days => retention_days)
    and b.id in (
      select ranked.id
      from (
        select
          id,
          row_number() over (
            partition by connection_id, credit_type
            order by recorded_at desc
          ) as rn
        from public.balances
      ) ranked
      where ranked.rn > keep_per_pool
    );
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

-- Ops-only function: the poll route calls it with the service role. Functions
-- default EXECUTE to public, so strip that off explicitly - and grant
-- service_role directly, because on a fresh install (no platform default
-- privileges) the revoke would otherwise leave it with no execute path.
revoke execute on function public.prune_balances(integer, integer)
  from public, anon, authenticated;
grant execute on function public.prune_balances(integer, integer)
  to service_role;
