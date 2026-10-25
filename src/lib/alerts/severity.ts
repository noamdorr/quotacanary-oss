import type { AlertLevel, NotifiedLevels, NotifyMode } from "@/lib/types"

export type Severity = "healthy" | "low" | "critical"

export type PoolThresholdReading = {
  balance: number
  low: number | null
  critical: number | null
}

export type EvaluationPool = PoolThresholdReading & {
  creditType: string
  label: string
  unit: string | null
}

export type AlertEvaluation = {
  connectionId: string
  userId: string
  toolName: string
  connectionName: string
  topupUrl: string | null
  alertEnabled: boolean
  severity: Severity
  notifiedLevel: AlertLevel
  // Per-pool high-water marks keyed by credit_type. The connection-level
  // `notifiedLevel` above is the rollup of this map, kept for the "Alerted"
  // badge and for recovery; every alerting decision reads the map.
  notifiedLevels: NotifiedLevels
  pools: EvaluationPool[]
  // The connection's "stopped checking" stamp (migration 089). Non-null on a
  // good read means an earlier incident alerted, which leaves cleanup to do.
  failureAlertedAt?: string | null
}

// The pools of one escalation: the highest level newly reached on this
// connection, and the pools that reached it. Pools already marked at that
// level are excluded - they are not news.
export type Escalation = {
  level: Exclude<Severity, "healthy">
  pools: EvaluationPool[]
}

export function rank(level: Severity | AlertLevel): number {
  if (level === "critical") return 2
  if (level === "low") return 1
  return 0
}

// Inclusive `<=` throughout to match the dashboard pill (balance-status.ts): a
// balance sitting exactly on a threshold reads the same on screen and in the
// inbox.
export function poolSeverity(p: PoolThresholdReading): Severity {
  if (p.critical != null && p.balance <= p.critical) return "critical"
  if (p.low != null && p.balance <= p.low) return "low"
  return "healthy"
}

export function evaluateSeverity(pools: PoolThresholdReading[]): Severity {
  let sawLow = false
  for (const p of pools) {
    const s = poolSeverity(p)
    if (s === "critical") return "critical"
    if (s === "low") sawLow = true
  }
  return sawLow ? "low" : "healthy"
}

export function poolNotifiedLevel(
  e: Pick<AlertEvaluation, "notifiedLevels">,
  creditType: string
): AlertLevel {
  return e.notifiedLevels[creditType] ?? "none"
}

// The escalation this connection owes an alert for, or null when every pool is
// already marked at or above its current severity.
//
// Only the highest newly-reached level is alerted per poll. A lower-level pool
// crossing in the same poll keeps its mark and stays a candidate, so it gets
// its own alert on the next poll rather than being folded into a message whose
// subject line does not describe it.
export function escalation(e: AlertEvaluation): Escalation | null {
  const escalating = e.pools.filter(
    (p) => rank(poolSeverity(p)) > rank(poolNotifiedLevel(e, p.creditType))
  )
  if (escalating.length === 0) return null

  const level = escalating.some((p) => poolSeverity(p) === "critical")
    ? "critical"
    : "low"
  return { level, pools: escalating.filter((p) => poolSeverity(p) === level) }
}

// The marks this connection should carry once recovered pools are re-armed:
// a pool back above its thresholds drops its mark, and a credit_type the
// connection no longer reports drops out entirely rather than accumulating.
export function rearmedNotifiedLevels(e: AlertEvaluation): NotifiedLevels {
  const next: NotifiedLevels = {}
  for (const p of e.pools) {
    const mark = poolNotifiedLevel(e, p.creditType)
    if (mark !== "none" && poolSeverity(p) !== "healthy") {
      next[p.creditType] = mark
    }
  }
  return next
}

// The marks this connection carries once the alert for `esc` is delivered.
// Only the pools the alert actually named move, and only upward - a late
// low-level success after a critical escalation must not demote a mark. This
// mirrors record_alert_delivery_result, which does the same in SQL for the
// external-channel path.
export function advancedNotifiedLevels(
  e: AlertEvaluation,
  esc: Escalation
): NotifiedLevels {
  const next: NotifiedLevels = { ...e.notifiedLevels }
  for (const p of esc.pools) {
    if (rank(esc.level) > rank(poolNotifiedLevel(e, p.creditType))) {
      next[p.creditType] = esc.level
    }
  }
  return next
}

export function rollupNotifiedLevel(levels: NotifiedLevels): AlertLevel {
  let highest: AlertLevel = "none"
  for (const level of Object.values(levels)) {
    if (rank(level) > rank(highest)) highest = level
  }
  return highest
}

// Whether an escalation that already qualifies for an alert also earns an
// email. The escalate-only rule lives in `escalation` above; this is only the
// user's notify_mode gate.
export function shouldSendEmail(input: {
  level: Exclude<Severity, "healthy">
  notifyMode: NotifyMode
  alertEnabled: boolean
}): boolean {
  const { level, notifyMode, alertEnabled } = input
  if (!alertEnabled || notifyMode === "off") return false
  if (notifyMode === "critical") return level === "critical"
  return true
}
