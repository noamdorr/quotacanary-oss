import { effectiveStatus } from "@/lib/balance-status"
import type { EffectiveStatus } from "@/lib/balance-status"
import { formatBurnEta } from "@/lib/burn-eta"
import { burnRate } from "@/lib/burn-rate"
import { poolEta } from "@/lib/pool-eta"
import type { PoolRow } from "@/lib/pool-rows"
import { resolvePoolThresholds } from "@/lib/thresholds"

export type PoolPayload = {
  connectionId: string
  connectionName: string
  tool: { id: string; name: string; topupUrl: string | null }
  creditType: string | null
  label: string | null
  unit: string | null
  balance: number | null
  balanceLimit: number | null
  recordedAt: string | null
  status:
    | "healthy"
    | "low"
    | "critical"
    | "stale"
    | "error"
    | "disconnected"
    | "nodata"
  burn: { perDay: number; daysLeft: number } | null
  eta: { short: string; long: string }
  thresholds: { low: number | null; critical: number | null }
}

// Collapses the EffectiveStatus discriminated union to a flat string.
// Exhaustive: TypeScript will error if a new variant is added and not covered.
export function flattenStatus(s: EffectiveStatus): PoolPayload["status"] {
  switch (s.kind) {
    case "level":
      return s.level
    case "connection":
      return s.status
    case "nodata":
      return "nodata"
  }
}

// Serializes a PoolRow (connection + optional pool) to a clean API payload.
// Mirrors the exact status/burn/eta composition used in ConnectionRow and
// ConnectionCard: resolvePoolThresholds -> effectiveStatus -> poolEta.
// The connection.status in the row is already stale-adjusted (toPoolRows does
// this before handing rows to consumers).
export function serializePoolRow(row: PoolRow): PoolPayload {
  const { connection: c, pool } = row

  // Mirror dashboard: resolvePoolThresholds(c, pool?.creditType ?? "")
  const thresholds = resolvePoolThresholds(c, pool?.creditType ?? "")

  // Mirror dashboard: effectiveStatus with pool balance (null when no pool)
  const status = flattenStatus(
    effectiveStatus({
      balance: pool?.balance ?? null,
      low: thresholds.low,
      critical: thresholds.critical,
      connectionStatus: c.status,
    })
  )

  // Mirror dashboard: poolEta(pool) -> { short, long } or null when there's no
  // pool. Fall back to the app's own formatBurnEta(null) so the "no burn yet"
  // copy stays in one place (no drift) and the payload eta is always present.
  const eta = poolEta(pool) ?? formatBurnEta(null)

  // burn is separate from eta so consumers can use numeric values
  const burn = pool ? burnRate(pool.history) : null

  return {
    connectionId: c.id,
    connectionName: c.name,
    tool: {
      id: c.tool.id,
      name: c.tool.name,
      topupUrl: c.tool.topup_url,
    },
    creditType: pool?.creditType ?? null,
    label: pool?.label ?? null,
    unit: pool?.unit ?? null,
    balance: pool?.balance ?? null,
    balanceLimit: pool?.balanceLimit ?? null,
    recordedAt: pool?.recorded_at ?? null,
    status,
    burn,
    eta,
    thresholds,
  }
}
