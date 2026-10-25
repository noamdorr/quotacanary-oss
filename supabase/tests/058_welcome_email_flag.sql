-- Single-session proof of mark_user_welcomed()'s boundary behaviour under
-- the authenticated role: first call flips welcomed_at and returns true, a
-- second call (simulating a re-clicked magic link) is a no-op and returns
-- false, and a direct client UPDATE of the column is rejected because 058
-- deliberately left it out of 052's column-scoped grant.
begin;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-4000-8000-000000000058',
  'authenticated',
  'authenticated',
  'welcome-flag-test@example.test',
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
  '00000000-0000-4000-8000-000000000058',
  true
);

do $$
declare
  v_user_id uuid := '00000000-0000-4000-8000-000000000058';
  v_first boolean;
  v_second boolean;
begin
  if (select welcomed_at from public.users where id = v_user_id) is not null then
    raise exception 'a freshly-created user already has welcomed_at set';
  end if;

  select public.mark_user_welcomed() into v_first;
  if v_first is not true then
    raise exception 'first call for a new user did not report a fresh send';
  end if;

  if (select welcomed_at from public.users where id = v_user_id) is null then
    raise exception 'first call did not persist welcomed_at';
  end if;

  -- Re-clicking the magic link, or a second confirm racing the first,
  -- must never report a second send.
  select public.mark_user_welcomed() into v_second;
  if v_second is not false then
    raise exception 'second call for an already-welcomed user reported a fresh send';
  end if;

  -- The column stays out of the plain UPDATE grant on purpose (see 058) -
  -- a signed-in user must not be able to reset their own flag.
  begin
    update public.users set welcomed_at = null where id = v_user_id;
    raise exception 'authenticated was able to UPDATE welcomed_at directly';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

rollback;
