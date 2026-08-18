import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/051_atomic_api_token_creation.sql"
)
const source = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : ""

describe("atomic API token creation migration", () => {
  it("locks the per-user count and insert into one authenticated transaction", () => {
    expect(source).toContain("create_api_token")
    expect(source).toContain("security invoker")
    expect(source).toContain("set search_path = ''")
    expect(source).toContain("v_user_id := auth.uid()")
    expect(source).toContain("pg_advisory_xact_lock")
    expect(source).toContain("insert into public.api_tokens")
    expect(source).toContain("from public, anon, service_role")
    expect(source).toContain("to authenticated")
  })

  it("fails closed on a missing or nonsensical cap", () => {
    expect(source).toContain("p_max_active is null or p_max_active < 1")
    expect(source).toContain(
      "raise exception 'Active token cap must be a positive integer'"
    )
  })
})
