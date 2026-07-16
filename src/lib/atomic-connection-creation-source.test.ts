import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/046_atomic_connection_creation.sql"
)
const source = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : ""

describe("atomic connection creation migration", () => {
  it("keeps a per-user request key and one authenticated transaction", () => {
    expect(source).toContain("add column if not exists create_request_id uuid")
    expect(source).toContain(
      "create unique index if not exists idx_connections_user_create_request"
    )
    expect(source).toContain("create_connection_with_balances")
    expect(source).toContain("security invoker")
    expect(source).toContain("set search_path = ''")
    expect(source).toContain("v_user_id := auth.uid()")
    expect(source).toContain(
      "raise exception 'Create request ID is required' using errcode = '22004'"
    )
    expect(source).toContain("insert into public.connections")
    expect(source).toContain("insert into public.balances")
    expect(source).toContain("'active', true")
    expect(source).toContain("on conflict (user_id, create_request_id)")
    expect(source).toContain("from public, anon, service_role")
    expect(source).toContain("to authenticated")
  })
})
