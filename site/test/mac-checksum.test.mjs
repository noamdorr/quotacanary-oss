// QUO-429: the SHA-256 and tag beside Download are the served DMG's. The digest
// is a committed value (src/data/mac-dmg.json, written by mac/scripts/release.sh),
// never computed at build time. Runs against the built dist/ (npm run build first).
// CHECK_RELEASE_DIGEST=1 also compares it with GitHub's digest for the asset.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import { latestMacVersion } from "../server.mjs"

const dist = new URL("../dist/", import.meta.url)
const html = readFileSync(new URL("index.html", dist), "utf8")
const feedVersion = latestMacVersion(readFileSync(new URL("mac/updates.json", dist), "utf8"))
const { version, sha256 } = JSON.parse(readFileSync(new URL("../src/data/mac-dmg.json", import.meta.url), "utf8"))

describe("DMG checksum beside Download", () => {
  it("is for the version the feed serves", () => {
    assert.equal(version, feedVersion, "bump site/src/data/mac-dmg.json with the feed (release.sh does)")
    assert.match(sha256, /^[0-9a-f]{64}$/)
  })

  it("prints the digest, the tag and a shasum line under both buttons", () => {
    const blocks = html.match(/<details class="download-verify"[\s\S]*?<\/details>/g) ?? []
    assert.equal(blocks.length, 2)
    for (const block of blocks) {
      assert.ok(block.includes(sha256), "full digest missing")
      assert.ok(block.includes(`mac-v${version}`), "tag missing")
      assert.ok(block.includes(`shasum -a 256 ~/Downloads/QuotaCanary-${version}.dmg`), "shasum line missing")
    }
  })

  it("matches GitHub's digest for the release asset", { skip: process.env.CHECK_RELEASE_DIGEST !== "1" }, async () => {
    const res = await fetch(`https://api.github.com/repos/noamdorr/quotacanary-oss/releases/tags/mac-v${version}`)
    assert.ok(res.ok, `GitHub answered ${res.status}`)
    const asset = (await res.json()).assets.find((a) => a.name === `QuotaCanary-${version}.dmg`)
    assert.equal(asset?.digest, `sha256:${sha256}`)
  })
})
