import { staleAdjustedStatus } from "./balance-status"
import type { ConnectionWithBalance, PoolView } from "./types"

// One displayed row per watched pool. A connection with no readings yet still
// produces a single placeholder row (pool === null) so it stays visible.
export type PoolRow = {
  connection: ConnectionWithBalance
  pool: PoolView | null
}

// Newest reading timestamp across all of a connection's pools (null = none).
function newestRecordedAt(connection: ConnectionWithBalance): string | null {
  let newest: string | null = null
  for (const pool of connection.pools) {
    if (newest == null || pool.recorded_at > newest) newest = pool.recorded_at
  }
  return newest
}

export function toPoolRows(connections: ConnectionWithBalance[]): PoolRow[] {
  return connections.flatMap((connection): PoolRow[] => {
    // Age out connections whose newest reading is too old: an active connection
    // that stopped polling should read "stale", not keep its last green pill.
    // Done here (not in effectiveStatus) so the corrected status flows through
    // every consumer unchanged. Shallow-copy so the shared row stays untouched.
    const status = staleAdjustedStatus({
      status: connection.status,
      newestRecordedAt: newestRecordedAt(connection),
    })
    const c =
      status === connection.status ? connection : { ...connection, status }
    return c.pools.length
      ? c.pools.map((pool) => ({ connection: c, pool }))
      : [{ connection: c, pool: null }]
  })
}
