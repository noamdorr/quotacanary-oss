-- =============================================================================
-- 047_pool_history_sampled.sql
-- Time-sampled balance history for burn-rate math and sparklines.
--
-- The dashboard previously read the newest 30 raw readings per pool. At the
-- 15-minute poll cadence that is a ~7.5-hour window, so any burn older than
-- that vanished and pools showed "no burn yet" despite a clear balance drop.
--
-- pool_history_sampled() returns, per (connection_id, credit_type) pool:
--   * the newest reading in each `p_bucket_minutes` bucket over the last
--     `p_window_days` days (default: 6-hour buckets over 7 days, <= 29 rows), and
--   * always the newest reading overall, even when it is older than the
--     window - without it, stale/errored connections would vanish from the
--     dashboard (same guard as prune_balances keep_per_pool).
--
-- Rows come back newest-first per connection so the client can group them
-- exactly like the old embedded select. SECURITY INVOKER: RLS still applies
-- for authenticated callers; the explicit p_user_id filter scopes service-role
-- callers (API/MCP), which bypass RLS.
-- =============================================================================

create or replace function public.pool_history_sampled(
  p_user_id uuid,
  p_window_days integer default 7,
  p_bucket_minutes integer default 360
) returns table (
  connection_id uuid,
  credit_type text,
  label text,
  unit text,
  balance numeric,
  balance_limit numeric,
  recorded_at timestamptz
)
language sql
stable
as $$
  with ranked as (
    select
      b.connection_id,
      b.credit_type,
      b.label,
      b.unit,
      b.balance,
      b.balance_limit,
      b.recorded_at,
      row_number() over (
        partition by
          b.connection_id,
          b.credit_type,
          date_bin(
            make_interval(mins => p_bucket_minutes),
            b.recorded_at,
            timestamptz 'epoch'
          )
        order by b.recorded_at desc
      ) as rn_bucket,
      row_number() over (
        partition by b.connection_id, b.credit_type
        order by b.recorded_at desc
      ) as rn_pool
    from public.balances b
    join public.connections c on c.id = b.connection_id
    where c.user_id = p_user_id
  )
  select
    connection_id,
    credit_type,
    label,
    unit,
    balance,
    balance_limit,
    recorded_at
  from ranked
  where rn_pool = 1
     or (
       rn_bucket = 1
       and recorded_at >= now() - make_interval(days => p_window_days)
     )
  order by connection_id, recorded_at desc;
$$;

-- Callers: the dashboard/alerts pages (authenticated, RLS applies) and the
-- API/MCP routes (service role). Functions default EXECUTE to public, so
-- strip that off; grant the two real callers explicitly (fresh installs have
-- no platform default privileges - see 038/039).
revoke execute on function public.pool_history_sampled(uuid, integer, integer)
  from public, anon;
grant execute on function public.pool_history_sampled(uuid, integer, integer)
  to authenticated, service_role;
