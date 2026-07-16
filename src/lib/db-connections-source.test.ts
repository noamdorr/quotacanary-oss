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
  it("fetches history through the sampled RPC instead of a wholesale select", () => {
    // pool_history_sampled (migration 047) bounds rows in the DB: newest
    // reading per bucket over the window, so no client-side fetch cap needed.
    expect(connectionsDb).toContain('supabase.rpc("pool_history_sampled"')
    expect(connectionsDb).not.toContain("balances(")
  })

  it("prunes balance history from the poll run without failing the poll", () => {
    expect(pollRoute).toContain('supabase.rpc("prune_balances")')
    expect(pollRoute.indexOf("try {")).toBeLessThan(
      pollRoute.indexOf('supabase.rpc("prune_balances")')
    )
  })
})
