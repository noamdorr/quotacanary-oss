import type { ConnectionStatus } from "@/lib/types"

export type BalanceLevel = "healthy" | "low" | "critical"

export type EffectiveStatus =
  | { kind: "level"; level: BalanceLevel }
  | { kind: "connection"; status: Exclude<ConnectionStatus, "active"> }
  // No trustworthy reading yet (e.g. just connected, never polled). Renders as
  // a neutral "No data" pill - never green "Healthy", never a warning color.
  | { kind: "nodata" }

// Connection health (can we trust the reading?) takes precedence over the
// balance level. A stale/errored connection must never read as "Healthy".
export function effectiveStatus(args: {
  balance: number | null
  low: number | null
  critical: number | null
  connectionStatus: ConnectionStatus
}): EffectiveStatus {
  const { balance, low, critical, connectionStatus } = args
  if (connectionStatus !== "active") {
    return { kind: "connection", status: connectionStatus }
  }
  // No reading yet: an untrustworthy/absent balance must never read "Healthy".
  if (balance == null) return { kind: "nodata" }
  if (critical != null && balance <= critical)
    return { kind: "level", level: "critical" }
  if (low != null && balance <= low) return { kind: "level", level: "low" }
  return { kind: "level", level: "healthy" }
}

// How old the newest reading may get before a connection is treated as "stale".
// The poller runs every ~15 min, so 90 min = several missed cycles - old enough
// to mean polling has actually stopped, not just a single skipped run.
// Tunable: raise if false positives appear, lower for tighter freshness.
export const STALE_AFTER_MS = 90 * 60 * 1000

// Derives the effective connection status from the DB status plus the age of
// the newest reading. A connection that polled fine but has since gone quiet
// keeps showing "Healthy" forever unless we age it out, so once its newest
// reading crosses STALE_AFTER_MS we treat an otherwise-active connection as
// "stale" (which effectiveStatus() then surfaces ahead of the balance level).
// Zero readings is NOT stale - that is the "no data" case (newestRecordedAt
// === null), so we leave the status untouched and let the nodata branch win.
export function staleAdjustedStatus(args: {
  status: ConnectionStatus
  newestRecordedAt: string | null
  now?: number
}): ConnectionStatus {
  const { status, newestRecordedAt, now = Date.now() } = args
  if (status !== "active") return status
  if (newestRecordedAt == null) return status
  const age = now - new Date(newestRecordedAt).getTime()
  return age > STALE_AFTER_MS ? "stale" : status
}
