// Contract tests for server.mjs: the headers the Next proxy used to set, the
// www -> apex redirect and the 404. Runs against the built dist/ (npm run
// build first; CI does).
import assert from "node:assert/strict"
import { createServer } from "node:http"
import { after, before, describe, it } from "node:test"

process.env.CANONICAL_HOST = "quotacanary.com"
const {
  MAC_RELEASE_REPO,
  buildContentSecurityPolicy,
  latestMacVersion,
  macDownloadLocation,
  plausibleOrigin,
  requestHandler,
} = await import("../server.mjs")

describe("content security policy", () => {
  it("has no inline scripts and no nonce", () => {
    const csp = buildContentSecurityPolicy(null)
    assert.match(csp, /script-src 'self';/)
    assert.doesNotMatch(csp, /unsafe-inline'[^;]*;.*script-src|script-src[^;]*unsafe-inline/)
    assert.doesNotMatch(csp, /nonce/)
    assert.match(csp, /frame-ancestors 'none'/)
    assert.match(csp, /object-src 'none'/)
  })

  it("admits the analytics origin only when PLAUSIBLE_SCRIPT_SRC parses", () => {
    assert.equal(plausibleOrigin("https://plausible.example.com/js/pa-1.js"), "https://plausible.example.com")
    assert.equal(plausibleOrigin("not a url"), null)
    assert.equal(plausibleOrigin(undefined), null)
    const csp = buildContentSecurityPolicy("https://plausible.example.com")
    assert.match(csp, /script-src 'self' https:\/\/plausible\.example\.com;/)
    assert.match(csp, /connect-src 'self' https:\/\/plausible\.example\.com;/)
  })
})

describe("request handling", () => {
  let server
  let base
  before(async () => {
    server = createServer(requestHandler)
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
    base = `http://127.0.0.1:${server.address().port}`
  })
  after(() => server.close())

  // fetch() drops a custom Host header, so the tests speak through the
  // X-Forwarded-Host that Railway's proxy sets; server.mjs reads it first.
  const get = (path, { host } = {}) =>
    fetch(`${base}${path}`, { headers: host ? { "x-forwarded-host": host } : {}, redirect: "manual" })

  it("serves the homepage with the security headers", async () => {
    const res = await get("/", { host: "quotacanary.com" })
    assert.equal(res.status, 200)
    assert.ok(res.headers.get("content-security-policy"))
    assert.equal(res.headers.get("x-frame-options"), "DENY")
    assert.equal(res.headers.get("x-content-type-options"), "nosniff")
    assert.match(res.headers.get("strict-transport-security"), /max-age=31536000/)
    assert.match(await res.text(), /<title>QuotaCanary/)
    // Pages revalidate every time; only hashed assets are cached hard.
    assert.equal(res.headers.get("cache-control"), "no-cache")
    const asset = await get("/logo.png", { host: "quotacanary.com" })
    assert.match(asset.headers.get("cache-control"), /max-age=3600/)
  })

  it("serves the directory and a tool page at their Next-era paths", async () => {
    for (const path of ["/directory", "/directory/hunter", "/security", "/privacy", "/terms"]) {
      const res = await get(path, { host: "quotacanary.com" })
      assert.equal(res.status, 200, path)
    }
  })

  it("redirects www and trailing slashes to the canonical URL, once", async () => {
    const www = await get("/docs?x=1", { host: "www.quotacanary.com" })
    assert.equal(www.status, 301)
    assert.equal(www.headers.get("location"), "https://quotacanary.com/docs?x=1")

    // /mac folded into the homepage; the Mac app's update files under /mac/ are not pages.
    const mac = await get("/mac", { host: "quotacanary.com" })
    assert.equal(mac.status, 301)
    assert.equal(mac.headers.get("location"), "/#download")

    const slash = await get("/directory/", { host: "quotacanary.com" })
    assert.equal(slash.status, 301)
    assert.equal(slash.headers.get("location"), "/directory")

    // Railway's own hostname and the health check are left alone.
    const railway = await get("/healthz", { host: "site-production.up.railway.app" })
    assert.equal(railway.status, 200)
  })

  it("redirects retired API docs and removes account paths from every built page", async () => {
    const docs = await get("/docs", { host: "quotacanary.com" })
    assert.equal(docs.status, 301)
    assert.equal(docs.headers.get("location"), "/")
    for (const path of ["/", "/security", "/privacy", "/terms", "/directory/hunter"]) {
      const html = await (await get(path, { host: "quotacanary.com" })).text()
      assert.doesNotMatch(html, /app\.quotacanary|hosted-window|>Sign in<|>Sign up/)
      // Directory pitches use the concise approved copy; limits live in the FAQ.
      if (!path.startsWith("/directory/")) assert.match(html, /awake and online/)
    }
    const home = await (await get("/", { host: "quotacanary.com" })).text()
    assert.match(home, /app version, macOS version and chip/)
    assert.match(home, /SELF_HOSTING\.md/)
    assert.match(home, /href="\/#download"/)
  })

  it("answers unknown paths with the 404 page and a 404 status", async () => {
    const res = await get("/directory/not-a-tool", { host: "quotacanary.com" })
    assert.equal(res.status, 404)
    assert.match(await res.text(), /This page doesn/)
  })

  it("serves robots.txt and the sitemap with every tool page", async () => {
    const robots = await (await get("/robots.txt", { host: "quotacanary.com" })).text()
    assert.match(robots, /Sitemap: https:\/\/quotacanary\.com\/sitemap\.xml/)
    const sitemap = await (await get("/sitemap.xml", { host: "quotacanary.com" })).text()
    assert.match(sitemap, /<loc>https:\/\/quotacanary\.com\/directory\/hunter<\/loc>/)
    assert.doesNotMatch(sitemap, /<loc>https:\/\/quotacanary\.com\/docs<\/loc>/)
  })
})

describe("mac downloads", () => {
  const asset = (v, ext = "zip") =>
    `https://github.com/${MAC_RELEASE_REPO}/releases/download/mac-v${v}/QuotaCanary-${v}.${ext}`

  it("sends a versioned archive to its release asset on the public mirror", () => {
    assert.equal(macDownloadLocation("/mac/QuotaCanary-0.1.0.zip", null), asset("0.1.0"))
    assert.equal(macDownloadLocation("/mac/QuotaCanary-12.3.45.zip", "0.1.0"), asset("12.3.45"))
  })

  it("sends a versioned disk image to its release asset too", () => {
    assert.equal(macDownloadLocation("/mac/QuotaCanary-0.1.0.dmg", null), asset("0.1.0", "dmg"))
  })

  it("sends /download/mac to the disk image of the version the feed names", () => {
    assert.equal(macDownloadLocation("/download/mac", "0.2.0"), "/mac/QuotaCanary-0.2.0.dmg")
    // No feed yet: nothing to point at, so the path stays a 404.
    assert.equal(macDownloadLocation("/download/mac", null), null)
  })

  it("leaves every other path alone", () => {
    for (const path of [
      "/mac/updates.json",
      "/mac/panel.webp",
      "/mac/QuotaCanary-latest.zip",
      "/mac/QuotaCanary-0.1.zip",
      "/mac/QuotaCanary-0.1.0.zip.sha256",
      "/mac/QuotaCanary-0.1.0.dmg.sha256",
      "/mac/QuotaCanary-0.1.0.pkg",
      "/mac/../QuotaCanary-0.1.0.zip",
      "/download",
    ]) {
      assert.equal(macDownloadLocation(path, "0.1.0"), null, path)
    }
  })

  it("reads the latest version from the feed text and nothing else", () => {
    assert.equal(latestMacVersion('{"version":"0.1.0","url":"x"}'), "0.1.0")
    assert.equal(latestMacVersion('{"version":"0.1.0/../x"}'), null)
    assert.equal(latestMacVersion("not json"), null)
    assert.equal(latestMacVersion(null), null)
  })

  describe("over http", () => {
    let server
    let base
    before(async () => {
      server = createServer(requestHandler)
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
      base = `http://127.0.0.1:${server.address().port}`
    })
    after(() => server.close())

    it("302s a versioned archive and never caches the hop", async () => {
      const res = await fetch(`${base}/mac/QuotaCanary-0.1.0.zip`, {
        headers: { "x-forwarded-host": "quotacanary.com" },
        redirect: "manual",
      })
      assert.equal(res.status, 302)
      assert.equal(res.headers.get("location"), asset("0.1.0"))
      assert.equal(res.headers.get("cache-control"), "no-store")
    })

    it("serves the update feed as small uncached JSON when the build has one", async (t) => {
      const res = await fetch(`${base}/mac/updates.json`, {
        headers: { "x-forwarded-host": "quotacanary.com" },
      })
      if (res.status === 404) return t.skip("no site/public/mac/updates.json in this build")
      assert.equal(res.status, 200)
      assert.match(res.headers.get("content-type"), /^application\/json/)
      assert.equal(res.headers.get("cache-control"), "no-cache")
      const body = await res.text()
      assert.ok(body.length < 64 * 1024)
      const feed = JSON.parse(body)
      assert.equal(feed.url, `https://quotacanary.com/mac/QuotaCanary-${feed.version}.zip`)
      const latest = await fetch(`${base}/download/mac`, {
        headers: { "x-forwarded-host": "quotacanary.com" },
        redirect: "manual",
      })
      assert.equal(latest.status, 302)
      assert.equal(latest.headers.get("location"), `/mac/QuotaCanary-${feed.version}.dmg`)
    })
  })
})
