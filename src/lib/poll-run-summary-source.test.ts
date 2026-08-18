import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

function read(relative: string): string {
  const path = resolve(process.cwd(), relative)
  return existsSync(path) ? readFileSync(path, "utf8") : ""
}

const migration = read("supabase/migrations/053_poll_runs.sql")

// The comments explain at length which identifiers are deliberately absent, so
// a column check has to read the statements only.
const migrationStatements = migration
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n")

describe("poll_runs migration", () => {
  it("constrains outcome to the three defined run outcomes", () => {
    // The vocabulary in src/lib/poll-run.ts is what the runbook and any
    // monitoring query key off; a fourth value written here would be invisible
    // to both.
    expect(migration).toContain(
      "check (outcome in ('ok', 'degraded', 'failed'))"
    )
  })

  it("records only metrics, never who was polled or why it failed", () => {
    // The whole point of this table is that it is safe to query and chart.
    // Failure detail stays in the server log.
    for (const column of [
      "connection_id",
      "user_id",
      "tool_id",
      "error",
      "last_error",
      "email",
    ]) {
      expect(migrationStatements).not.toContain(column)
    }
  })

  it("keeps the table out of reach of end users", () => {
    // 036/039 default privileges hand every new table to anon and
    // authenticated, so RLS alone is one permissive policy away from exposing
    // the fleet's poll history.
    expect(migration).toContain(
      "alter table public.poll_runs enable row level security"
    )
    expect(migration).toContain(
      "revoke all on public.poll_runs from anon, authenticated"
    )
    expect(migration).not.toMatch(/create policy[\s\S]*poll_runs/)
  })

  it("grants the poll route's own role explicitly, for fresh installs", () => {
    expect(migration).toContain(
      "grant select, insert on public.poll_runs to service_role"
    )
  })
})
