-- =============================================================================
-- 042_rate_limit_state.sql
-- v2 of the per-token fixed-window rate limiter (028). Same atomic
-- reset-or-increment UPDATE, but it also reports the remaining budget and the
-- seconds until the window resets, so API responses can carry accurate
-- RateLimit-* headers. The v1 function stays untouched: deployed code still
-- calls it during rollout.
-- =============================================================================

-- Fixed-window counter. A single UPDATE both resets the window (when the
-- current one has elapsed) and increments the count, so concurrent requests on
-- the same token cannot race past the limit: every SET expression is evaluated
-- against the pre-update row, so both CASEs read the same old rl_window_start
-- and stay consistent. Row-level write locking serializes the increments.
-- Returns one row: allowed while the post-update count is within p_limit,
-- remaining budget, and seconds until the current window ends. An unknown
-- token (no row updated) is denied with a full-window reset.
create or replace function public.consume_api_rate_limit_v2(
  p_token_id uuid,
  p_limit int,
  p_window_seconds int
) returns table (allowed boolean, remaining int, reset_seconds int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
  v_window_start timestamptz;
begin
  update public.api_tokens
  set
    rl_window_start = case
      when now() - rl_window_start >= make_interval(secs => p_window_seconds)
        then now() else rl_window_start end,
    rl_count = case
      when now() - rl_window_start >= make_interval(secs => p_window_seconds)
        then 1 else rl_count + 1 end
  where id = p_token_id
  returning rl_count, rl_window_start into v_count, v_window_start;

  if v_count is null then
    return query select false, 0, p_window_seconds; -- unknown token: deny
    return;
  end if;

  return query select
    v_count <= p_limit,
    greatest(p_limit - v_count, 0),
    least(
      greatest(
        ceil(
          p_window_seconds - extract(epoch from (now() - v_window_start))
        )::int,
        0
      ),
      p_window_seconds
    );
end;
$$;

-- Ops-only function: the API routes call it with the service role. Functions
-- default EXECUTE to public, so strip that off explicitly - and grant
-- service_role directly, because on a fresh install (no platform default
-- privileges) the revoke would otherwise leave it with no execute path.
revoke execute on function public.consume_api_rate_limit_v2(uuid, int, int)
  from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit_v2(uuid, int, int)
  to service_role;
