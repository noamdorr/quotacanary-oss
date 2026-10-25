import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/070_api_write_scope.sql"
)
const source = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : ""

// QUO-187: personal tokens gain a write scope and the API gains a
// service-role path to create a connection for a token's owner.
describe("API write scope migration", () => {
  it("replaces create_api_token with a signature that stores the chosen scopes", () => {
    expect(source).toContain(
      "drop function if exists public.create_api_token(text, text, text, integer)"
    )
    expect(source).toContain("p_scopes text[]")
    expect(source).toContain("security invoker")
    expect(source).toContain("set search_path = ''")
    expect(source).toContain("v_user_id := auth.uid()")
    expect(source).toContain("pg_advisory_xact_lock")
    expect(source).toContain(
      "insert into public.api_tokens (user_id, name, token_hash, token_hint, scopes)"
    )
    expect(source).toContain("p_max_active is null or p_max_active < 1")
  })

  it("rejects scopes outside the read/write vocabulary inside the function", () => {
    expect(source).toContain("array['read', 'write']")
    expect(source).toContain("raise exception 'Unknown token scope'")
  })

  it("keeps token creation executable only by signed-in users", () => {
    expect(source).toContain(
      "revoke execute on function public.create_api_token(\n  text, text, text, integer, text[]\n) from public, anon, service_role"
    )
    expect(source).toContain(
      "grant execute on function public.create_api_token(\n  text, text, text, integer, text[]\n) to authenticated"
    )
  })

  it("adds a service-role-only connection insert keyed on an explicit user id", () => {
    expect(source).toContain(
      "create or replace function public.create_connection_with_balances_for_user("
    )
    expect(source).toContain("p_user_id uuid")
    expect(source).toContain(
      "raise exception 'User ID is required' using errcode = '22004'"
    )
    expect(source).toContain(
      "raise exception 'Create request ID is required' using errcode = '22004'"
    )
    expect(source).toContain("insert into public.connections")
    expect(source).toContain("insert into public.balances")
    expect(source).toContain("'active', true")
    expect(source).toContain("on conflict (user_id, create_request_id)")
    expect(source).toContain(
      "revoke execute on function public.create_connection_with_balances_for_user(\n  uuid, text, text, text, text, text[], text[], jsonb, uuid\n) from public, anon, authenticated"
    )
    expect(source).toContain(
      "grant execute on function public.create_connection_with_balances_for_user(\n  uuid, text, text, text, text, text[], text[], jsonb, uuid\n) to service_role"
    )
  })

  it("never derives the user from auth.uid() in the service-role insert", () => {
    const forUser = source.slice(
      source.indexOf("create_connection_with_balances_for_user(")
    )
    expect(forUser).not.toContain("auth.uid()")
  })
})
