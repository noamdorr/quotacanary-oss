import { type BurnEta, formatBurnEta } from "@/lib/burn-eta"
import { burnRate } from "@/lib/burn-rate"
import type { PoolView } from "@/lib/types"

// Composes the existing burn-rate estimate with the human ETA phrasing.
// Returns null when there is no pool at all (no readings yet); otherwise a
// BurnEta (which itself encodes the "no burn yet" / "already gone" cases).
export function poolEta(
  pool: PoolView | null,
  now: Date = new Date()
): BurnEta | null {
  if (!pool) return null
  // A depleted pool is already gone, even with too few readings to measure a
  // burn rate. Without this, formatBurnEta(null) would caption a dead pool
  // "no burn yet / Not draining yet" - a self-contradiction for the hero.
  if (pool.balance <= 0) return formatBurnEta(0, now)
  const rate = burnRate(pool.history)
  return formatBurnEta(rate ? rate.daysLeft : null, now)
}
