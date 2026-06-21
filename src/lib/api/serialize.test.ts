import type { ConnectionWithBalance, PoolView } from "@/lib/types"
import { describe, expect, it } from "vitest"
import { flattenStatus, serializePoolRow } from "./serialize"
import type { PoolPayload } from "./serialize"

// ─── Fixture helpers ────────────────────────────────────────────────────────

const NOW_ISO = "2026-06-16T12:00:00.000Z"

function makePool(overrides: Partial<PoolView> = {}): PoolView {
  return {
    creditType: "searches",
    label: "Searches",
    unit: "credits",
    balance: 5000,
    balanceLimit: null,
    recorded_at: NOW_ISO,
    history: [],
    ...overrides,
  }
}

function makeConn(
  overrides: Partial<ConnectionWithBalance> = {}
): ConnectionWithBalance {
  return {
    id: "conn-1",
    user_id: "user-1",
    tool_id: "tool-1",
    connection_type: "api",
    encrypted_key: null,
    key_hint: null,
    name: "My Apollo",
    tags: [],
    status: "active",
    alert_enabled: false,
    alert_threshold: null,
    low_threshold: null,
    alert_fired_at: null,
    notified_level: "none",
    last_error: null,
    consecutive_failures: 0,
    watched_credit_types: null,
    pool_thresholds: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    tool: {
      id: "tool-1",
      name: "Apollo",
      logo_url: "https://example.com/logo.png",
      topup_url: "https://app.apollo.io/billing",
      default_low_threshold: 500,
      default_alert_threshold: 100,
      pools: null,
      credential_fields: null,
    },
    pools: [],
    ...overrides,
  } as ConnectionWithBalance
}

// ─── flattenStatus ───────────────────────────────────────────────────────────

describe("flattenStatus", () => {
  it('maps {kind:"level", level:"healthy"} -> "healthy"', () => {
    expect(flattenStatus({ kind: "level", level: "healthy" })).toBe("healthy")
  })

  it('maps {kind:"level", level:"low"} -> "low"', () => {
    expect(flattenStatus({ kind: "level", level: "low" })).toBe("low")
  })

  it('maps {kind:"level", level:"critical"} -> "critical"', () => {
    expect(flattenStatus({ kind: "level", level: "critical" })).toBe("critical")
  })

  it('maps {kind:"connection", status:"stale"} -> "stale"', () => {
    expect(flattenStatus({ kind: "connection", status: "stale" })).toBe("stale")
  })

  it('maps {kind:"connection", status:"error"} -> "error"', () => {
    expect(flattenStatus({ kind: "connection", status: "error" })).toBe("error")
  })

  it('maps {kind:"connection", status:"disconnected"} -> "disconnected"', () => {
    expect(flattenStatus({ kind: "connection", status: "disconnected" })).toBe(
      "disconnected"
    )
  })

  it('maps {kind:"nodata"} -> "nodata"', () => {
    expect(flattenStatus({ kind: "nodata" })).toBe("nodata")
  })
})

// ─── serializePoolRow ────────────────────────────────────────────────────────

