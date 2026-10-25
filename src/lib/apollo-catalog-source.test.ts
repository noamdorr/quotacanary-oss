import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const creditUsageDocs =
  "https://docs.apollo.io/reference/view-credit-usage-stats"
const seed = readFileSync(resolve(process.cwd(), "supabase/seed.sql"), "utf8")
const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/063_apollo_credit_usage_docs.sql"
)

describe("Apollo credit usage documentation", () => {
  it("links fresh installs to credit usage, not API rate limits", () => {
    const apolloDocs = seed.match(
      /\(\s*'apollo',\s*'[^']+',\s*'[^']+',\s*'([^']+)'/
    )?.[1]

    expect(apolloDocs).toBe(creditUsageDocs)
  })

  it("corrects only Apollo's documentation URL on existing installs", () => {
    const migration = existsSync(migrationPath)
      ? readFileSync(migrationPath, "utf8")
      : ""
    const sql = migration
      .replace(/--[^\n]*/g, "")
      .replace(/\s+/g, " ")
      .trim()

    expect(sql).toBe(
      `update public.tools set api_docs_url = '${creditUsageDocs}' where id = 'apollo';`
    )
  })
})
