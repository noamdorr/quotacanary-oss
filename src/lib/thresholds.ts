import type { ConnectionWithBalance } from "@/lib/types"

// Per-pool thresholds: the pool's own override, then the connection-level
// threshold, then the tool catalog default.
export function resolvePoolThresholds(
  c: ConnectionWithBalance,
  creditType: string
): { low: number | null; critical: number | null } {
  const pt = c.pool_thresholds?.[creditType]
  return {
    low: pt?.low ?? c.low_threshold ?? c.tool.default_low_threshold,
    critical:
      pt?.critical ?? c.alert_threshold ?? c.tool.default_alert_threshold,
  }
}

// A threshold is either unset or a finite, non-negative number. NaN slips in
// via Number("junk") from the drawer's free-text inputs and JSON-serializes
// to null, so without this check garbage got saved as a silent clear.
function invalidThreshold(value: number | null): boolean {
  return value != null && (!Number.isFinite(value) || value < 0)
}

// The Low warning fires at a higher balance than Critical, so when both are
// set, low must be strictly greater than critical. Returns an error message
// when a value or the pair is invalid, or null when it's fine (including
// when either is unset). Shared by the threshold server actions and the
// drawer UI.
export function thresholdOrderError(
  low: number | null,
  critical: number | null
): string | null {
  if (invalidThreshold(low) || invalidThreshold(critical)) {
    return "Thresholds must be a number, zero or more."
  }
  if (low != null && critical != null && low <= critical) {
    return "Low warning must be higher than Critical."
  }
  return null
}
