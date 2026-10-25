-- Real role and stale-owner checks, isolated by rollback.
begin;
delete from public.poll_run_lease;

do $$
declare v_role text; v_rpc text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.poll_run_lease', 'SELECT,INSERT,UPDATE,DELETE') then
      raise exception '% has poll lease table privileges', v_role;
    end if;
    foreach v_rpc in array array['claim_poll_run(uuid)', 'renew_poll_run(uuid)', 'release_poll_run(uuid)'] loop
      if has_function_privilege(v_role, 'public.' || v_rpc, 'EXECUTE') then
        raise exception '% can execute %', v_role, v_rpc;
      end if;
    end loop;
  end loop;
end;
$$;

set local role service_role;
do $$
declare
  a uuid := '00000000-0000-4000-8000-000000000031';
  b uuid := '00000000-0000-4000-8000-000000000032';
  before_expiry timestamptz;
begin
  if not public.claim_poll_run(a) then raise exception 'initial claim failed'; end if;
  if public.claim_poll_run(b) then raise exception 'second owner claimed live lease'; end if;
  if public.renew_poll_run(b) then raise exception 'non-owner renewed'; end if;
  if public.release_poll_run(b) then raise exception 'non-owner released'; end if;
  if not exists (select 1 from public.poll_run_lease where owner_id = a
      and acquired_at <= clock_timestamp() and expires_at > clock_timestamp() + interval '4 minutes') then
    raise exception 'missing owner/expiry metadata';
  end if;
  select expires_at into before_expiry from public.poll_run_lease;
  if not public.renew_poll_run(a) then raise exception 'owner renewal failed'; end if;
  if (select expires_at from public.poll_run_lease) < before_expiry then
    raise exception 'renewal shortened lease';
  end if;
  -- Simulate a crashed worker without sleeping five minutes.
  update public.poll_run_lease set expires_at = clock_timestamp() - interval '1 second';
  if public.renew_poll_run(a) then raise exception 'expired owner resurrected itself'; end if;
  if not public.claim_poll_run(b) then raise exception 'stale lease not recovered'; end if;
  if public.release_poll_run(a) then raise exception 'old owner erased successor'; end if;
  if public.renew_poll_run(a) then raise exception 'old owner renewed successor'; end if;
  if not public.release_poll_run(b) then raise exception 'current release failed'; end if;
  if exists (select 1 from public.poll_run_lease) then raise exception 'lease remained'; end if;
end;
$$;
rollback;
