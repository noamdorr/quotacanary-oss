-- =============================================================================
-- 052_column_scope_update_grants.sql
-- QUO-58: narrow the `authenticated` UPDATE privilege on the two tables that
-- carry server-managed columns inside a row the user owns.
--
-- RLS restricts which ROWS a user may write, never which COLUMNS. 036 granted
-- table-level UPDATE on every table in `public` to `authenticated` (correct and
-- necessary - it fixes fresh-install `permission denied`), and neither table's
-- policy narrows the columns. So a signed-in user could PATCH their own row
-- through PostgREST and rewrite state the server owns:
--
--   * public.users.email - alert recipients resolve from this column
--     (src/lib/alerts/dispatch.ts), so rewriting it makes QuotaCanary's sender
--     mail an address the user never proved they own. The 013 trigger only
--     re-syncs when the AUTH email changes, so it does not correct this.
--   * public.users.plan - inert today, but a latent entitlement column.
--   * public.api_tokens.rl_count / rl_window_start - the rate limiter's state
--     (042), so a user at the 60/min cap could reset their own counter.
--   * public.api_tokens.revoked_at - un-revokes a revoked token.
--
-- Neither is a cross-user vector; both are confined to the attacker's own row.
--
-- The fix is column-scoped grants. Postgres treats table-level and column-level
-- UPDATE as separate privileges, so each table needs the blanket grant revoked
-- before the column list is granted. `anon` and `service_role` (039) are left
-- alone: the poll cron and the token verifier write these columns as
-- service_role, and that is the intended path.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- public.users
-- ---------------------------------------------------------------------------
-- The column list is the set the app actually writes from a user session:
-- setNotifyMode, setViewMode and completeOnboarding in
-- src/lib/actions/connections.ts. `name` and `timezone` are user-owned in
-- principle but have no write path today, so they stay out until one exists.
-- `email` stays owned by the 013 auth-sync trigger; `plan`, `org_id`, `id` and
-- the timestamps are server-managed.

revoke update on public.users from authenticated;

grant update (notify_mode, view_mode, onboarded_at)
  on public.users
  to authenticated;

-- ---------------------------------------------------------------------------
-- public.api_tokens
-- ---------------------------------------------------------------------------
-- Nothing on this table is user-writable. Creation already runs through the
-- create_api_token RPC (051) as an INSERT, `last_used_at` is written by the
-- service-role verifier, the rate-limit counters are written by the SECURITY
-- DEFINER limiter (042), and revocation moves to the RPC below. There is no
-- rename UI, so `name` gets no grant either - add one with the feature.

revoke update on public.api_tokens from authenticated;

-- Revocation used to be a plain user UPDATE of `revoked_at`
-- (src/lib/actions/api-tokens.ts), which the revoke above would break. SECURITY
-- DEFINER so it can write the column the caller no longer may, with ownership
-- re-checked inside the function rather than inherited from RLS - a definer
-- function runs as the table owner and so bypasses the policies entirely.
-- Idempotent on an already-revoked token, matching the action's previous
-- `.is("revoked_at", null)` filter.
create or replace function public.revoke_api_token(p_token_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  update public.api_tokens
    set revoked_at = now()
    where id = p_token_id
      and user_id = v_user_id
      and revoked_at is null;
end;
$$;

-- Functions default EXECUTE to public, so strip that off explicitly. Only a
-- signed-in user revokes their own token; the service role has direct UPDATE.
revoke execute on function public.revoke_api_token(uuid)
  from public, anon, service_role;

grant execute on function public.revoke_api_token(uuid)
  to authenticated;
