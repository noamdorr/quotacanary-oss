-- =============================================================================
-- 058_welcome_email_flag.sql
-- QUO-74: re-wire the QUO-72 welcome email onto magic-link sign-in.
--
-- Magic link collapsed signup/login into one `signInWithOtp` call, and
-- Supabase deliberately does not disclose at that point whether the email
-- belongs to an existing account (email-enumeration protection), so
-- "is this a first-time signup" can only be answered later, once
-- /auth/confirm has established a session. That means the send has to be
-- guarded by state, not by which code path was taken.
--
-- welcomed_at is that state: null until the welcome email has gone out once,
-- then a timestamp forever after. It is deliberately NOT added to 052's
-- `grant update (...) on public.users to authenticated` list - a plain
-- client UPDATE would let a signed-in user flip it back to null and
-- re-trigger their own welcome email, or race two concurrent confirms (a
-- re-clicked link, or two tabs) into sending twice. mark_user_welcomed()
-- does the atomic `WHERE welcomed_at IS NULL` check-and-set as one
-- statement, so a race resolves to at most one caller seeing a true return -
-- the same shape as revoke_api_token() (052) for a server-owned flag on an
-- otherwise user-owned row.
-- =============================================================================

alter table public.users
  add column if not exists welcomed_at timestamptz;

-- Everyone who already exists predates the feature and must never receive a
-- retroactive welcome email on their next sign-in. Only accounts created
-- after this migration start with welcomed_at null.
update public.users
  set welcomed_at = created_at
  where welcomed_at is null;

create or replace function public.mark_user_welcomed()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_count int;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  update public.users
    set welcomed_at = now()
    where id = v_user_id
      and welcomed_at is null;

  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

-- Functions default EXECUTE to public; strip that off explicitly. Only the
-- signed-in user marks themselves welcomed - the poll cron and other
-- service-role paths have no reason to call this.
revoke execute on function public.mark_user_welcomed()
  from public, anon, service_role;

grant execute on function public.mark_user_welcomed()
  to authenticated;
