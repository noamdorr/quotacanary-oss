import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/052_column_scope_update_grants.sql"
)
const source = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : ""

// The grant list is the assertion: an UPDATE privilege that names a column is
// the only thing standing between a signed-in user and their own
// server-managed columns, so a later migration widening it should fail here.
const usersGrant = source.match(
  /grant update \(([^)]*)\)\s*\n?\s*on public\.users/
)
const grantedUserColumns = (usersGrant?.[1] ?? "")
  .split(",")
  .map((c) => c.trim())
  .filter(Boolean)

describe("column-scoped UPDATE grants migration", () => {
  it("drops the blanket table-level UPDATE on both tables", () => {
    expect(source).toContain("revoke update on public.users from authenticated")
    expect(source).toContain(
      "revoke update on public.api_tokens from authenticated"
    )
  })

  it("regrants users UPDATE only on the columns the app writes", () => {
    expect(grantedUserColumns).toEqual([
      "notify_mode",
      "view_mode",
      "onboarded_at",
    ])
  })

  it("never regrants the columns that drive alert delivery or entitlement", () => {
    // email feeds the alert recipient (src/lib/alerts/dispatch.ts); writing it
    // would make QuotaCanary mail an unverified address. plan is a latent
    // entitlement column.
    expect(grantedUserColumns).not.toContain("email")
    expect(grantedUserColumns).not.toContain("plan")
  })

  it("leaves api_tokens with no user-writable columns at all", () => {
    expect(source).not.toMatch(
      /grant update \([^)]*\)\s*\n?\s*on public\.api_tokens/
    )
  })

  it("moves revocation behind an ownership-checking definer function", () => {
    expect(source).toContain(
      "create or replace function public.revoke_api_token"
    )
    expect(source).toContain("security definer")
    expect(source).toContain("set search_path = ''")
    expect(source).toContain("v_user_id := auth.uid()")
    expect(source).toContain("and user_id = v_user_id")
    expect(source).toContain("and revoked_at is null")
  })

  it("keeps the revoke RPC executable only by signed-in users", () => {
    expect(source).toContain(
      "revoke execute on function public.revoke_api_token(uuid)"
    )
    expect(source).toContain("from public, anon, service_role")
    expect(source).toContain(
      "grant execute on function public.revoke_api_token(uuid)"
    )
    expect(source).toContain("to authenticated")
  })

  it("leaves the anon and service_role grants from 039 alone", () => {
    expect(source).not.toContain("from service_role")
    expect(source).not.toMatch(/revoke update on public\.\w+ from anon/)
  })
})
