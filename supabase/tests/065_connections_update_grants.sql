-- QUO-80: real role/statement checks. Everything rolls back.
begin;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select id, 'authenticated', 'authenticated', email, '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
from (values
  ('00000000-0000-4000-8000-000000000080'::uuid, 'grant-065-owner@example.test'),
  ('00000000-0000-4000-8000-000000000081'::uuid, 'grant-065-other@example.test')
) as fixtures(id, email);

insert into public.connections (id, user_id, tool_id, connection_type, name, encrypted_key)
values
  ('00000000-0000-4000-8000-000000000180',
   '00000000-0000-4000-8000-000000000080', 'hunter', 'api', 'Owner', 'fixture-key'),
  ('00000000-0000-4000-8000-000000000181',
   '00000000-0000-4000-8000-000000000081', 'hunter', 'api', 'Other', 'fixture-key');

-- Capture the whole table's columns before switching roles. New fields should
-- default to denied; do not let information_schema hide inaccessible columns.
create temporary table connection_columns as
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'connections';
grant select on connection_columns to authenticated;

do $$
declare v_role text; v_privilege text;
begin
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    foreach v_privilege in array array['SELECT', 'INSERT', 'DELETE'] loop
      if not has_table_privilege(v_role, 'public.connections', v_privilege) then
        raise exception '% lost %', v_role, v_privilege;
      end if;
    end loop;
  end loop;
  foreach v_role in array array['anon', 'service_role'] loop
    if not has_table_privilege(v_role, 'public.connections', 'UPDATE') then
      raise exception '% lost UPDATE', v_role;
    end if;
  end loop;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000080', true);
do $$
declare
  v_own uuid := '00000000-0000-4000-8000-000000000180';
  v_other uuid := '00000000-0000-4000-8000-000000000181';
  v_column text;
  v_rows integer;
  v_allowed text[] := array['name', 'updated_at', 'alert_enabled', 'low_threshold',
    'alert_threshold', 'pool_thresholds', 'status', 'last_error', 'consecutive_failures'];
begin
  for v_column in select column_name from connection_columns loop
    if v_column = any(v_allowed) then
      if not has_column_privilege('authenticated', 'public.connections', v_column, 'UPDATE') then
        raise exception 'missing allowed column %', v_column;
      end if;
    else
      -- No-op writes cannot be rejected by data constraints in place of grants.
      begin
        execute format('update public.connections set %I = %I where id = $1',
          v_column, v_column) using v_own;
        raise exception 'authenticated could update protected column %', v_column;
      exception when insufficient_privilege then null;
      end;
    end if;
  end loop;

  update public.connections set name = 'Renamed', updated_at = now() where id = v_own;
  update public.connections set alert_enabled = false, updated_at = now() where id = v_own;
  update public.connections set low_threshold = 100, alert_threshold = 10,
    updated_at = now() where id = v_own;
  update public.connections set pool_thresholds = '{"credits":{"low":200,"critical":20}}',
    updated_at = now() where id = v_own;
  -- Both branches of the authenticated manual-refresh helper must keep working.
  update public.connections set status = 'error', last_error = 'adapter failure',
    consecutive_failures = 1, updated_at = now() where id = v_own;
  if not exists (select 1 from public.connections where id = v_own
    and status = 'error' and last_error = 'adapter failure' and consecutive_failures = 1) then
    raise exception 'manual-refresh failure health did not persist';
  end if;
  update public.connections set status = 'active', last_error = null,
    consecutive_failures = 0, updated_at = now() where id = v_own;
  if not exists (select 1 from public.connections where id = v_own
    and name = 'Renamed' and alert_enabled = false and low_threshold = 100
    and alert_threshold = 10 and pool_thresholds = '{"credits":{"low":200,"critical":20}}'
    and status = 'active' and last_error is null and consecutive_failures = 0) then
    raise exception 'allowed writes did not persist';
  end if;

  update public.connections set name = 'Stolen' where id = v_other;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'updated another user''s row'; end if;
  insert into public.connections (user_id, tool_id, connection_type, name)
    values ('00000000-0000-4000-8000-000000000080', 'hunter', 'api', 'Disposable');
  delete from public.connections where name = 'Disposable';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'own-row create/delete broke'; end if;
end;
$$;

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$
declare v_rows integer;
begin
  update public.connections set name = 'Anon';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'anon bypassed RLS'; end if;
end;
$$;

set local role service_role;
do $$
begin
  update public.connections set encrypted_key = 'server-encrypted-key', key_hint = '-key',
    status = 'active', last_error = null, updated_at = now()
    where id = '00000000-0000-4000-8000-000000000180'
      and user_id = '00000000-0000-4000-8000-000000000080' and tool_id = 'hunter';
  update public.connections set notified_level = 'critical',
    notified_levels = '{"credits":"critical"}', alert_fired_at = now()
    where id = '00000000-0000-4000-8000-000000000180';
  if not exists (select 1 from public.connections
    where id = '00000000-0000-4000-8000-000000000180'
      and encrypted_key = 'server-encrypted-key' and key_hint = '-key'
      and notified_level = 'critical' and notified_levels = '{"credits":"critical"}'
      and alert_fired_at is not null) then
    raise exception 'server key/alert writes broke';
  end if;
end;
$$;
rollback;
