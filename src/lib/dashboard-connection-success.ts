import { formatBalance } from "./format"
import { type PoolRow, toPoolRows } from "./pool-rows"
import type { ConnectionWithBalance, PoolView } from "./types"

export function connectionRowsForSuccess(
  connections: ConnectionWithBalance[],
  connectionId: string | null | undefined
): PoolRow[] {
  if (!connectionId) return []

  const connection = connections.find((c) => c.id === connectionId)
  return connection ? toPoolRows([connection]) : []
}

export function formatSuccessPoolBalance(pool: PoolView): string {
  return pool.balanceLimit != null
    ? `${formatBalance(pool.balance, pool.unit)} / ${formatBalance(
        pool.balanceLimit,
        pool.unit
      )}`
    : formatBalance(pool.balance, pool.unit)
}
