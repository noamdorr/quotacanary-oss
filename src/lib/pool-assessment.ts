import {
  type BalanceLevel,
  type EffectiveStatus,
  effectiveStatus,
} from "./balance-status"
import type { BurnEta } from "./burn-eta"
import { burnRate } from "./burn-rate"
import { poolEta } from "./pool-eta"
import type { PoolRow } from "./pool-rows"
import type { ConnectionWithBalance } from "./types"

// Where a warning number comes from: the balance's own override, the
// connection, or the tool catalog default.
export type ThresholdSource = "balance" | "connection" | "tool"

export type Thresholds = { low: number | null; critical: number | null }

// Everything the dashboard and the public API agree on about one watched pool.
// Callers own wording and layout; the rules live here.
export type PoolAssessment = {
  // The numbers in force for this pool.
  thresholds: Thresholds
  // Which level supplied thresholds.low (the Warn below number), or null when
  // none sets one.
  source: ThresholdSource | null
  // The numbers this pool falls back to without its own override, which is
  // what saving a blank Warn below leaves in force.
  inherited: Thresholds
  status: EffectiveStatus
  tone: BalanceLevel | "neutral"
  // A trustworthy reading at or below the warning number.
  atRisk: boolean
  burn: { perDay: number; daysLeft: number } | null
  // null only for the placeholder row with no reading yet.
  eta: BurnEta | null
}

type Level = {
  source: ThresholdSource
  low: number | null
  critical: number | null
}

// The one precedence order: balance override, then connection, then tool.
function levels(c: ConnectionWithBalance, creditType: string): Level[] {
  const own = c.pool_thresholds?.[creditType]
  return [
    {
      source: "balance",
      low: own?.low ?? null,
      critical: own?.critical ?? null,
    },
    { source: "connection", low: c.low_threshold, critical: c.alert_threshold },
    {
      source: "tool",
      low: c.tool.default_low_threshold,
      critical: c.tool.default_alert_threshold,
    },
  ]
}

function first(ls: Level[], key: "low" | "critical"): Level | undefined {
  return ls.find((l) => l[key] != null)
}

function resolve(ls: Level[]): Thresholds {
  return {
    low: first(ls, "low")?.low ?? null,
    critical: first(ls, "critical")?.critical ?? null,
  }
}

// Expects a row from toPoolRows, whose connection status is already aged to
// "stale" when its newest reading is too old.
export function assessPool(row: PoolRow): PoolAssessment {
  const { connection: c, pool } = row
  const ls = levels(c, pool?.creditType ?? "")
  const thresholds = resolve(ls)
  const status = effectiveStatus({
    balance: pool?.balance ?? null,
    low: thresholds.low,
    critical: thresholds.critical,
    connectionStatus: c.status,
  })
  const tone = status.kind === "level" ? status.level : "neutral"
  return {
    thresholds,
    source: first(ls, "low")?.source ?? null,
    inherited: resolve(ls.slice(1)),
    status,
    tone,
    atRisk: tone === "low" || tone === "critical",
    burn: pool ? burnRate(pool.history) : null,
    eta: poolEta(pool),
  }
}
