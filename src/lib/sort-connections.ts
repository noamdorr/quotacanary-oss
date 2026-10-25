import { runwayRank } from "@/lib/most-at-risk"
import { assessPool } from "@/lib/pool-assessment"
import type { PoolRow } from "@/lib/pool-rows"

export type SortKey = "name" | "status" | "balance" | "updated"
export type SortDir = "asc" | "desc"

// Lower rank = more urgent → shown first when sorting status ascending.
function severity(r: PoolRow): number {
  const s = assessPool(r).status
  if (s.kind === "connection") return s.status === "stale" ? 2 : 0
  // "No data" is low urgency - we don't know it's at risk, so it sorts after
  // every real level (below even healthy).
  if (s.kind === "nodata") return 5
  return { critical: 1, low: 3, healthy: 4 }[s.level]
}

// runwayRank is Infinity for no burn, and Infinity - Infinity is NaN.
function byRunway(a: PoolRow, b: PoolRow): number {
  const x = runwayRank(a)
  const y = runwayRank(b)
  return x === y ? 0 : x < y ? -1 : 1
}

function compare(a: PoolRow, b: PoolRow, key: SortKey): number {
  switch (key) {
    case "name":
      return a.connection.name.localeCompare(b.connection.name, undefined, {
        sensitivity: "base",
      })
    case "status":
      // Warn below state first; inside a state, the shorter runway leads.
      return severity(a) - severity(b) || byRunway(a, b)
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
