-- =============================================================================
-- 070_api_write_scope.sql
-- QUO-187: a `write` scope on personal access tokens, and a service-role path
-- to create a connection for a token's owner.
--
-- Part 1. create_api_token (051) always inserted the column default `{read}`
-- and had no scopes parameter. The replacement takes `p_scopes` and validates
-- it inside the function, so nothing outside the read/write vocabulary can be
-- stored however the caller is built. The signature changes, so the 4-argument
-- function is dropped rather than left as an overload: PostgREST resolves RPC
-- overloads by parameter names, and two live versions would only invite drift.
-- Rollout: apply this BEFORE deploying the app that sends p_scopes; the old
-- function cannot accept it (PGRST202), and token creation fails until this
-- lands. Same coupling as 051.
--
-- Part 2. create_connection_with_balances (046) derives the owner from
-- auth.uid(), which the API has no session for: `POST /api/v1/connections`
-- authenticates with a bearer token and runs as service_role. This variant
-- takes the owner explicitly and is executable by service_role only, so a
-- signed-in user can never pass someone else's id. The route already checked
-- the token and its write scope before calling it. The web connect flow keeps
-- calling the 046 function unchanged.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Part 1: token scopes
-- ---------------------------------------------------------------------------

drop function if exists public.create_api_token(text, text, text, integer);

create or replace function public.create_api_token(
  p_name text,
  p_token_hash text,
  p_token_hint text,
  p_max_active integer,
  p_scopes text[]
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

  -- The vocabulary is read and write, nothing else, and never empty: a token
  -- with no scopes is useless and a token with an unknown one is a bug.
  if p_scopes is null
     or cardinality(p_scopes) = 0
     or not (p_scopes <@ array['read', 'write']::text[]) then
    raise exception 'Unknown token scope' using errcode = '22023';
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

  insert into public.api_tokens (user_id, name, token_hash, token_hint, scopes)
  values (v_user_id, p_name, p_token_hash, p_token_hint, p_scopes)
  returning id into v_token_id;

  return v_token_id;
end;
$$;

revoke execute on function public.create_api_token(
  text, text, text, integer, text[]
) from public, anon, service_role;

grant execute on function public.create_api_token(
  text, text, text, integer, text[]
) to authenticated;

-- ---------------------------------------------------------------------------
-- Part 2: connection creation for an explicit owner (service role only)
-- ---------------------------------------------------------------------------

create or replace function public.create_connection_with_balances_for_user(
  p_user_id uuid,
  p_tool_id text,
  p_encrypted_key text,
  p_key_hint text,
  p_name text,
  p_tags text[],
  p_watched_credit_types text[],
  p_balances jsonb,
  p_create_request_id uuid
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_connection_id uuid;
begin
  if p_user_id is null then
    raise exception 'User ID is required' using errcode = '22004';
  end if;

  if p_create_request_id is null then
    raise exception 'Create request ID is required' using errcode = '22004';
  end if;

  insert into public.connections (
    user_id, tool_id, connection_type, encrypted_key, key_hint, name, tags,
    status, alert_enabled, watched_credit_types, create_request_id
  ) values (
    p_user_id, p_tool_id, 'api', p_encrypted_key, p_key_hint, p_name, p_tags,
    'active', true, p_watched_credit_types, p_create_request_id
  )
  on conflict (user_id, create_request_id)
    where create_request_id is not null
    do nothing
  returning id into v_connection_id;

  -- A retried request id returns the connection it already created, exactly
  -- as the 046 function does for the web flow.
  if v_connection_id is null then
    select id
      into v_connection_id
      from public.connections
      where user_id = p_user_id
        and create_request_id = p_create_request_id;
    return v_connection_id;
  end if;

  insert into public.balances (
    connection_id, credit_type, label, balance, balance_limit, unit
  )
  select
    v_connection_id,
    entry.credit_type,
    entry.label,
    entry.balance,
    entry.balance_limit,
    entry.unit
  from jsonb_to_recordset(p_balances) as entry(
    credit_type text,
    label text,
    balance numeric,
    balance_limit numeric,
    unit text
  );

  return v_connection_id;
end;
$$;

revoke execute on function public.create_connection_with_balances_for_user(
  uuid, text, text, text, text, text[], text[], jsonb, uuid
) from public, anon, authenticated;

grant execute on function public.create_connection_with_balances_for_user(
  uuid, text, text, text, text, text[], text[], jsonb, uuid
) to service_role;
