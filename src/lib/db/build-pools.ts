import type { PoolView } from "@/lib/types"

export type BalanceRow = {
  credit_type: string
  label: string
  unit: string
  balance: number
  balance_limit: number | null
  recorded_at: string
}

// Groups balance rows (newest-first) into one PoolView per credit_type:
// the newest row is the current value, the bounded slice is that pool's
// history. Preserves first-appearance order. When `watched` is non-null,
// only those credit_types are returned.
export function buildPools(
  rows: BalanceRow[],
  watched: string[] | null,
  limit: number
): PoolView[] {
  const groups = new Map<string, BalanceRow[]>()
  for (const row of rows) {
    const group = groups.get(row.credit_type)
    if (group) group.push(row)
    else groups.set(row.credit_type, [row])
  }

  const pools: PoolView[] = []
  for (const [creditType, group] of groups) {
    if (watched && !watched.includes(creditType)) continue
    const current = group[0]
    pools.push({
      creditType,
      label: current.label,
      unit: current.unit,
      balance: current.balance,
      balanceLimit: current.balance_limit,
      recorded_at: current.recorded_at,
      history: group
        .slice(0, limit)
        .map((r) => ({ balance: r.balance, recorded_at: r.recorded_at })),
    })
  }
  return pools
}
