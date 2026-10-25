begin;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-4000-8000-000000000046',
  'authenticated',
  'authenticated',
  'atomic-connection-test@example.test',
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
  '00000000-0000-4000-8000-000000000046',
  true
);

do $$
declare
  v_user_id uuid := '00000000-0000-4000-8000-000000000046';
  v_first_id uuid;
  v_retry_id uuid;
begin
  begin
    perform public.create_connection_with_balances(
      'hunter',
      'ciphertext',
      'last4',
      'Null request ID must be rejected',
      '{}',
      null,
      '[{"credit_type":"credits","label":"Credits","balance":42,"balance_limit":100,"unit":"credits"}]'::jsonb,
      null
    );
    raise exception 'expected null p_create_request_id rejection';
  exception
    when SQLSTATE '22004' then null;
  end;

  if exists (
    select 1 from public.connections
    where user_id = v_user_id
      and name = 'Null request ID must be rejected'
      and create_request_id is null
  ) then
    raise exception 'null request ID left a connection behind';
  end if;

  begin
    perform public.create_connection_with_balances(
      'hunter',
      'ciphertext',
      'last4',
      'Broken initial balance',
      '{}',
      null,
      '[{"credit_type":"credits","label":null,"balance":42,"balance_limit":100,"unit":"credits"}]'::jsonb,
      '00000000-0000-4000-8000-000000000047'
    );
    raise exception 'expected the invalid balance label to abort the RPC';
  exception
    when not_null_violation then null;
  end;

  if exists (
    select 1 from public.connections
    where user_id = v_user_id
      and create_request_id = '00000000-0000-4000-8000-000000000047'
  ) then
    raise exception 'failed balance write left a connection behind';
  end if;

  select public.create_connection_with_balances(
    'hunter',
    'ciphertext',
    'last4',
    'Retry-safe connection',
    '{}',
    null,
    '[{"credit_type":"credits","label":"Credits","balance":42,"balance_limit":100,"unit":"credits"}]'::jsonb,
    '00000000-0000-4000-8000-000000000048'
  ) into v_first_id;

  select public.create_connection_with_balances(
    'hunter',
    'ciphertext',
    'last4',
    'Retry-safe connection',
    '{}',
    null,
    '[{"credit_type":"credits","label":"Credits","balance":42,"balance_limit":100,"unit":"credits"}]'::jsonb,
    '00000000-0000-4000-8000-000000000048'
  ) into v_retry_id;

  if v_first_id is distinct from v_retry_id then
    raise exception 'same request ID returned different connection IDs';
  end if;

  if (select count(*) from public.connections where id = v_first_id) <> 1 then
    raise exception 'retry created more than one connection';
  end if;

  if (select count(*) from public.balances where connection_id = v_first_id) <> 1 then
    raise exception 'retry created more than one initial balance row';
  end if;

  if (select alert_enabled from public.connections where id = v_first_id) is distinct from true then
    raise exception 'new API connection did not enable alerts by default';
  end if;
end;
$$;

rollback;
