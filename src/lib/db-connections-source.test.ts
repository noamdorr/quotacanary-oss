import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const connectionsDb = readFileSync(
  resolve(process.cwd(), "src/lib/db/connections.ts"),
  "utf8"
)

const pollRoute = readFileSync(
  resolve(process.cwd(), "src/app/api/poll/route.ts"),
  "utf8"
)

describe("balances retention source", () => {
  it("caps the embedded balances select instead of fetching wholesale", () => {
    expect(connectionsDb).toContain(
      '.limit(BALANCE_FETCH_LIMIT, { foreignTable: "balances" })'
    )
  })

  it("keeps the fetch cap above the per-pool history window", () => {
    const limit = connectionsDb.match(/BALANCE_FETCH_LIMIT = (\d+)/)?.[1]
    const history = connectionsDb.match(/HISTORY_LIMIT = (\d+)/)?.[1]
    expect(Number(limit)).toBeGreaterThanOrEqual(Number(history) * 3)
  })

  it("orders embedded balances newest-first so the cap keeps recent rows", () => {
    expect(connectionsDb).toContain(
      '.order("recorded_at", { foreignTable: "balances", ascending: false })'
    )
  })

  it("prunes balance history from the poll run without failing the poll", () => {
    expect(pollRoute).toContain('supabase.rpc("prune_balances")')
    expect(pollRoute.indexOf("try {")).toBeLessThan(
      pollRoute.indexOf('supabase.rpc("prune_balances")')
    )
  })
})
