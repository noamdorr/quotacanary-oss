-- QUO-82: exercise the grant as real database roles, not a migration text check.
-- Fixtures and writes roll back, so this can run beside the rest of the SQL suite.
begin;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select id, 'authenticated', 'authenticated', email, '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
from (values
  ('00000000-0000-4000-8000-000000000082'::uuid, 'grant-064-owner@example.test'),
  ('00000000-0000-4000-8000-000000000083'::uuid, 'grant-064-other@example.test')
) as fixtures(id, email);

insert into public.alert_destinations (
  id, user_id, kind, name, encrypted_url, url_hint,
  encrypted_signing_secret, signing_secret_set_at
) values
  ('00000000-0000-4000-8000-000000000182',
   '00000000-0000-4000-8000-000000000082', 'webhook', 'Owner',
   'fixture-url', 'hooks.example.test', 'fixture-secret', now()),
  ('00000000-0000-4000-8000-000000000183',
   '00000000-0000-4000-8000-000000000083', 'webhook', 'Other',
   'fixture-url', 'hooks.example.test', 'fixture-secret', now());

-- The revoke must not change any non-UPDATE grant, nor anon/service_role grants.
do $$
declare
  v_role text;
  v_privilege text;
begin
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    foreach v_privilege in array array[
      'SELECT', 'INSERT', 'DELETE'
    ] loop
      if not has_table_privilege(v_role, 'public.alert_destinations', v_privilege) then
        raise exception '% lost its % table grant', v_role, v_privilege;
      end if;
    end loop;
  end loop;
  foreach v_role in array array['anon', 'service_role'] loop
    if not has_table_privilege(v_role, 'public.alert_destinations', 'UPDATE') then
      raise exception '% lost its UPDATE table grant', v_role;
    end if;
  end loop;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000082', true);

do $$
declare
  v_own uuid := '00000000-0000-4000-8000-000000000182';
  v_other uuid := '00000000-0000-4000-8000-000000000183';
  v_column text;
  v_rows integer;
begin
  -- Test every excluded column with a no-op UPDATE: constraints cannot mask a
  -- missing revoke, and a table-wide grant would let all these statements run.
  foreach v_column in array array[
    'id', 'user_id', 'kind', 'name', 'encrypted_url', 'url_hint',
    'min_level', 'consecutive_failures', 'created_at'
  ] loop
    begin
      execute format('update public.alert_destinations set %I = %I where id = $1',
        v_column, v_column) using v_own;
      raise exception 'authenticated could update protected column %', v_column;
    exception when insufficient_privilege then null;
    end;
  end loop;

  -- The three application paths, including both successful and failed test health.
  update public.alert_destinations set is_enabled = false,
    updated_at = '2026-01-01T00:00:00Z' where id = v_own;
  update public.alert_destinations set encrypted_signing_secret = 'rotated-secret',
    signing_secret_set_at = '2026-01-02T00:00:00Z',
    updated_at = '2026-01-02T00:00:00Z' where id = v_own;
  update public.alert_destinations set last_attempt_at = '2026-01-03T00:00:00Z',
    last_error = 'test failure' where id = v_own;
  if (select last_error from public.alert_destinations where id = v_own) <> 'test failure' then
    raise exception 'failed test health did not persist';
  end if;
  update public.alert_destinations set last_attempt_at = '2026-01-04T00:00:00Z',
    last_sent_at = '2026-01-04T00:00:00Z', last_error = null where id = v_own;
  if not exists (
    select 1 from public.alert_destinations where id = v_own
      and is_enabled = false and encrypted_signing_secret = 'rotated-secret'
      and signing_secret_set_at = '2026-01-02T00:00:00Z'
      and updated_at = '2026-01-02T00:00:00Z'
      and last_attempt_at = '2026-01-04T00:00:00Z'
      and last_sent_at = '2026-01-04T00:00:00Z'
      and last_error is null and consecutive_failures = 0
  ) then
    raise exception 'allowed updates did not persist as expected';
  end if;

  -- Column permission does not bypass ownership, including user_id reassignment.
  update public.alert_destinations set is_enabled = false where id = v_other;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'updated another user''s destination'; end if;
  begin
    update public.alert_destinations
      set user_id = '00000000-0000-4000-8000-000000000083' where id = v_own;
    raise exception 'reassigned destination ownership';
  exception when insufficient_privilege then null;
  end;

  insert into public.alert_destinations (user_id, kind, name, encrypted_url, url_hint)
    values ('00000000-0000-4000-8000-000000000082', 'webhook', 'Disposable',
      'fixture-url', 'hooks.example.test');
  delete from public.alert_destinations where name = 'Disposable';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'own destination insert/delete broke'; end if;
end;
$$;

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$
declare v_rows integer;
begin
  update public.alert_destinations set is_enabled = true;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'anon bypassed destination RLS'; end if;
end;
$$;

set local role service_role;
do $$
begin
  -- The poller still writes health, including the now-protected failure streak.
  update public.alert_destinations set consecutive_failures = 3,
    last_attempt_at = now(), last_sent_at = now(), last_error = 'poll failure'
    where id = '00000000-0000-4000-8000-000000000183';
  if not exists (
    select 1 from public.alert_destinations
    where id = '00000000-0000-4000-8000-000000000183'
      and consecutive_failures = 3 and last_error = 'poll failure'
      and last_attempt_at is not null and last_sent_at is not null
  ) then
    raise exception 'service_role poller write broke';
  end if;
end;
$$;

rollback;
