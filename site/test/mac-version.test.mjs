// QUO-402: the version beside Download is the version the download serves.
// server.mjs names the DMG from the feed in dist/mac/updates.json; the page
// must print that same version and link to its release. Runs against the
// built dist/ (npm run build first; CI does).
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import { latestMacVersion, macDownloadLocation } from "../server.mjs"

const dist = new URL("../dist/", import.meta.url)
const html = readFileSync(new URL("index.html", dist), "utf8")
const version = latestMacVersion(readFileSync(new URL("mac/updates.json", dist), "utf8"))

describe("Mac version beside Download", () => {
  it("reads a version from the feed", () => {
    assert.match(version ?? "", /^\d+\.\d+\.\d+$/)
  })

  it("names the version the download serves, under both buttons", () => {
    assert.equal(macDownloadLocation("/download/mac", version), `/mac/QuotaCanary-${version}.dmg`)
    const lines = html.match(/<p class="download-notarized"[^>]*>[\s\S]*?<\/p>/g) ?? []
    assert.equal(lines.length, 2)
    for (const line of lines) {
      assert.ok(line.includes(`v${version},`), `no v${version} in ${line}`)
      assert.match(line, new RegExp(`href="https://github\\.com/noamdorr/quotacanary-oss/releases/tag/mac-v${version.replaceAll(".", "\\.")}"`))
    }
  })

  it("prints no other version", () => {
    const others = [...html.matchAll(/\bv(\d+\.\d+\.\d+)\b/g)].map((m) => m[1]).filter((v) => v !== version)
    assert.deepEqual(others, [])
  })
})
