import type { PoolThresholds } from "@/lib/types"

// The one number a user sets per balance is "Warn below" (stored as low).
// Critical is a third of it: rounded down to a whole number from 3 up, kept
// to two decimals below that. The Mac app derives it the same way (QUO-151).
export function criticalFor(warnBelow: number): number {
  return warnBelow >= 3
    ? Math.floor(warnBelow / 3)
    : Math.round((warnBelow / 3) * 100) / 100
}

// Warn below is either blank (null: fall back to the tool default) or a
// finite number above zero. NaN arrives via Number("junk") from the drawer's
// free-text input. Shared by the server action and the drawer UI.
export function warnBelowError(value: number | null): string | null {
  if (value != null && (!Number.isFinite(value) || value <= 0)) {
    return "Enter a number above zero."
  }
  return null
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
// when either is unset). Used by the connection-level setThresholds action.
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

const THRESHOLDS_SHAPE =
  "thresholds must map each credit type to { low, critical }: low above zero, critical zero or more and below low."

// The optional `thresholds` of POST /api/v1/connections (QUO-291), in the
// pool_thresholds shape. Each balance follows the web's Warn below rule; a
// missing Critical is derived like the drawer does, and a sent one (a Mac
// pair from before QUO-151) is kept as long as it sits below Warn below.
export function parsePoolThresholds(
  value: unknown
): { ok: true; thresholds: PoolThresholds } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { ok: false, error: THRESHOLDS_SHAPE }
  const entries = Object.entries(value)
  if (entries.length > 20)
    return { ok: false, error: "thresholds can name at most 20 balances." }
  const thresholds: PoolThresholds = {}
  for (const [creditType, pair] of entries) {
    if (!creditType || !pair || typeof pair !== "object" || Array.isArray(pair))
      return { ok: false, error: THRESHOLDS_SHAPE }
    const { low, critical } = pair as Record<string, unknown>
    if (typeof low !== "number" || warnBelowError(low))
      return { ok: false, error: THRESHOLDS_SHAPE }
    if (critical != null && typeof critical !== "number")
      return { ok: false, error: THRESHOLDS_SHAPE }
    const resolved = critical ?? criticalFor(low)
    if (thresholdOrderError(low, resolved))
      return { ok: false, error: THRESHOLDS_SHAPE }
    thresholds[creditType] = { low, critical: resolved }
  }
  return { ok: true, thresholds }
}
