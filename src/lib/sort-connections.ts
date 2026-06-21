import { effectiveStatus } from "@/lib/balance-status"
import type { PoolRow } from "@/lib/pool-rows"
import { resolvePoolThresholds } from "@/lib/thresholds"

export type SortKey = "name" | "status" | "balance" | "updated"
export type SortDir = "asc" | "desc"

// Lower rank = more urgent → shown first when sorting status ascending.
function severity(r: PoolRow): number {
  const ct = r.pool?.creditType ?? ""
  const { low, critical } = resolvePoolThresholds(r.connection, ct)
  const s = effectiveStatus({
    balance: r.pool?.balance ?? null,
    low,
    critical,
    connectionStatus: r.connection.status,
  })
  if (s.kind === "connection") return s.status === "stale" ? 2 : 0
  // "No data" is low urgency - we don't know it's at risk, so it sorts after
  // every real level (below even healthy).
  if (s.kind === "nodata") return 5
  return { critical: 1, low: 3, healthy: 4 }[s.level]
}

function compare(a: PoolRow, b: PoolRow, key: SortKey): number {
  switch (key) {
    case "name":
      return a.connection.name.localeCompare(b.connection.name, undefined, {
        sensitivity: "base",
      })
    case "status":
      return severity(a) - severity(b)
    case "balance":
      return (a.pool?.balance ?? 0) - (b.pool?.balance ?? 0)
    case "updated":
      return (
        +new Date(a.pool?.recorded_at ?? 0) -
        +new Date(b.pool?.recorded_at ?? 0)
      )
  }
}

export function sortPoolRows(
  rows: PoolRow[],
  key: SortKey,
  dir: SortDir
): PoolRow[] {
  const sorted = [...rows].sort((a, b) => compare(a, b, key))
  return dir === "desc" ? sorted.reverse() : sorted
}
