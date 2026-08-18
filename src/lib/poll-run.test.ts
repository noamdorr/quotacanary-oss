import { describe, expect, it } from "vitest"
import {
  POLL_FAILURE_THRESHOLD,
  POLL_INTERVAL_MINUTES,
  classifyPollRun,
  missedRunsSince,
} from "./poll-run"

describe("classifyPollRun", () => {
  it("calls a clean run ok", () => {
    expect(
      classifyPollRun({
        polled: 4,
        failed: 0,
        alertsFailed: 0,
        alertsDegraded: false,
      })
    ).toBe("ok")
  })

  it("calls a run with nothing to poll ok rather than failed", () => {
    // An empty instance divides by zero otherwise, and "no connections" is a
    // healthy state, not a broken cron.
    expect(
      classifyPollRun({
        polled: 0,
        failed: 0,
        alertsFailed: 0,
        alertsDegraded: false,
      })
    ).toBe("ok")
  })

  it("calls a minority of refresh failures degraded", () => {
    // One flaky vendor must not turn the whole run red: the remaining balances
    // did refresh, and a red run per bad vendor trains the operator to ignore
    // the alarm.
    expect(
      classifyPollRun({
        polled: 4,
        failed: 1,
        alertsFailed: 0,
        alertsDegraded: false,
      })
    ).toBe("degraded")
  })

  it("calls refresh failures at the threshold failed", () => {
    expect(
      classifyPollRun({
        polled: 4,
        failed: 2,
        alertsFailed: 0,
        alertsDegraded: false,
      })
    ).toBe("failed")
  })

  it("calls a run where every refresh failed failed", () => {
    // The exact case the endpoint used to answer 200 to: no balance in the
    // instance moved, and monitoring saw a healthy cron.
    expect(
      classifyPollRun({
        polled: 3,
        failed: 3,
        alertsFailed: 0,
        alertsDegraded: false,
      })
    ).toBe("failed")
  })

  it("calls a degraded alert dispatch failed even when every refresh worked", () => {
    // dispatchAlerts sets degraded only when the delivery loop could not run to
    // completion, which is the run failing half its job: balances are fresh but
    // nobody is being told they are low.
    expect(
      classifyPollRun({
        polled: 4,
        failed: 0,
        alertsFailed: 0,
        alertsDegraded: true,
      })
    ).toBe("failed")
  })

  it("calls individual send failures degraded, not failed", () => {
    // A bounced email or a dead webhook is per-destination and already retried
    // with backoff; the loop itself ran.
    expect(
      classifyPollRun({
        polled: 4,
        failed: 0,
        alertsFailed: 2,
        alertsDegraded: false,
      })
    ).toBe("degraded")
  })

  it("keeps the failure threshold at a majority of connections", () => {
    expect(POLL_FAILURE_THRESHOLD).toBe(0.5)
  })
})

describe("missedRunsSince", () => {
  const now = new Date("2026-08-07T12:00:00Z")

  it("reports no miss when the previous run is one interval back", () => {
    expect(
      missedRunsSince(new Date("2026-08-07T11:45:00Z").toISOString(), now)
    ).toBe(0)
  })

  it("tolerates a late run without calling it a miss", () => {
    // Cron jitter and a slow run must not read as a skipped schedule.
    expect(
      missedRunsSince(new Date("2026-08-07T11:39:00Z").toISOString(), now)
    ).toBe(0)
  })

  it("counts the runs a paused schedule swallowed", () => {
    // 12:00 minus 10:00 is two hours: eight 15-minute slots, seven of them
    // missed before this one.
    expect(
      missedRunsSince(new Date("2026-08-07T10:00:00Z").toISOString(), now)
    ).toBe(7)
  })

  it("reports no miss when there is no previous run", () => {
    // A fresh install has no history; that is not a skipped schedule.
    expect(missedRunsSince(null, now)).toBe(0)
  })

  it("ignores an unparseable timestamp instead of reporting a false miss", () => {
    expect(missedRunsSince("not a date", now)).toBe(0)
  })

  it("never reports a negative count for a clock that jumped backwards", () => {
    expect(
      missedRunsSince(new Date("2026-08-07T12:30:00Z").toISOString(), now)
    ).toBe(0)
  })

  it("keeps the declared interval matching the hosted schedule", () => {
    expect(POLL_INTERVAL_MINUTES).toBe(15)
  })
})
