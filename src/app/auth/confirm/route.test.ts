import { NextRequest } from "next/server"
import { describe, expect, it, vi } from "vitest"

// The route only needs a client whose auth calls succeed; cookie plumbing and
// env are irrelevant to the redirect-target logic under test.
vi.mock("@/lib/supabase/server", () => ({
  createRouteClient: () => ({
    auth: {
      exchangeCodeForSession: async () => ({ error: null }),
      verifyOtp: async () => ({ error: null }),
    },
  }),
}))

import { GET } from "./route"

function confirm(query: string) {
  return GET(new NextRequest(`http://localhost:3000/auth/confirm${query}`))
}

describe("GET /auth/confirm", () => {
  it("redirects to a relative next path after a successful exchange", async () => {
    const res = await confirm("?code=x&next=/settings")
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("/settings")
  })

  it("rejects a scheme-relative next (//evil.com)", async () => {
    const res = await confirm("?code=x&next=//evil.com")
    expect(res.headers.get("location")).toBe("/dashboard")
  })

  it("rejects a backslash next (/\\evil.com, browser-normalized to //)", async () => {
    // Encoded so searchParams.get returns the raw backslash.
    const res = await confirm("?code=x&next=%2F%5Cevil.com")
    expect(res.headers.get("location")).toBe("/dashboard")
  })

  it("rejects an absolute next URL", async () => {
    const res = await confirm("?code=x&next=https://evil.com")
    expect(res.headers.get("location")).toBe("/dashboard")
  })

  it("defaults to /dashboard when next is absent", async () => {
    const res = await confirm("?code=x")
    expect(res.headers.get("location")).toBe("/dashboard")
  })

  it("fails to login when neither code nor token_hash is present", async () => {
    const res = await confirm("")
    expect(res.headers.get("location")).toBe("/login?error=confirmation_failed")
  })
})
