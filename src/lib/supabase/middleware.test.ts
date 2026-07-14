import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// No network, no real env: getUser() always sees a signed-out visitor, which
// is enough to exercise every routing decision updateSession makes.
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}))

import { updateSession } from "@/lib/supabase/middleware"

// The request URL is the INTERNAL origin (Railway proxies to one); the public
// identity travels in the host / x-forwarded-* headers, exactly like prod.
function makeRequest(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://internal.local:8080${path}`, { headers })
}

beforeEach(() => {
  // Keep the non-APP_ONLY cases deterministic even if APP_ONLY happens to be
  // set in the developer's shell (mirrors host-routing.test.ts).
  vi.stubEnv("APP_ONLY", "")
  // The app branch reads these; the mocked client ignores the values.
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://stub.supabase.co")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "stub-anon-key")
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("updateSession on the marketing surface", () => {
  it("bounces an app path to the app subdomain", async () => {
    const res = await updateSession(
      makeRequest("/dashboard", {
        host: "quotacanary.com",
        "x-forwarded-proto": "https",
      })
    )
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe(
      "https://app.quotacanary.com/dashboard"
    )
  })

  it("strips www when bouncing and preserves the query string", async () => {
    const res = await updateSession(
      makeRequest("/login?tab=signup", {
        host: "www.quotacanary.com",
        "x-forwarded-proto": "https",
      })
    )
    expect(res.headers.get("location")).toBe(
      "https://app.quotacanary.com/login?tab=signup"
    )
  })

  it("prefers x-forwarded-host over host for the public identity", async () => {
    const res = await updateSession(
      makeRequest("/settings", {
        host: "localhost:8080",
        "x-forwarded-host": "quotacanary.com",
        "x-forwarded-proto": "https",
      })
    )
    expect(res.headers.get("location")).toBe(
      "https://app.quotacanary.com/settings"
    )
  })

  it("sends an IPv4-literal host to the marketing root instead of crashing", async () => {
    const res = await updateSession(
      makeRequest("/dashboard", { host: "127.0.0.1:3000" })
    )
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("http://127.0.0.1:3000/")
  })

  it("sends a bracketed IPv6-literal host to the marketing root", async () => {
    const res = await updateSession(
      makeRequest("/login", { host: "[::1]:3000" })
    )
    expect(res.headers.get("location")).toBe("http://[::1]:3000/")
  })

  it("passes a genuine marketing path straight through", async () => {
    const res = await updateSession(
      makeRequest("/", { host: "quotacanary.com" })
    )
    expect(res.status).toBe(200)
    expect(res.headers.get("location")).toBeNull()
  })
})

describe("updateSession on the app surface", () => {
  it("redirects an unauthenticated protected path to login on the same host", async () => {
    const res = await updateSession(
      makeRequest("/dashboard", {
        host: "app.quotacanary.com",
        "x-forwarded-proto": "https",
      })
    )
    expect(res.headers.get("location")).toBe(
      "https://app.quotacanary.com/login?next=%2Fdashboard"
    )
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive")
  })

  it("sends the app root to the dashboard", async () => {
    const res = await updateSession(
      makeRequest("/", {
        host: "app.quotacanary.com",
        "x-forwarded-proto": "https",
      })
    )
    expect(res.headers.get("location")).toBe(
      "https://app.quotacanary.com/dashboard"
    )
  })
})

describe("updateSession with APP_ONLY=true (self-host)", () => {
  it("keeps the login redirect on the self-host domain (no cross-host bounce)", async () => {
    vi.stubEnv("APP_ONLY", "true")
    const res = await updateSession(
      makeRequest("/dashboard", {
        host: "myserver.example.com",
        "x-forwarded-proto": "https",
      })
    )
    expect(res.headers.get("location")).toBe(
      "https://myserver.example.com/login?next=%2Fdashboard"
    )
  })

  it("treats an IP-literal host as the app, not a marketing bounce to /", async () => {
    vi.stubEnv("APP_ONLY", "true")
    const res = await updateSession(
      makeRequest("/dashboard", { host: "192.168.1.50:3000" })
    )
    expect(res.headers.get("location")).toBe(
      "http://192.168.1.50:3000/login?next=%2Fdashboard"
    )
  })
})
