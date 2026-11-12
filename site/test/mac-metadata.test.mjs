// Check built output: homepage overrides and catalog descriptions can bypass Mac metadata.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

const dist = new URL("../dist/", import.meta.url)
const tools = JSON.parse(readFileSync(new URL("../src/data/tools.json", import.meta.url), "utf8"))
const read = (path) => readFileSync(new URL(path, dist), "utf8")
const meta = (html, key) => {
  const tag = html.match(new RegExp(`<meta (?:name|property)="${key}" content="([^"]*)"`))
  assert.ok(tag, `missing ${key}`)
  return tag[1]
}

const title = "QuotaCanary - API credit alerts in your Mac menu bar"
const description = "A free, open-source Mac menu bar app that watches your API credit balances and warns before they run out. Your keys stay on your Mac."
const shareDescription = "The bird that sings before the credits die. A Mac menu bar app for API credit balances. Local only, with keys in your Mac Keychain."

describe("Mac-only search and share metadata", () => {
  it("uses Mac-specific homepage copy for search, OG and Twitter", () => {
    const html = read("index.html")
    assert.ok(html.includes(`<title>${title}</title>`))
    assert.equal(meta(html, "description"), description)
    for (const prefix of ["og", "twitter"]) {
      assert.equal(meta(html, `${prefix}:title`), title)
      assert.equal(meta(html, `${prefix}:description`), shareDescription)
    }
  })

  it("keeps directory and every tool's search and share metadata within the Mac copy limits", () => {
    for (const path of ["directory.html", ...tools.map((tool) => `directory/${tool.id}.html`)]) {
      const html = read(path)
      const title = html.match(/<title>(.*?)<\/title>/)?.[1]
      assert.ok(title, `${path}: missing title`)
      for (const value of [title, meta(html, "og:title"), meta(html, "twitter:title")]) {
        assert.match(value, /\bMac\b/, path)
        assert.ok(value.length <= 60, `${path}: title exceeds 60 characters`)
      }
      for (const key of ["description", "og:description", "twitter:description"]) {
        const value = meta(html, key)
        assert.match(value, /\bMac\b/, path)
        assert.ok(value.length <= 155, `${path}: ${key} exceeds 155 characters`)
      }
    }
  })

  it("shares the Mac card and matching alt text across the homepage and directory", () => {
    for (const path of ["index.html", "directory.html", "directory/hunter.html"]) {
      const html = read(path)
      assert.equal(meta(html, "og:image"), "https://quotacanary.com/og.jpg")
      assert.equal(meta(html, "twitter:image"), meta(html, "og:image"))
      assert.equal(meta(html, "og:image:width"), "1920")
      assert.equal(meta(html, "og:image:height"), "1080")
      assert.match(meta(html, "og:image:alt"), /Mac-only menu bar app/)
      assert.equal(meta(html, "twitter:image:alt"), meta(html, "og:image:alt"))
    }
  })
})
