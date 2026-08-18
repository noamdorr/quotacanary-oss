import { describe, expect, it } from "vitest"
import { renderPollAlarmEmail } from "./poll-alarm"

const base = {
  outcome: "failed" as const,
  connectionsPolled: 14,
  refreshFailed: 12,
  alertsFailed: 0,
  alertsDegraded: false,
  missedRuns: 0,
}

describe("renderPollAlarmEmail", () => {
  it("names the outcome in the subject so triage needs no click", () => {
    expect(renderPollAlarmEmail(base).subject).toBe(
      "[QuotaCanary] Poll run failed"
    )
    expect(renderPollAlarmEmail({ ...base, outcome: "degraded" }).subject).toBe(
      "[QuotaCanary] Poll run degraded"
    )
  })

  it("subjects a healthy run that follows a gap as the schedule problem it is", () => {
    const { subject } = renderPollAlarmEmail({
      ...base,
      outcome: "ok",
      refreshFailed: 0,
      missedRuns: 3,
    })
    expect(subject).toBe("[QuotaCanary] Poll schedule missed 3 runs")
  })

  it("counts a single missed run in the singular", () => {
    const { subject } = renderPollAlarmEmail({
      ...base,
      outcome: "ok",
      refreshFailed: 0,
      missedRuns: 1,
    })
    expect(subject).toBe("[QuotaCanary] Poll schedule missed 1 run")
  })

  it("carries the counts that decide the playbook", () => {
    const { text } = renderPollAlarmEmail({
      ...base,
      alertsFailed: 2,
      alertsDegraded: true,
      missedRuns: 1,
    })
    expect(text).toContain("Outcome: failed")
    expect(text).toContain("Connections polled: 14")
    expect(text).toContain("Refreshes failed: 12")
    expect(text).toContain("Alert sends failed: 2")
    expect(text).toContain("Alert delivery: degraded")
    expect(text).toContain("Missed runs: 1")
  })

  it("points at the log lines that carry the cause", () => {
    // The runbook is not in the public mirror, so the email names the greppable
    // prefix instead of a repo path a self-hoster would not have.
    expect(renderPollAlarmEmail(base).text).toContain("[poll]")
  })

  it("renders the same counts in both bodies", () => {
    const { html } = renderPollAlarmEmail(base)
    expect(html).toContain("failed")
    expect(html).toContain("14")
    expect(html).toContain("12")
  })
})
