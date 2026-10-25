-- Single-session proof of create_api_token's boundary behaviour under the
-- authenticated role. The concurrency property itself needs two sessions and
-- so cannot live inside this transaction; see
-- supabase/tests/051_atomic_api_token_creation_concurrent.sh for that.
-- Calls use the 070 signature (trailing p_scopes); scope validation itself
-- is proven in 070_api_write_scope.sql.
begin;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-4000-8000-000000000051',
  'authenticated',
  'authenticated',
  'atomic-api-token-test@example.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000051',
  true
);

do $$
declare
  v_user_id uuid := '00000000-0000-4000-8000-000000000051';
  v_token_id uuid;
  v_first_token_id uuid;
  v_capped uuid;
begin
  -- A nonsensical cap must abort, never wave the insert through.
  begin
    perform public.create_api_token('Bad cap', 'hash-bad', 'bad4', null, '{read}');
    raise exception 'expected a null cap to be rejected';
  exception
    when SQLSTATE '22023' then null;
  end;

  begin
    perform public.create_api_token('Zero cap', 'hash-zero', 'zer0', 0, '{read}');
    raise exception 'expected a zero cap to be rejected';
  exception
    when SQLSTATE '22023' then null;
  end;

  if (select count(*) from public.api_tokens where user_id = v_user_id) <> 0 then
    raise exception 'a rejected cap still inserted a token';
  end if;

  -- Under the cap: inserts and returns the new row's ID.
  select public.create_api_token('First key', 'hash-1', 'key1', 2, '{read}')
    into v_token_id;
  v_first_token_id := v_token_id;

  if v_token_id is null then
    raise exception 'creation under the cap returned no token ID';
  end if;

  if (
    select count(*) from public.api_tokens
    where id = v_token_id and user_id = v_user_id and revoked_at is null
  ) <> 1 then
    raise exception 'creation under the cap did not store exactly one token';
  end if;

  select public.create_api_token('Second key', 'hash-2', 'key2', 2, '{read}')
    into v_token_id;

  if v_token_id is null then
    raise exception 'the second creation under the cap was refused';
  end if;

  -- At the cap: returns null and inserts nothing.
  select public.create_api_token('Third key', 'hash-3', 'key3', 2, '{read}')
    into v_capped;

  if v_capped is not null then
    raise exception 'creation at the cap returned a token ID';
  end if;

  if (
    select count(*) from public.api_tokens
    where user_id = v_user_id and revoked_at is null
  ) <> 2 then
    raise exception 'creation at the cap still inserted a token';
  end if;

  -- Revoking frees a slot: the cap counts active tokens, not lifetime ones.
  -- Goes through the RPC (052 revoked the direct-UPDATE path this used to
  -- take) so this also proves revoke_api_token is what actually frees it.
  perform public.revoke_api_token(v_first_token_id);

  select public.create_api_token('Replacement key', 'hash-4', 'key4', 2, '{read}')
    into v_token_id;

  if v_token_id is null then
    raise exception 'a revoked token did not free a slot under the cap';
  end if;
end;
$$;

rollback;
