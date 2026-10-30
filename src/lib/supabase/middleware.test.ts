import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const auth = vi.hoisted(() => ({
  signedIn: false,
  refreshCookie: false,
  getUser: vi.fn(),
}))

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    options: {
      cookies: {
        setAll: (
          cookies: Array<{ name: string; value: string; options: object }>
        ) => void
      }
    }
  ) => ({
    auth: {
      getUser: async () => {
        auth.getUser()
        if (auth.refreshCookie) {
          options.cookies.setAll([
            {
              name: "session",
              value: "refreshed",
              options: { httpOnly: true },
            },
          ])
        }
        return { data: { user: auth.signedIn ? { id: "fixture-user" } : null } }
      },
    },
  }),
}))

import { updateSession } from "@/lib/supabase/middleware"

function makeRequest(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://internal.local:8080${path}`, { headers })
}

beforeEach(() => {
  // No live Supabase: the mocked client owns every auth response.
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "stub-anon-key")
  auth.signedIn = false
  auth.refreshCookie = false
  auth.getUser.mockReset()
})

afterEach(() => vi.unstubAllEnvs())

describe("same-origin self-host routing", () => {
  it.each(["", "true"])(
    "serves every host as the app with APP_ONLY=%s",
    async (flag) => {
      vi.stubEnv("APP_ONLY", flag)
      for (const host of [
        "canary.example.com",
        "www.example.com",
        "localhost:3000",
        "127.0.0.1:3000",
        "[::1]:3000",
      ]) {
        const response = await updateSession(
          makeRequest("/dashboard", { host })
        )
        expect(response.headers.get("location")).toBe(
          `http://${host}/login?next=%2Fdashboard`
        )
        expect(response.headers.get("x-robots-tag")).toBe(
          "noindex, nofollow, noarchive"
        )
      }
    }
  )

  it("prefers the forwarded public origin over the internal request origin", async () => {
    const response = await updateSession(
      makeRequest("/settings", {
        host: "localhost:8080",
        "x-forwarded-host": "canary.example.com",
        "x-forwarded-proto": "https",
      })
    )
    expect(response.headers.get("location")).toBe(
      "https://canary.example.com/login?next=%2Fsettings"
    )
  })

  it("redirects the app root to its own dashboard without an auth round trip", async () => {
    const response = await updateSession(
      makeRequest("/", { host: "canary.example.com" })
    )
    expect(response.headers.get("location")).toBe(
      "http://canary.example.com/dashboard"
    )
    expect(auth.getUser).not.toHaveBeenCalled()
  })

  it.each(["/docs", "/security", "/login?tool=hunter"])(
    "keeps %s available before sign-in",
    async (path) => {
      const response = await updateSession(
        makeRequest(path, { host: "canary.example.com" })
      )
      expect(response.status).toBe(200)
      expect(response.headers.get("location")).toBeNull()
      expect(response.headers.get("x-robots-tag")).toBe(
        "noindex, nofollow, noarchive"
      )
    }
  )

  it.each(["/docs", "/security"])(
    "serves %s without an available auth service",
    async (path) => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
      auth.getUser.mockImplementation(() => {
        throw new Error("auth unavailable")
      })
      const response = await updateSession(
        makeRequest(path, {
          host: "canary.example.com",
          "x-nonce": "fixture-nonce",
        })
      )
      expect(response.status).toBe(200)
      expect(response.headers.get("x-robots-tag")).toBe(
        "noindex, nofollow, noarchive"
      )
      expect(response.headers.get("x-middleware-request-x-nonce")).toBe(
        "fixture-nonce"
      )
      expect(auth.getUser).not.toHaveBeenCalled()
    }
  )

  it("still requires auth on protected paths when the auth service is unavailable", async () => {
    auth.getUser.mockImplementation(() => {
      throw new Error("auth unavailable")
    })
    await expect(
      updateSession(makeRequest("/settings", { host: "canary.example.com" }))
    ).rejects.toThrow("auth unavailable")
    expect(auth.getUser).toHaveBeenCalledOnce()
  })

  it("keeps a refreshed session cookie when redirecting signed-in login", async () => {
    auth.signedIn = true
    auth.refreshCookie = true
    const response = await updateSession(
      makeRequest("/login", { host: "canary.example.com" })
    )
    expect(response.headers.get("location")).toBe(
      "http://canary.example.com/dashboard"
    )
    expect(response.cookies.get("session")?.value).toBe("refreshed")
  })

  it("keeps a refreshed or cleared session cookie on the protected-route redirect", async () => {
    auth.refreshCookie = true
    const response = await updateSession(
      makeRequest("/tools/hunter", { host: "canary.example.com" })
    )
    expect(response.headers.get("location")).toBe(
      "http://canary.example.com/login?next=%2Ftools%2Fhunter"
    )
    expect(response.cookies.get("session")?.value).toBe("refreshed")
  })
})
