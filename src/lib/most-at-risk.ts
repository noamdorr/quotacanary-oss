import { burnRate } from "@/lib/burn-rate"
import type { PoolRow } from "@/lib/pool-rows"

// Lower score = more urgent. dry (balance 0) is most urgent; a measurable
// countdown ranks by daysLeft; no pool / no burn ranks last.
function urgency(row: PoolRow): number {
  const pool = row.pool
  if (!pool) return Number.POSITIVE_INFINITY
  if (pool.balance <= 0) return -1
  const rate = burnRate(pool.history)
  return rate ? rate.daysLeft : Number.POSITIVE_INFINITY
}

export function mostAtRisk(rows: PoolRow[]): PoolRow | null {
  if (rows.length === 0) return null
  let best = rows[0]
  let bestScore = urgency(best)
  for (const row of rows.slice(1)) {
    const score = urgency(row)
    if (score < bestScore) {
      best = row
      bestScore = score
    }
  }
  // If nothing has measurable risk, return null (hero hides).
  return bestScore === Number.POSITIVE_INFINITY ? null : best
}
