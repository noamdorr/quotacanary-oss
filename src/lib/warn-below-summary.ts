import { formatBalance } from "./format"
import { type ThresholdSource, assessPool } from "./pool-assessment"
import type { ConnectionWithBalance, PoolView } from "./types"

// On-screen names for where a warning number comes from. A connection-level
// number applies to every balance on the connection that has none of its own.
const SOURCE_LABEL: Record<ThresholdSource, string> = {
  balance: "this balance",
  connection: "all balances",
  tool: "default",
}

export type WarnBelowSummary = {
  // The Warn below number in the balance's unit, or null when none is set.
  number: string | null
  // The same thing as a standalone phrase, for places with no column header.
  text: string
  // The red point under it, e.g. "red at 300", or null when none resolves.
  detail: string | null
  source: string | null
  // Accessible name for the control that opens the drawer to change it. It
  // carries the red point and the source too, because an aria-label replaces
  // the control's own text and those sit outside it.
  label: string
}

// Said once, after a first connection, wherever that connection is confirmed:
// the dashboard's confirmation card and the onboarding success step.
export const WARN_BELOW_FIRST_RUN_HINT =
  "Each balance warns you below its number. Change it any time from the dashboard."

// What a dashboard row, a card, and the connect confirmation say about one
// balance's warning, so the three never word it differently.
export function warnBelowSummary(
  c: ConnectionWithBalance,
  pool: PoolView
): WarnBelowSummary {
  const {
    thresholds: { low, critical },
    source,
  } = assessPool({ connection: c, pool })
  const number = low != null ? formatBalance(low, pool.unit) : null
  const text = number ? `Warn below ${number}` : "Set a warning"
  const detail =
    critical != null ? `red at ${formatBalance(critical, pool.unit)}` : null
  const sourceLabel = source ? SOURCE_LABEL[source] : null
  const where = `${c.name}, ${pool.label}`
  return {
    number,
    text,
    detail,
    source: sourceLabel,
    label: number
      ? `${[text, detail, sourceLabel].filter(Boolean).join(", ")}. Change it for ${where}`
      : `${text} for ${where}`,
  }
}
