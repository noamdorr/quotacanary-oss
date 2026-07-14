import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/045_revoke_legacy_rate_limit_rpc.sql"
)
const source = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : ""

describe("legacy rate-limit RPC privileges", () => {
  it("removes public execution and preserves only service-role execution", () => {
    expect(source).toContain(
      "revoke execute on function public.consume_api_rate_limit(uuid, int, int)"
    )
    expect(source).toContain("from public, anon, authenticated")
    expect(source).toContain(
      "grant execute on function public.consume_api_rate_limit(uuid, int, int)"
    )
    expect(source).toContain("to service_role")
  })
})
