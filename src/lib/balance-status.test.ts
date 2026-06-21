import { describe, expect, it } from "vitest"
import {
  STALE_AFTER_MS,
  effectiveStatus,
  staleAdjustedStatus,
} from "./balance-status"

describe("effectiveStatus", () => {
  const healthy = { connectionStatus: "active" as const }

  it("returns critical when balance is at or below critical", () => {
    expect(
      effectiveStatus({ balance: 1000, low: 5000, critical: 1000, ...healthy })
    ).toEqual({ kind: "level", level: "critical" })
  })

  it("returns low when between critical and low", () => {
    expect(
      effectiveStatus({ balance: 3000, low: 5000, critical: 1000, ...healthy })
    ).toEqual({ kind: "level", level: "low" })
  })

  it("returns healthy when above low", () => {
    expect(
      effectiveStatus({ balance: 9000, low: 5000, critical: 1000, ...healthy })
    ).toEqual({ kind: "level", level: "healthy" })
  })

  it("treats null thresholds as healthy", () => {
    expect(
      effectiveStatus({ balance: 5, low: null, critical: null, ...healthy })
    ).toEqual({ kind: "level", level: "healthy" })
  })

  it("treats null balance as no data, never healthy", () => {
    expect(
      effectiveStatus({ balance: null, low: 5000, critical: 1000, ...healthy })
    ).toEqual({ kind: "nodata" })
  })

  it("connection problems take precedence over balance level", () => {
    expect(
      effectiveStatus({
        balance: 50,
        low: 5000,
        critical: 1000,
        connectionStatus: "error",
      })
    ).toEqual({ kind: "connection", status: "error" })
    expect(
      effectiveStatus({
        balance: 99999,
        low: 5000,
        critical: 1000,
        connectionStatus: "stale",
      })
    ).toEqual({ kind: "connection", status: "stale" })
  })
})

describe("staleAdjustedStatus", () => {
  const now = Date.UTC(2026, 5, 1, 12, 0, 0)
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString()

  it("keeps active when the newest reading is fresh", () => {
    expect(
      staleAdjustedStatus({
        status: "active",
        newestRecordedAt: iso(10 * 60 * 1000),
        now,
      })
    ).toBe("active")
  })

  it("ages an active connection to stale once readings exceed the threshold", () => {
    expect(
      staleAdjustedStatus({
        status: "active",
        newestRecordedAt: iso(STALE_AFTER_MS + 60 * 1000),
        now,
      })
    ).toBe("stale")
  })

  it("treats zero readings as no data, not stale (leaves status active)", () => {
    expect(
      staleAdjustedStatus({ status: "active", newestRecordedAt: null, now })
    ).toBe("active")
  })

  it("does not override a non-active status", () => {
    expect(
      staleAdjustedStatus({
        status: "error",
        newestRecordedAt: iso(STALE_AFTER_MS + 60 * 1000),
        now,
      })
    ).toBe("error")
  })
})
