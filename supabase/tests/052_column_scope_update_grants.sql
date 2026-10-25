-- Confirms 052's column-scoped grants actually hold at the database: a
-- signed-in user can still write the columns the app owns, but not the
-- columns the server owns - and revocation only works through the
-- ownership-checking RPC, not a direct UPDATE.
--
-- User/token IDs use the 054/055 range, not 052/053: 052 is already claimed
-- by 051_atomic_api_token_creation_concurrent.sh's (non-transactional) test
-- user, and this file's own transaction rolls back anyway.
begin;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-4000-8000-000000000054',
  'authenticated',
  'authenticated',
  'column-scope-grants-test@example.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

insert into public.api_tokens (id, user_id, token_hash, token_hint, name)
values (
  '00000000-0000-4000-8000-000000000055',
  '00000000-0000-4000-8000-000000000054',
  'hash-052-test',
  'z52t',
  'Column-scope grants test token'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000054',
  true
);

do $$
declare
  v_user_id uuid := '00000000-0000-4000-8000-000000000054';
  v_token_id uuid := '00000000-0000-4000-8000-000000000055';
begin
  -- Server-managed columns on users stay out of reach.
  begin
    update public.users set email = 'attacker@evil.test' where id = v_user_id;
    raise exception 'authenticated was able to rewrite users.email directly';
  exception
    when insufficient_privilege then null;
  end;

  begin
    update public.users set plan = 'team' where id = v_user_id;
    raise exception 'authenticated was able to rewrite users.plan directly';
  exception
    when insufficient_privilege then null;
  end;

  -- Every column the app actually writes from a user session stays
  -- writable - each checked individually, since a regrant that dropped just
  -- one of the three would otherwise pass unnoticed.
  update public.users set notify_mode = 'off' where id = v_user_id;
  if (select notify_mode from public.users where id = v_user_id) <> 'off' then
    raise exception 'the regranted notify_mode column did not accept a write';
  end if;

  update public.users set view_mode = 'cards' where id = v_user_id;
  if (select view_mode from public.users where id = v_user_id) <> 'cards' then
    raise exception 'the regranted view_mode column did not accept a write';
  end if;

  update public.users set onboarded_at = now() where id = v_user_id;
  if (select onboarded_at from public.users where id = v_user_id) is null then
    raise exception 'the regranted onboarded_at column did not accept a write';
  end if;

  -- Nothing on api_tokens is user-writable by direct UPDATE - not even the
  -- caller's own row.
  begin
    update public.api_tokens set revoked_at = now() where id = v_token_id;
    raise exception 'authenticated was able to revoke a token via direct UPDATE';
  exception
    when insufficient_privilege then null;
  end;

  begin
    update public.api_tokens set rl_count = 0 where id = v_token_id;
    raise exception 'authenticated was able to reset its own rate-limit counter';
  exception
    when insufficient_privilege then null;
  end;

  -- Revocation still works - through the definer RPC, which bypasses the
  -- column grant entirely and re-checks ownership itself.
  perform public.revoke_api_token(v_token_id);
  if (select revoked_at from public.api_tokens where id = v_token_id) is null then
    raise exception 'revoke_api_token did not revoke the caller''s own token';
  end if;
end;
$$;

rollback;
