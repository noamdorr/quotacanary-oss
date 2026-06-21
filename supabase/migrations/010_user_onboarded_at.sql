-- 010_user_onboarded_at.sql
-- Tracks whether a user has completed (or skipped) the first-run onboarding.
-- Null = show onboarding; timestamp = done. Idempotent.

alter table public.users
  add column if not exists onboarded_at timestamptz;

-- Existing users with at least one connection are not new - mark them onboarded
-- so the first-run flow only shows to genuinely new accounts.
update public.users u
  set onboarded_at = now()
  where onboarded_at is null
    and exists (
      select 1 from public.connections c where c.user_id = u.id
    );
