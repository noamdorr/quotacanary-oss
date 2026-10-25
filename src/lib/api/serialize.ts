import type { EffectiveStatus } from "@/lib/balance-status"
import { formatBurnEta } from "@/lib/burn-eta"
import { assessPool } from "@/lib/pool-assessment"
import type { PoolRow } from "@/lib/pool-rows"

export type PoolPayload = {
  connectionId: string
  connectionName: string
  // Last 4 characters of the stored key, as the dashboard shows it; null when
  // none is stored. Lets a client tell two same-tool connections apart and
  // spot one it already watches with the same key (QUO-292).
  keyHint: string | null
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
// Status, thresholds, burn and ETA come from assessPool, the same assessment
// the dashboard renders, so the API can never disagree with the screen.
export function serializePoolRow(row: PoolRow): PoolPayload {
  const { connection: c, pool } = row
  const { thresholds, status, burn, eta } = assessPool(row)

  return {
    connectionId: c.id,
    connectionName: c.name,
    keyHint: c.key_hint ?? null,
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
    status: flattenStatus(status),
    burn,
    // Placeholder rows have no ETA; fall back to the app's own "no burn yet"
    // copy so the payload eta is always present.
    eta: eta ?? formatBurnEta(null),
    thresholds,
  }
}
