// Outcome vocabulary for a poll run (QUO-30). The route used to answer 200 for
// every run that got as far as returning, so a cron whose every refresh failed
// looked exactly like a healthy one. These definitions are what monitoring and
// the runbook (docs/runbooks/poll-cron.md) both key off.

export type PollOutcome = "ok" | "degraded" | "failed"

// Share of connection refreshes that must fail before the run counts as failed
// rather than degraded. A majority failing is a systemic fault (DB, network,
// credentials) rather than one flaky vendor.
export const POLL_FAILURE_THRESHOLD = 0.5

// The hosted schedule, declared here so the app can tell a missed run from a
// merely quiet one. railway/poll-cron.json carries the deployable form of the
// same number and a test holds the two together.
export const POLL_INTERVAL_MINUTES = 15

// Cron jitter plus a slow run can push a gap past one interval without any run
// having been skipped, so a miss only counts past this much of an interval.
const MISSED_RUN_TOLERANCE = 1.5

export type PollRunCounts = {
  polled: number
  failed: number
  alertsFailed: number
  alertsDegraded: boolean
}

export function classifyPollRun(counts: PollRunCounts): PollOutcome {
  // `alertsDegraded` means the delivery loop could not run to completion
  // (src/lib/alerts/dispatch.ts), which is the run failing half its job even
  // when every balance refreshed.
  if (counts.alertsDegraded) return "failed"
  if (
    counts.polled > 0 &&
    counts.failed / counts.polled >= POLL_FAILURE_THRESHOLD
  ) {
    return "failed"
  }
  if (counts.failed > 0 || counts.alertsFailed > 0) return "degraded"
  return "ok"
}

// How many scheduled runs went missing between `previousStartedAt` and this
// one. Zero when there is no history, when the timestamp is unusable, or when
// the gap is within tolerance - a false miss is worse than a late alarm here,
// because this is the only signal that the hosted schedule was paused or
// retimed outside the repo.
export function missedRunsSince(
  previousStartedAt: string | null,
  now: Date = new Date()
): number {
  if (!previousStartedAt) return 0
  const previous = new Date(previousStartedAt)
  if (Number.isNaN(previous.getTime())) return 0

  const gapMinutes = (now.getTime() - previous.getTime()) / 60_000
  if (gapMinutes <= POLL_INTERVAL_MINUTES * MISSED_RUN_TOLERANCE) return 0

  return Math.max(0, Math.floor(gapMinutes / POLL_INTERVAL_MINUTES) - 1)
}
