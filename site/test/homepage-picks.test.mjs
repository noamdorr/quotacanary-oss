// QUO-374: the homepage picks from 2026-10-30. Runs against the built dist/
// (npm run build first; CI does).
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

const html = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8")

describe("homepage picks", () => {
  it("puts the notarized line under both Download buttons", () => {
    const blocks = html.match(
      // QUO-406: the phone hand-off button and its status line may sit between.
      /class="button primary download-button[^"]*"[^>]*>[\s\S]*?<\/a>\s*(?:<button[^>]*handoff-button[\s\S]*?<\/span>\s*)?<p class="download-notarized"[^>]*>\s*Signed and notarized by Apple\. /g
    )
    assert.equal(blocks?.length, 2, "expected the line under the hero and closing buttons")
  })

  it("says free once and merges the data FAQs", () => {
    assert.doesNotMatch(html, /Why is it free\?/)
    assert.doesNotMatch(html, /It’s free!/)
    assert.doesNotMatch(html, /seven tabs/)
    assert.doesNotMatch(html, /What does the Mac app send you\?/)
    assert.doesNotMatch(html, /Does it touch my data/)
    assert.match(html, /What leaves my Mac\?/)
  })

  it("keeps the FAQ in the first person singular", () => {
    const faq = html.match(/<div class="faq-list"[^>]*>([\s\S]*?)<\/section>/)?.[1]
    assert.ok(faq, "no FAQ list in dist/index.html")
    assert.doesNotMatch(faq, /\b(We|we|we’ll|we’re|we’ve)\b/)
    assert.doesNotMatch(faq, /—/, "no em dashes in copy")
  })

  it("makes the pricing Download a real download and offers phones a hand-off (QUO-406)", () => {
    const pricing = html.match(/<section class="pricing-section[\s\S]*?<\/section>/)?.[0]
    assert.ok(pricing, "no pricing section")
    assert.match(pricing, /<a class="button primary plausible-event-name=Mac\+Download\+Click" href="\/download\/mac"/)
    assert.doesNotMatch(pricing, /href="\/#download"/)
    assert.equal(html.match(/<button[^>]*class="button handoff-button"/g)?.length, 2, "hand-off under hero and closing")
    assert.match(html, /data-handoff-url="https:\/\/quotacanary\.com\/#download"/)
  })

  it("names the URL-parameter key caveat beside the /security link (QUO-403)", () => {
    const answer = html.match(/What leaves my Mac\?[\s\S]*?<\/details>/)?.[0]
    assert.ok(answer, "no What leaves my Mac? entry")
    assert.match(answer, /key in the URL/)
    assert.match(answer, /href="\/security"/)
  })

  it("shows the Mac app's real low-balance alert on the run-out row (QUO-405)", () => {
    const row = html.match(/<div class="feature-row" id="eta"[\s\S]*?<\/picture>[\s\S]*?<\/div>/)?.[0]
    assert.ok(row, "no run-out row")
    // The body is pinned in mac/Tests/QuotaCanaryAppTests/PanelRowEtaTests.swift.
    assert.match(row, /<img class="feature-notification" src="\/mac\/notification\.webp" alt="[^"]*Apollo: Lead Credits low: 1,000 of 10,000 left\."/)
  })
})
