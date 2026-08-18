// Who finds out that a poll run went wrong (QUO-77). QUO-30 made the outcomes
// emittable and docs/runbooks/poll-cron.md described three signals, but nothing
// was subscribed to any of them. Railway turned out to offer neither email
// notifications nor a log drain, so the two alarms live here instead: a
// heartbeat ping to an external monitor, which is the only signal that survives
// this app being down, and an operator email, which is the only one that
// carries the run's detail.

import type { PollOutcome } from "./poll-run"

export type PollAlarmInput = {
  outcome: PollOutcome
  // The outcome of the run before this one; null when there is no history yet
  // or the lookup failed.
  previousOutcome: PollOutcome | null
  missedRuns: number
}

// Path appended to the heartbeat URL. A degraded run pings success on purpose:
// the schedule IS alive, and failing the check per flaky vendor would both page
// the operator and, worse, teach them to mute the check that also watches for a
// cron that stopped firing.
export function heartbeatSuffix(outcome: PollOutcome): "" | "/fail" {
  return outcome === "failed" ? "/fail" : ""
}

export function shouldEmailOperator(input: PollAlarmInput): boolean {
  if (input.outcome === "failed") return true
  // The schedule was paused or retimed and has come back. The heartbeat has
  // already alarmed if one is configured; this is the signal for instances
  // running the email alone.
  if (input.missedRuns > 0) return true
  // One degraded run is one flaky vendor, which the runbook says to note and
  // not to page on. Two in a row is a pattern worth an inbox.
  return (
    input.outcome === "degraded" &&
    input.previousOutcome !== null &&
    input.previousOutcome !== "ok"
  )
}
