import { describe, expect, it } from "vitest"
import { STALE_AFTER_MS } from "./balance-status"
import { assessPool } from "./pool-assessment"
import { type PoolRow, toPoolRows } from "./pool-rows"
import type { ConnectionWithBalance, PoolView } from "./types"

type Pair = { low: number | null; critical: number | null }

function conn(
  opts: {
    poolThresholds?: ConnectionWithBalance["pool_thresholds"]
    conn?: Pair
    tool?: Pair
    status?: ConnectionWithBalance["status"]
    pools?: PoolView[]
  } = {}
): ConnectionWithBalance {
  const c = opts.conn ?? { low: null, critical: null }
  const t = opts.tool ?? { low: null, critical: null }
  return {
    id: "c1",
    name: "My Tool",
    status: opts.status ?? "active",
    low_threshold: c.low,
    alert_threshold: c.critical,
    pool_thresholds: opts.poolThresholds ?? null,
    tool: {
      id: "t",
      name: "T",
      logo_url: null,
      topup_url: null,
      default_low_threshold: t.low,
      default_alert_threshold: t.critical,
    },
    pools: opts.pools ?? [],
  } as unknown as ConnectionWithBalance
}

function pool(overrides: Partial<PoolView> = {}): PoolView {
  return {
    creditType: "credits",
    label: "Credits",
    unit: "credits",
    balance: 1000,
    balanceLimit: null,
    recorded_at: new Date(Date.now() - 60_000).toISOString(),
    history: [],
    ...overrides,
  }
}

const row = (c: ConnectionWithBalance, p: PoolView | null): PoolRow => ({
  connection: c,
  pool: p,
})

describe("assessPool thresholds", () => {
  it("prefers the balance's own numbers, and says so", () => {
    const c = conn({
      poolThresholds: { credits: { low: 200, critical: 50 } },
      conn: { low: 10, critical: 5 },
      tool: { low: 1, critical: 1 },
    })
    const a = assessPool(row(c, pool()))
    expect(a.thresholds).toEqual({ low: 200, critical: 50 })
    expect(a.source).toBe("balance")
  })

  it("falls back to the connection when the balance has no number", () => {
    const c = conn({
      poolThresholds: { other: { low: 200, critical: 50 } },
      conn: { low: 10, critical: 5 },
      tool: { low: 30, critical: 10 },
    })
    const a = assessPool(row(c, pool()))
    expect(a.thresholds).toEqual({ low: 10, critical: 5 })
    expect(a.source).toBe("connection")
  })

  it("falls back to the tool default when neither is set", () => {
    const c = conn({
      poolThresholds: { credits: { low: null, critical: 50 } },
      tool: { low: 30, critical: 10 },
    })
    const a = assessPool(row(c, pool()))
    expect(a.thresholds).toEqual({ low: 30, critical: 50 })
    expect(a.source).toBe("tool")
  })

  it("keeps a stored override that is not 3:1 exactly as stored", () => {
    const c = conn({
      poolThresholds: { credits: { low: 800, critical: 200 } },
      tool: { low: 900, critical: 300 },
    })
    expect(assessPool(row(c, pool())).thresholds).toEqual({
      low: 800,
      critical: 200,
    })
  })

  it("has no source exactly when no warning number resolves", () => {
    const a = assessPool(row(conn(), pool()))
    expect(a.thresholds).toEqual({ low: null, critical: null })
    expect(a.source).toBeNull()
  })

  it("reports what the balance inherits without its own override", () => {
    const c = conn({
      poolThresholds: { credits: { low: 800, critical: 200 } },
      conn: { low: null, critical: 40 },
      tool: { low: 900, critical: 300 },
    })
    expect(assessPool(row(c, pool())).inherited).toEqual({
      low: 900,
      critical: 40,
    })
  })
})

describe("assessPool status", () => {
  const c = conn({ tool: { low: 500, critical: 100 } })

  it("is healthy above the warning number", () => {
    const a = assessPool(row(c, pool({ balance: 501 })))
    expect(a.status).toEqual({ kind: "level", level: "healthy" })
    expect(a.tone).toBe("healthy")
    expect(a.atRisk).toBe(false)
  })

  it("is low at the warning number and critical at the red point", () => {
    const low = assessPool(row(c, pool({ balance: 500 })))
    expect(low.tone).toBe("low")
    expect(low.atRisk).toBe(true)
    const crit = assessPool(row(c, pool({ balance: 100 })))
    expect(crit.tone).toBe("critical")
    expect(crit.atRisk).toBe(true)
  })

  it("reads a zero balance as critical and already gone", () => {
    const a = assessPool(row(c, pool({ balance: 0 })))
    expect(a.tone).toBe("critical")
    expect(a.eta).toEqual({ short: "already gone", long: "Already empty." })
  })

  it("never reads a stale connection as healthy, via the freshness rule", () => {
    const old = new Date(Date.now() - (STALE_AFTER_MS + 60_000)).toISOString()
    const [r] = toPoolRows([
      conn({
        tool: { low: 500, critical: 100 },
        pools: [pool({ balance: 99_999, recorded_at: old })],
      }),
    ])
    const a = assessPool(r)
    expect(a.status).toEqual({ kind: "connection", status: "stale" })
    expect(a.tone).toBe("neutral")
    expect(a.atRisk).toBe(false)
  })

  it("lets connection health win over the balance level", () => {
    const a = assessPool(
      row(
        conn({ status: "error", tool: { low: 500, critical: 100 } }),
        pool({ balance: 1 })
      )
    )
    expect(a.status).toEqual({ kind: "connection", status: "error" })
    expect(a.atRisk).toBe(false)
  })

  it("is no data, with no burn or ETA, before the first reading", () => {
    const [r] = toPoolRows([conn({ tool: { low: 500, critical: 100 } })])
    expect(r.pool).toBeNull()
    const a = assessPool(r)
    expect(a.status).toEqual({ kind: "nodata" })
    expect(a.tone).toBe("neutral")
    expect(a.burn).toBeNull()
    expect(a.eta).toBeNull()
  })
})

describe("assessPool burn", () => {
  it("measures burn and phrases the ETA from the same history", () => {
    const now = new Date("2026-06-16T12:00:00Z")
    const day = 86_400_000
    const history = [
      {
        balance: 300,
        recorded_at: new Date(now.getTime() - 2 * day).toISOString(),
      },
      {
        balance: 200,
        recorded_at: new Date(now.getTime() - day).toISOString(),
      },
      { balance: 100, recorded_at: now.toISOString() },
    ]
    const a = assessPool(row(conn(), pool({ balance: 100, history })))
    expect(a.burn).toEqual({ perDay: 100, daysLeft: 1 })
    expect(a.eta?.short).toBe("burns out tomorrow")
  })

  it("has no burn yet with a single reading", () => {
    const a = assessPool(row(conn(), pool()))
    expect(a.burn).toBeNull()
    expect(a.eta).toEqual({ short: "no burn yet", long: "Not draining yet." })
  })
})
