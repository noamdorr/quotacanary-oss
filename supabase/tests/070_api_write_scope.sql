-- QUO-187: scope validation inside create_api_token (070) and the
-- service-role-only create_connection_with_balances_for_user.
begin;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-4000-8000-000000000070',
  'authenticated',
  'authenticated',
  'api-write-scope-test@example.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

-- Part 1: as a signed-in user, scopes are validated and stored.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000070',
  true
);

do $$
declare
  v_user_id uuid := '00000000-0000-4000-8000-000000000070';
  v_token_id uuid;
begin
  begin
    perform public.create_api_token('Bad scope', 'hash-s1', 'sc01', 10, '{admin}');
    raise exception 'expected an unknown scope to be rejected';
  exception
    when SQLSTATE '22023' then null;
  end;

  begin
    perform public.create_api_token('Empty scope', 'hash-s2', 'sc02', 10, '{}');
    raise exception 'expected an empty scope list to be rejected';
  exception
    when SQLSTATE '22023' then null;
  end;

  begin
    perform public.create_api_token('Null scope', 'hash-s3', 'sc03', 10, null);
    raise exception 'expected a null scope list to be rejected';
  exception
    when SQLSTATE '22023' then null;
  end;

  if (select count(*) from public.api_tokens where user_id = v_user_id) <> 0 then
    raise exception 'a rejected scope still inserted a token';
  end if;

  select public.create_api_token('Read', 'hash-s4', 'sc04', 10, '{read}')
    into v_token_id;
  if (select scopes from public.api_tokens where id = v_token_id) <> '{read}' then
    raise exception 'read token did not store {read}';
  end if;

  select public.create_api_token('Write', 'hash-s5', 'sc05', 10, '{read,write}')
    into v_token_id;
  if (select scopes from public.api_tokens where id = v_token_id) <> '{read,write}' then
    raise exception 'write token did not store {read,write}';
  end if;

  -- The explicit-owner insert is not for signed-in users: a session could
  -- otherwise pass someone else's id.
  begin
    perform public.create_connection_with_balances_for_user(
      v_user_id, 'hunter', 'ciphertext', 'last4', 'Should be refused', '{}', null,
      '[]'::jsonb, '00000000-0000-4000-8000-000000000071'
    );
    raise exception 'expected authenticated to lack execute on the for_user insert';
  exception
    when SQLSTATE '42501' then null;
  end;
end;
$$;

-- Part 2: as the service role (the API routes), the owner is explicit.
reset role;
set local role service_role;

do $$
declare
  v_user_id uuid := '00000000-0000-4000-8000-000000000070';
  v_first_id uuid;
  v_retry_id uuid;
begin
  begin
    perform public.create_connection_with_balances_for_user(
      null, 'hunter', 'ciphertext', 'last4', 'No owner', '{}', null,
      '[]'::jsonb, '00000000-0000-4000-8000-000000000072'
    );
    raise exception 'expected a null user id to be rejected';
  exception
    when SQLSTATE '22004' then null;
  end;

  begin
    perform public.create_connection_with_balances_for_user(
      v_user_id, 'hunter', 'ciphertext', 'last4', 'No request id', '{}', null,
      '[]'::jsonb, null
    );
    raise exception 'expected a null request id to be rejected';
  exception
    when SQLSTATE '22004' then null;
  end;

  select public.create_connection_with_balances_for_user(
    v_user_id, 'hunter', 'ciphertext', 'last4', 'Moved from the Mac', '{}', null,
    '[{"credit_type":"credits","label":"Credits","balance":42,"balance_limit":100,"unit":"credits"}]'::jsonb,
    '00000000-0000-4000-8000-000000000073'
  ) into v_first_id;

  select public.create_connection_with_balances_for_user(
    v_user_id, 'hunter', 'ciphertext', 'last4', 'Moved from the Mac', '{}', null,
    '[{"credit_type":"credits","label":"Credits","balance":42,"balance_limit":100,"unit":"credits"}]'::jsonb,
    '00000000-0000-4000-8000-000000000073'
  ) into v_retry_id;

  if v_first_id is distinct from v_retry_id then
    raise exception 'same request ID returned different connection IDs';
  end if;

  if (
    select count(*) from public.connections
    where id = v_first_id and user_id = v_user_id and alert_enabled
  ) <> 1 then
    raise exception 'the explicit-owner insert did not store one row for that owner';
  end if;

  if (select count(*) from public.balances where connection_id = v_first_id) <> 1 then
    raise exception 'retry created more than one initial balance row';
  end if;
end;
$$;

rollback;
