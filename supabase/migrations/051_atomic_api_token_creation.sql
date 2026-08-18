-- QUO-67: make the per-user active-token cap atomic.
--
-- QUO-62 enforced the cap in the server action as a count-then-insert: two
-- round-trips with nothing serializing them, so a burst of concurrent creates
-- at (cap - 1) active tokens all read the same under-cap count and all insert.
-- This moves both halves into one function that holds a per-user lock across
-- them, mirroring 046's create_connection_with_balances.

create or replace function public.create_api_token(
  p_name text,
  p_token_hash text,
  p_token_hint text,
  p_max_active integer
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_token_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- Fail closed on a missing or nonsensical cap rather than inserting: a null
  -- comparison below would be null, not false, and would wave the insert
  -- through (same rule as QUO-62's rate-limiter misconfiguration path).
  if p_max_active is null or p_max_active < 1 then
    raise exception 'Active token cap must be a positive integer'
      using errcode = '22023';
  end if;

  -- Serialize concurrent creates for this user. The count below and the insert
  -- sit in different statement snapshots under READ COMMITTED, so without the
  -- lock a concurrent burst passes the check N times over. Transaction-scoped,
  -- so it releases on commit or rollback. Advisory keys are global: an
  -- occasional hash collision between two users only costs a brief wait.
  perform pg_advisory_xact_lock(
    hashtextextended('public.api_tokens:' || v_user_id::text, 0)
  );

  if (
    select count(*)
      from public.api_tokens
      where user_id = v_user_id
        and revoked_at is null
  ) >= p_max_active then
    -- Null, not an exception: "you are at the cap" is an expected answer the
    -- caller turns into a message, not a database failure.
    return null;
  end if;

  insert into public.api_tokens (user_id, name, token_hash, token_hint)
  values (v_user_id, p_name, p_token_hash, p_token_hint)
  returning id into v_token_id;

  return v_token_id;
end;
$$;

revoke execute on function public.create_api_token(
  text, text, text, integer
) from public, anon, service_role;

grant execute on function public.create_api_token(
  text, text, text, integer
) to authenticated;
