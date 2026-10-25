// When a hosted connection has stopped producing readings, and whether that is
// news. Before QUO-289 a failing read only set status "error": a key that died
// on the hosted side went silent while the user believed they were covered.
// Mirrors the Mac's MonitoringDecider: a rejected key alerts at once, any
// other failure on the third check in a row, and one incident alerts once.

export const STOPPED_CHECKING_THRESHOLD = 3

export type StoppedCheckingEvaluation = {
  connectionId: string
  userId: string
  toolName: string
  connectionName: string
  alertEnabled: boolean
  // Including the read that just failed.
  consecutiveFailures: number
  keyRejected: boolean
  // connections.failure_alerted_at (migration 089): stamped when the
  // incident's alert first reached a channel.
  failureAlertedAt: string | null
}

// Adapters report a failure as copy, not as a code, but every rejected key in
// the catalog and the hand-written adapters reads "<Vendor> rejected this
// key." (or "this token." / "these credentials."). Anything else falls back to
// the threshold, which errs toward a later alert, never a false one.
const REJECTED_KEY = / rejected (this key|this token|these credentials)\.$/

export function isRejectedKeyError(error: string): boolean {
  return REJECTED_KEY.test(error)
}

// Whether this failed read reaches the alert, before asking whether the
// incident was already alerted (that needs the database).
export function stoppedCheckingDue(
  e: Pick<
    StoppedCheckingEvaluation,
    "alertEnabled" | "consecutiveFailures" | "keyRejected"
  >
): boolean {
  if (!e.alertEnabled) return false
  return e.keyRejected || e.consecutiveFailures >= STOPPED_CHECKING_THRESHOLD
}

// An incident runs from the first failed read after a good one. The stamp
// belongs to the current incident only when no good read came after it: a
// manual refresh can succeed in between without the poller ever seeing it,
// and the signed-in user cannot clear the stamp (065's column grant).
export function alertedThisIncident(
  failureAlertedAt: string | null,
  lastGoodReadAt: string | null
): boolean {
  if (!failureAlertedAt) return false
  if (!lastGoodReadAt) return true
  return Date.parse(lastGoodReadAt) < Date.parse(failureAlertedAt)
}

// Copy is staged for Noam's pick (QUO-289 PR); this is option A, worded to
// match the Mac's monitoring notifications.
export function stoppedCheckingTitle(toolName: string): string {
  return `${toolName} isn't being checked`
}

export function stoppedCheckingBody(
  e: Pick<
    StoppedCheckingEvaluation,
    "toolName" | "connectionName" | "consecutiveFailures" | "keyRejected"
  >
): string {
  if (e.keyRejected) {
    return `${e.toolName} rejected the saved key for ${e.connectionName}, so its balance isn't being checked. Replace the key to start again.`
  }
  return `${e.consecutiveFailures} checks in a row failed for ${e.connectionName}, so its balance isn't being checked. Balances shown are from the last good check.`
}
