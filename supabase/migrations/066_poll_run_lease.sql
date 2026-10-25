-- QUO-31: one renewable fleet-wide poll lease, using database time.
-- Deploy this additive migration before the app that requires its RPCs.
begin;

create table public.poll_run_lease (
  singleton boolean primary key default true check (singleton),
  owner_id uuid not null,
  acquired_at timestamptz not null,
  expires_at timestamptz not null
);
alter table public.poll_run_lease enable row level security;
revoke all on public.poll_run_lease from anon, authenticated;
grant select, insert, update, delete on public.poll_run_lease to service_role;

-- A skip is not evidence of a healthy poll. It is excluded from previous-run
-- alarm comparisons and does not send a success heartbeat.
alter table public.poll_runs add column skipped_overlap boolean not null default false;

create function public.claim_poll_run(p_owner_id uuid) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare v_rows integer;
begin
  insert into public.poll_run_lease (singleton, owner_id, acquired_at, expires_at)
    values (true, p_owner_id, clock_timestamp(), clock_timestamp() + interval '5 minutes')
  on conflict (singleton) do update
    set owner_id = excluded.owner_id, acquired_at = clock_timestamp(),
        expires_at = clock_timestamp() + interval '5 minutes'
    where public.poll_run_lease.expires_at <= clock_timestamp();
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

create function public.renew_poll_run(p_owner_id uuid) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare v_rows integer;
begin
  update public.poll_run_lease set expires_at = clock_timestamp() + interval '5 minutes'
    where singleton and owner_id = p_owner_id and expires_at > clock_timestamp();
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

create function public.release_poll_run(p_owner_id uuid) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare v_rows integer;
begin
  delete from public.poll_run_lease where singleton and owner_id = p_owner_id;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

revoke execute on function public.claim_poll_run(uuid) from public, anon, authenticated;
revoke execute on function public.renew_poll_run(uuid) from public, anon, authenticated;
revoke execute on function public.release_poll_run(uuid) from public, anon, authenticated;
grant execute on function public.claim_poll_run(uuid) to service_role;
grant execute on function public.renew_poll_run(uuid) to service_role;
grant execute on function public.release_poll_run(uuid) to service_role;
commit;
