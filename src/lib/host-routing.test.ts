import { resolveHost } from "@/lib/host-routing"
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
