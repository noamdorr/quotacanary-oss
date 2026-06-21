-- 013_sync_user_email.sql
-- Keep public.users.email in sync when a user changes their account email.
--
-- handle_new_user (migration 001) only fires `after insert on auth.users`, so a
-- later email change in Supabase Auth left public.users.email stale - and alert
-- emails (resolved from public.users.email in src/lib/alerts/dispatch.ts) plus
-- any other mail keyed off it kept going to the old address. This adds a
-- companion trigger that mirrors email updates from auth.users to public.users,
-- and backfills any rows that already drifted before the trigger existed.
--
-- Written idempotently (create or replace / drop if exists) because the trigger
-- was first applied by hand to the live DB; a later `supabase db push` must be
-- able to re-run this file without erroring on already-existing objects.

create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.users
    set email = new.email,
        updated_at = now()
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute procedure public.handle_user_email_change();

-- Backfill: reconcile rows whose email drifted while no sync trigger existed.
update public.users u
   set email = a.email,
       updated_at = now()
  from auth.users a
 where a.id = u.id
   and u.email is distinct from a.email;
