import type { AlertLevel, NotifyMode } from "@/lib/types"

export type Severity = "healthy" | "low" | "critical"

export type PoolThresholdReading = {
  balance: number
  low: number | null
  critical: number | null
}

export type AlertAction = {
  send: "low" | "critical" | null
  newLevel: AlertLevel
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
  pools: {
    label: string
    balance: number
    low: number | null
    critical: number | null
    unit: string | null
  }[]
}

export function rank(level: Severity | AlertLevel): number {
  if (level === "critical") return 2
  if (level === "low") return 1
  return 0
}

export function evaluateSeverity(pools: PoolThresholdReading[]): Severity {
  let sawLow = false
  for (const p of pools) {
    // Inclusive `<=` to match the dashboard pill (balance-status.ts): a balance
    // sitting exactly on a threshold reads the same on screen and in the inbox.
    if (p.critical != null && p.balance <= p.critical) return "critical"
    if (p.low != null && p.balance <= p.low) sawLow = true
  }
  return sawLow ? "low" : "healthy"
}

export function nextAlertAction(input: {
  severity: Severity
  notifiedLevel: AlertLevel
  notifyMode: NotifyMode
  alertEnabled: boolean
}): AlertAction {
  const { severity, notifiedLevel, notifyMode, alertEnabled } = input

  // Recovery always re-arms.
  if (severity === "healthy") return { send: null, newLevel: "none" }

  // Muted: no send, no state change (re-evaluated fresh if re-enabled).
  if (!alertEnabled || notifyMode === "off")
    return { send: null, newLevel: notifiedLevel }

  // Escalate-only: never re-send the same or a lower level.
  if (rank(severity) <= rank(notifiedLevel))
    return { send: null, newLevel: notifiedLevel }

  if (notifyMode === "critical") {
    return severity === "critical"
      ? { send: "critical", newLevel: "critical" }
      : { send: null, newLevel: notifiedLevel }
  }

  // low_and_critical: send the email for the newly-reached level.
  return { send: severity, newLevel: severity }
}
