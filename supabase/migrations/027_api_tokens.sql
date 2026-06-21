-- =============================================================================
-- 027_api_tokens.sql
-- Per-user personal access tokens (PATs) for the public REST API and MCP server.
-- =============================================================================

create table if not exists public.api_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  token_hash    text not null unique,        -- SHA-256 hex of the raw token
  token_hint    text not null,               -- last 4 chars of the raw token, for display
  name          text not null,
  scopes        text[] not null default '{read}',
  last_used_at  timestamptz,
  revoked_at    timestamptz,                  -- revocation is a soft set; keeps an audit trail
  created_at    timestamptz not null default now()
);

alter table public.api_tokens enable row level security;

create policy "api_tokens: select own"
  on public.api_tokens for select
  using ((select auth.uid()) = user_id);

create policy "api_tokens: insert own"
  on public.api_tokens for insert
  with check ((select auth.uid()) = user_id);

create policy "api_tokens: update own"
  on public.api_tokens for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists idx_api_tokens_user_created
  on public.api_tokens (user_id, created_at desc);
