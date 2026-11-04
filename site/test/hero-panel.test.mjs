// QUO-432: the hero's menu bar panel reads as the real Mac popover - the
// system face throughout, no run-out captions, and a Canary Gold bird.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const html = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8")
const css = readFileSync(new URL("../src/styles/site.css", import.meta.url), "utf8")
const panel = html.match(/<div class="desk-panel[\s\S]*?Quit QuotaCanary/)?.[0] ?? ""

test("the panel is on the page", () => {
  assert.ok(panel.includes("Needs attention"))
})

test("no row carries a run-out caption", () => {
  assert.doesNotMatch(panel, /tomorrow|in ~\d+ (day|week|month)s?|in ~1 month/)
  assert.doesNotMatch(panel, /class="dp-num"[^>]*><small>/)
})

test("no monospace face anywhere in the panel or menu bar rules", () => {
  const rules = css.split("\n").filter((line) => /\.(dp-|desk-panel|desk-bar|desk-bird)/.test(line))
  for (const rule of rules) assert.doesNotMatch(rule, /JetBrains Mono|monospace/, rule)
})

test("the menu bar bird is Canary Gold", () => {
  const bird = html.match(/<button class="desk-bird"[\s\S]*?<\/button>/)?.[0] ?? ""
  assert.match(bird, /fill="#FFC400"/i)
})
