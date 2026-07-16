alter table public.connections
  add column if not exists create_request_id uuid;

create unique index if not exists idx_connections_user_create_request
  on public.connections (user_id, create_request_id)
  where create_request_id is not null;

create or replace function public.create_connection_with_balances(
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
  v_user_id uuid;
  v_connection_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_create_request_id is null then
    raise exception 'Create request ID is required' using errcode = '22004';
  end if;

  insert into public.connections (
    user_id, tool_id, connection_type, encrypted_key, key_hint, name, tags,
    status, alert_enabled, watched_credit_types, create_request_id
  ) values (
    v_user_id, p_tool_id, 'api', p_encrypted_key, p_key_hint, p_name, p_tags,
    'active', true, p_watched_credit_types, p_create_request_id
  )
  on conflict (user_id, create_request_id)
    where create_request_id is not null
    do nothing
  returning id into v_connection_id;

  if v_connection_id is null then
    select id
      into v_connection_id
      from public.connections
      where user_id = v_user_id
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

revoke execute on function public.create_connection_with_balances(
  text, text, text, text, text[], text[], jsonb, uuid
) from public, anon, service_role;

grant execute on function public.create_connection_with_balances(
  text, text, text, text, text[], text[], jsonb, uuid
) to authenticated;
