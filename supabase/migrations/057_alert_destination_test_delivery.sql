-- =============================================================================
-- 057_alert_destination_test_delivery.sql
-- QUO-11: last-attempt health for alert destinations, plus a rate limit for
-- user-triggered test deliveries.
-- =============================================================================
--
-- Two changes, one feature.
--
-- 1. `last_error` had no timestamp. The settings page could say a destination
--    failed but never when, so an error from a week ago read exactly like one
--    from the last poll. `last_sent_at` cannot fill the gap: it only moves on
--    success, which is the case where there is no error to date.
--    `last_attempt_at` moves on every attempt, poll or test.
--
-- 2. The Settings "Send test" button turns a signed-in session into an
--    on-demand outbound-HTTPS primitive. It has to be capped.
--
--    The counter cannot live on `alert_destinations`: `authenticated` holds
--    table-wide UPDATE there (036 granted it; 052 column-scoped only `users`
--    and `api_tokens`), so a user could PATCH their own counter back to zero
--    through PostgREST and test without limit. It lives on `public.users`
--    instead, whose UPDATE grant 052 narrowed to
--    (notify_mode, view_mode, onboarded_at). Both columns below sit outside
--    that list, so the SECURITY DEFINER function is the only way to move them.
--
--    The limits are constants inside the function, not parameters. `authenticated`
--    executes this one directly (unlike consume_api_rate_limit_v2, which only
--    service_role may call), and a caller-supplied `p_limit` on a function the
--    caller is trying to evade is not a limit.
-- =============================================================================

alter table public.alert_destinations
  add column if not exists last_attempt_at timestamptz;

alter table public.users
  add column if not exists test_delivery_window_start timestamptz not null default now(),
  add column if not exists test_delivery_count integer not null default 0;

-- Fixed-window counter, same shape as consume_api_rate_limit_v2 (042): one
-- UPDATE both resets the window and increments the count. Every SET expression
-- is evaluated against the pre-update row, so both CASEs read the same old
-- window start, and row-level write locking serializes concurrent calls on the
-- same user - they cannot race past the limit.
--
-- The subject is auth.uid(), not a parameter. On a SECURITY DEFINER function
-- granted to `authenticated`, a caller-supplied user id would let anyone burn
-- anyone else's budget.
create or replace function public.consume_test_delivery_rate_limit()
returns table (allowed boolean, reset_seconds int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- 10 test sends per 5 minutes: room to iterate on a webhook receiver without
  -- leaving a usable request amplifier behind.
  c_limit constant int := 10;
  c_window_seconds constant int := 300;
  v_user uuid := (select auth.uid());
  v_count int;
  v_window_start timestamptz;
begin
  if v_user is null then
    return query select false, c_window_seconds; -- no session: deny
    return;
  end if;

  update public.users
  set
    test_delivery_window_start = case
      when now() - test_delivery_window_start >= make_interval(secs => c_window_seconds)
        then now() else test_delivery_window_start end,
    test_delivery_count = case
      when now() - test_delivery_window_start >= make_interval(secs => c_window_seconds)
        then 1 else test_delivery_count + 1 end
  where id = v_user
  returning test_delivery_count, test_delivery_window_start
  into v_count, v_window_start;

  if v_count is null then
    return query select false, c_window_seconds; -- no profile row: deny
    return;
  end if;

  return query select
    v_count <= c_limit,
    least(
      greatest(
        ceil(
          c_window_seconds - extract(epoch from (now() - v_window_start))
        )::int,
        0
      ),
      c_window_seconds
    );
end;
$$;

-- Functions default EXECUTE to public, so strip that off explicitly before
-- granting the roles that should hold it. `authenticated` is the real caller
-- (the settings action runs on the user's session); service_role keeps it for
-- parity with the other limiter.
revoke execute on function public.consume_test_delivery_rate_limit()
  from public, anon;
grant execute on function public.consume_test_delivery_rate_limit()
  to authenticated, service_role;
