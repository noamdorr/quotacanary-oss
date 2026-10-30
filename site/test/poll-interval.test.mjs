// The FAQ says how often the Mac app checks a balance. That number lives in
// PollScheduler.nominalInterval; this fails when the site's MAC_POLL_MINUTES
// or the built FAQ stops matching it. Runs against the built dist/ (npm run
// build first; CI does).
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8")

const scheduler = read("../../mac/Sources/QuotaCanaryCore/Scheduler.swift")
const interval = scheduler.match(/nominalInterval: TimeInterval = (\d+) \* 60\b/)
const site = read("../src/lib/copy.ts").match(/MAC_POLL_MINUTES = (\d+)/)

describe("poll interval in the FAQ", () => {
  it("MAC_POLL_MINUTES equals PollScheduler.nominalInterval", () => {
    assert.ok(interval, "nominalInterval not found in Scheduler.swift")
    assert.ok(site, "MAC_POLL_MINUTES not found in copy.ts")
    assert.equal(site[1], interval[1])
  })

  it("the built homepage states that interval", () => {
    assert.match(read("../dist/index.html"), new RegExp(`about every ${interval?.[1]} minutes`))
  })
})