describe("serializePoolRow", () => {
  it("healthy pool: basic field mapping and snake->camel conversion", () => {
    const pool = makePool({
      balance: 9000,
      balanceLimit: 10000,
      recorded_at: NOW_ISO,
    })
    const conn = makeConn({ pools: [pool] })

    const payload = serializePoolRow({ connection: conn, pool })

    expect(payload.connectionId).toBe("conn-1")
    expect(payload.connectionName).toBe("My Apollo")
    expect(payload.tool).toEqual({
      id: "tool-1",
      name: "Apollo",
      topupUrl: "https://app.apollo.io/billing",
    })
    expect(payload.creditType).toBe("searches")
    expect(payload.label).toBe("Searches")
    expect(payload.unit).toBe("credits")
    expect(payload.balance).toBe(9000)
    expect(payload.balanceLimit).toBe(10000)
    // snake_case recorded_at -> camelCase recordedAt
    expect(payload.recordedAt).toBe(NOW_ISO)
    expect(payload.status).toBe("healthy")
    // No burn with empty history
    expect(payload.burn).toBeNull()
    // eta from formatBurnEta(null)
    expect(payload.eta).toEqual({
      short: "no burn yet",
      long: "Not draining yet.",
    })
    // Thresholds from tool defaults (no pool/connection overrides)
    expect(payload.thresholds).toEqual({ low: 500, critical: 100 })
  })

  it("low status when balance is at or below low threshold", () => {
    const pool = makePool({ balance: 400 })
    const conn = makeConn({
      pools: [pool],
      // low=500, critical=100 from tool defaults
    })

    const payload = serializePoolRow({ connection: conn, pool })
    expect(payload.status).toBe("low")
  })

  it("critical status when balance is at or below critical threshold", () => {
    const pool = makePool({ balance: 50 })
    const conn = makeConn({ pools: [pool] })

    const payload = serializePoolRow({ connection: conn, pool })
    expect(payload.status).toBe("critical")
  })

  it("stale connection is never healthy even with a high balance", () => {
    const pool = makePool({ balance: 99999 })
    // Connection already stale-adjusted (as toPoolRows would do)
    const conn = makeConn({ status: "stale", pools: [pool] })

    const payload = serializePoolRow({ connection: conn, pool })
    expect(payload.status).toBe("stale")
    // Must NOT be healthy
    expect(payload.status).not.toBe("healthy")
  })

  it("error connection status surfaced correctly", () => {
    const pool = makePool({ balance: 99999 })
    const conn = makeConn({ status: "error", pools: [pool] })

    const payload = serializePoolRow({ connection: conn, pool })
    expect(payload.status).toBe("error")
  })

  it("null pool (never polled) -> nodata, all balance fields null", () => {
    const conn = makeConn({ pools: [] })

    const payload = serializePoolRow({ connection: conn, pool: null })

    expect(payload.status).toBe("nodata")
    expect(payload.balance).toBeNull()
    expect(payload.balanceLimit).toBeNull()
    expect(payload.recordedAt).toBeNull()
    expect(payload.burn).toBeNull()
    expect(payload.creditType).toBeNull()
    expect(payload.label).toBeNull()
    expect(payload.unit).toBeNull()
    // eta from formatBurnEta(null)
    expect(payload.eta).toEqual({
      short: "no burn yet",
      long: "Not draining yet.",
    })
    // Connection fields still populated
    expect(payload.connectionId).toBe("conn-1")
    expect(payload.connectionName).toBe("My Apollo")
    expect(payload.tool.topupUrl).toBe("https://app.apollo.io/billing")
  })

  it("null pool with errored connection -> error (not nodata)", () => {
    const conn = makeConn({ status: "error", pools: [] })

    const payload = serializePoolRow({ connection: conn, pool: null })
    // error connection takes precedence per effectiveStatus logic
    expect(payload.status).toBe("error")
    expect(payload.status).not.toBe("nodata")
    expect(payload.status).not.toBe("healthy")
  })

  it("fast-draining pool: burn and eta are computed", () => {
    // 1000 -> 600 over 2 days = 200/day; 600 left = 3 days from reference date
    const REF = new Date("2026-06-16T12:00:00.000Z")
    const history = [
      {
        balance: 1000,
        recorded_at: new Date(REF.getTime() - 2 * 86_400_000).toISOString(),
      },
      {
        balance: 600,
        recorded_at: REF.toISOString(),
      },
    ]
    const pool = makePool({
      balance: 600,
      recorded_at: REF.toISOString(),
      history,
    })
    const conn = makeConn({ pools: [pool] })

    const payload = serializePoolRow({ connection: conn, pool })

    expect(payload.burn).not.toBeNull()
    expect(payload.burn?.perDay).toBeCloseTo(200, 0)
    expect(payload.burn?.daysLeft).toBeCloseTo(3, 0)
    // eta should mention a day/days out (Saturday from Wednesday ref)
    expect(payload.eta.short).toMatch(/burn|Saturday/i)
    expect(payload.eta.long).toContain("~3 days")
  })

  it("pool with connection-level threshold overrides", () => {
    const pool = makePool({ balance: 3000 })
    const conn = makeConn({
      pools: [pool],
      low_threshold: 4000,
      alert_threshold: 2000,
    })

    const payload = serializePoolRow({ connection: conn, pool })
    expect(payload.thresholds).toEqual({ low: 4000, critical: 2000 })
    // balance=3000 is between critical(2000) and low(4000) -> low
    expect(payload.status).toBe("low")
  })

  it("pool with per-pool threshold overrides (pool_thresholds)", () => {
    const pool = makePool({ balance: 50, creditType: "searches" })
    const conn = makeConn({
      pools: [pool],
      low_threshold: 500,
      alert_threshold: 100,
      pool_thresholds: {
        searches: { low: 200, critical: 80 },
      },
    })

    const payload = serializePoolRow({ connection: conn, pool })
    expect(payload.thresholds).toEqual({ low: 200, critical: 80 })
    // balance=50 <= critical(80) -> critical
    expect(payload.status).toBe("critical")
  })

  it("tool with null topup_url is preserved as null in payload", () => {
    const pool = makePool()
    const conn = makeConn({
      pools: [pool],
      tool: {
        id: "tool-2",
        name: "ManualTool",
        logo_url: null,
        topup_url: null,
        default_low_threshold: null,
        default_alert_threshold: null,
        pools: null,
        credential_fields: null,
      },
    })

    const payload = serializePoolRow({ connection: conn, pool })
    expect(payload.tool.topupUrl).toBeNull()
    expect(payload.thresholds).toEqual({ low: null, critical: null })
  })
})
