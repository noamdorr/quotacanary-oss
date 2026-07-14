import {
  isAppOnlyPath,
  isIpLiteralHost,
  isProtectedAppPath,
  resolveHost,
} from "@/lib/host-routing"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

describe("resolveHost", () => {
  it("treats the app subdomain as the app surface", () => {
    expect(resolveHost("app.quotacanary.com")).toBe("app")
  })

  it("treats the apex domain as marketing", () => {
    expect(resolveHost("quotacanary.com")).toBe("marketing")
  })

  it("treats www as marketing", () => {
    expect(resolveHost("www.quotacanary.com")).toBe("marketing")
  })

  it("strips a port before deciding", () => {
    expect(resolveHost("app.quotacanary.com:3000")).toBe("app")
  })

  it("treats bare localhost as the app (local dev default)", () => {
    expect(resolveHost("localhost:3000")).toBe("app")
  })

  it("treats app.localhost as the app", () => {
    expect(resolveHost("app.localhost:3000")).toBe("app")
  })

  it("treats marketing.localhost as marketing (lets devs preview the site)", () => {
    expect(resolveHost("marketing.localhost:3000")).toBe("marketing")
  })

  it("defaults an unknown/missing host to marketing", () => {
    expect(resolveHost(null)).toBe("marketing")
    expect(resolveHost("")).toBe("marketing")
  })

  it("does not treat a foreign app subdomain as the app", () => {
    expect(resolveHost("app.evil.com")).toBe("marketing")
  })

  it("does not treat app.evilquotacanary.com as the app (suffix spoof)", () => {
    expect(resolveHost("app.evilquotacanary.com")).toBe("marketing")
  })

  it("does not treat app.evil-localhost as the app (suffix spoof)", () => {
    expect(resolveHost("app.evil-localhost")).toBe("marketing")
  })

  it("keeps deeper subdomains of our own domain on the app surface", () => {
    expect(resolveHost("app.staging.quotacanary.com")).toBe("app")
  })

  beforeEach(() => {
    // Keep the non-APP_ONLY cases deterministic even if APP_ONLY happens to be
    // set in the developer's shell (e.g. a self-hoster who also contributes).
    vi.stubEnv("APP_ONLY", "")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("returns app for any host when APP_ONLY is set", () => {
    vi.stubEnv("APP_ONLY", "true")
    expect(resolveHost("canary.example.com")).toBe("app")
    expect(resolveHost("quotacanary.com")).toBe("app")
    expect(resolveHost(null)).toBe("app")
  })

  it("ignores APP_ONLY when not exactly 'true'", () => {
    vi.stubEnv("APP_ONLY", "1")
    expect(resolveHost("quotacanary.com")).toBe("marketing")
  })
})

describe("isIpLiteralHost", () => {
  it("detects IPv4 literals with and without a port", () => {
    expect(isIpLiteralHost("127.0.0.1")).toBe(true)
    expect(isIpLiteralHost("127.0.0.1:3000")).toBe(true)
    expect(isIpLiteralHost("10.0.0.7:8080")).toBe(true)
  })

  it("detects bracketed IPv6 literals with and without a port", () => {
    expect(isIpLiteralHost("[::1]")).toBe(true)
    expect(isIpLiteralHost("[::1]:3000")).toBe(true)
  })

  it("leaves named hosts (and empty) alone", () => {
    expect(isIpLiteralHost("quotacanary.com")).toBe(false)
    expect(isIpLiteralHost("app.quotacanary.com:443")).toBe(false)
    expect(isIpLiteralHost("localhost:3000")).toBe(false)
    expect(isIpLiteralHost("")).toBe(false)
  })
})

describe("isProtectedAppPath", () => {
  it("gates every (dashboard)-group route root", () => {
    for (const path of [
      "/dashboard",
      "/alerts",
      "/connect",
      "/developer",
      "/security",
      "/settings",
      "/tools",
    ]) {
      expect(isProtectedAppPath(path)).toBe(true)
    }
  })

  it("gates nested protected paths (e.g. a tool detail page)", () => {
    expect(isProtectedAppPath("/tools/openai")).toBe(true)
    expect(isProtectedAppPath("/dashboard/anything")).toBe(true)
  })

  it("leaves the (auth) routes open to anonymous users", () => {
    expect(isProtectedAppPath("/login")).toBe(false)
    expect(isProtectedAppPath("/update-password")).toBe(false)
  })

  it("leaves the marketing root and non-page routes ungated", () => {
    expect(isProtectedAppPath("/")).toBe(false)
    expect(isProtectedAppPath("/api/poll")).toBe(false)
    expect(isProtectedAppPath("/auth/confirm")).toBe(false)
    expect(isProtectedAppPath("/mcp")).toBe(false)
  })

  it("anchors on a full path segment, not a bare prefix", () => {
    expect(isProtectedAppPath("/settings-export")).toBe(false)
    expect(isProtectedAppPath("/toolsmith")).toBe(false)
    expect(isProtectedAppPath("/developer-portal")).toBe(false)
  })
})

describe("isAppOnlyPath", () => {
  it("treats every protected (dashboard) path as app-only", () => {
    for (const path of [
      "/dashboard",
      "/alerts",
      "/connect",
      "/developer",
      "/security",
      "/settings",
      "/tools",
    ]) {
      expect(isAppOnlyPath(path)).toBe(true)
    }
  })

  it("also covers the app's non-(dashboard) surface (auth, api, mcp)", () => {
    expect(isAppOnlyPath("/login")).toBe(true)
    expect(isAppOnlyPath("/update-password")).toBe(true)
    expect(isAppOnlyPath("/auth/confirm")).toBe(true)
    expect(isAppOnlyPath("/api/poll")).toBe(true)
    expect(isAppOnlyPath("/mcp")).toBe(true)
  })

  it("keeps /developer on the app surface (regression: it was omitted before)", () => {
    expect(isAppOnlyPath("/developer")).toBe(true)
  })

  it("leaves genuine marketing routes on the marketing host", () => {
    for (const path of [
      "/",
      "/directory",
      "/directory/abc",
      "/docs",
      "/privacy",
      "/terms",
      "/robots.txt",
      "/sitemap.xml",
    ]) {
      expect(isAppOnlyPath(path)).toBe(false)
    }
  })

  it("anchors on a full path segment, not a bare prefix", () => {
    expect(isAppOnlyPath("/developer-portal")).toBe(false)
    expect(isAppOnlyPath("/loginhelp")).toBe(false)
  })
})
