-- Confirms 045's EXECUTE revoke actually blocks anon and authenticated at the
-- database, not just in the migration's source text. consume_api_rate_limit
-- takes p_token_id as a plain argument (not from the JWT), and Postgres
-- checks EXECUTE privilege before the function body ever runs, so no user
-- setup is needed - a bogus token ID is enough to prove the grant.
begin;

set local role anon;

do $$
begin
  perform public.consume_api_rate_limit(
    '00000000-0000-4000-8000-000000000045', 60, 60
  );
  raise exception 'anon was able to execute the legacy rate-limit RPC';
exception
  when insufficient_privilege then null;
end;
$$;

reset role;
set local role authenticated;

do $$
begin
  perform public.consume_api_rate_limit(
    '00000000-0000-4000-8000-000000000045', 60, 60
  );
  raise exception 'authenticated was able to execute the legacy rate-limit RPC';
exception
  when insufficient_privilege then null;
end;
$$;

rollback;
