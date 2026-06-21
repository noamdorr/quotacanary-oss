import type { ConnectionWithBalance } from "@/lib/types"
import { describe, expect, it } from "vitest"
import { resolvePoolThresholds, thresholdOrderError } from "./thresholds"

function make(
  conn: { low: number | null; critical: number | null },
  tool: { low: number | null; critical: number | null }
): ConnectionWithBalance {
  return {
    low_threshold: conn.low,
    alert_threshold: conn.critical,
    tool: {
      id: "t",
      name: "T",
      logo_url: null,
      topup_url: null,
      default_low_threshold: tool.low,
      default_alert_threshold: tool.critical,
    },
  } as ConnectionWithBalance
}

function makePool(
  poolThresholds: ConnectionWithBalance["pool_thresholds"],
  conn: { low: number | null; critical: number | null },
  tool: { low: number | null; critical: number | null }
): ConnectionWithBalance {
  return {
    ...make(conn, tool),
    pool_thresholds: poolThresholds,
  }
}

describe("resolvePoolThresholds", () => {
  it("prefers per-pool thresholds", () => {
    const c = makePool(
      { verifications: { low: 200, critical: 50 } },
      { low: 10, critical: 5 },
      { low: 1, critical: 1 }
    )
    expect(resolvePoolThresholds(c, "verifications")).toEqual({
      low: 200,
      critical: 50,
    })
  })

  it("falls back to connection-level when no per-pool override", () => {
    const c = makePool(
      null,
      { low: 10, critical: 5 },
      { low: 30, critical: 10 }
    )
    expect(resolvePoolThresholds(c, "credits")).toEqual({
      low: 10,
      critical: 5,
    })
  })

  it("falls back to tool defaults when neither per-pool nor connection set", () => {
    const c = makePool(
      null,
      { low: null, critical: null },
      { low: 30, critical: 10 }
    )
    expect(resolvePoolThresholds(c, "credits")).toEqual({
      low: 30,
      critical: 10,
    })
  })
})

describe("thresholdOrderError", () => {
  it("allows a low warning above critical", () => {
    expect(thresholdOrderError(3000, 2000)).toBeNull()
  })
  it("rejects a low warning below critical", () => {
    expect(thresholdOrderError(2000, 3000)).toMatch(/higher than Critical/i)
  })
  it("rejects a low warning equal to critical", () => {
    expect(thresholdOrderError(2000, 2000)).toMatch(/higher than Critical/i)
  })
  it("allows a null on either side (only one threshold set)", () => {
    expect(thresholdOrderError(null, 2000)).toBeNull()
    expect(thresholdOrderError(3000, null)).toBeNull()
    expect(thresholdOrderError(null, null)).toBeNull()
  })
})
