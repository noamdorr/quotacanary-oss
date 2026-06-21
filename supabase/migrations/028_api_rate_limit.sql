-- =============================================================================
-- 028_api_rate_limit.sql
-- Per-token fixed-window rate limiter for the public REST API and MCP server.
-- No Redis is available, so the window state lives on each api_tokens row and
-- the reset-or-increment happens inside one atomic UPDATE (below).
-- =============================================================================

alter table public.api_tokens
  add column if not exists rl_window_start timestamptz not null default now();

alter table public.api_tokens
  add column if not exists rl_count int not null default 0;

-- Fixed-window counter. A single UPDATE both resets the window (when the
-- current one has elapsed) and increments the count, so concurrent requests on
-- the same token cannot race past the limit: every SET expression is evaluated
-- against the pre-update row, so both CASEs read the same old rl_window_start
-- and stay consistent. Row-level write locking serializes the increments.
-- Returns true while the post-update count is within p_limit; an unknown token
-- (no row updated) is denied.
create or replace function public.consume_api_rate_limit(
  p_token_id uuid,
  p_limit int,
  p_window_seconds int
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
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
  returning rl_count into v_count;

  if v_count is null then
    return false; -- unknown token: deny
  end if;
  return v_count <= p_limit;
end;
$$;
