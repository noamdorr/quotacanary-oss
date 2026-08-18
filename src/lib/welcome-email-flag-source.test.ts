import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/058_welcome_email_flag.sql"
)
const source = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : ""

describe("welcome email flag migration", () => {
  it("guards the send with an atomic check-and-set RPC, not a plain column grant", () => {
    expect(source).toContain("add column if not exists welcomed_at")
    expect(source).toContain("mark_user_welcomed")
    expect(source).toContain("security definer")
    expect(source).toContain("set search_path = ''")
    expect(source).toContain("v_user_id := auth.uid()")
    expect(source).toContain("where id = v_user_id")
    expect(source).toContain("and welcomed_at is null")
    expect(source).toContain("from public, anon, service_role")
    expect(source).toContain("to authenticated")
    expect(source).not.toContain("grant update (welcomed_at")
  })

  it("backfills existing users so they never get a retroactive welcome email", () => {
    expect(source).toContain("set welcomed_at = created_at")
  })
})
