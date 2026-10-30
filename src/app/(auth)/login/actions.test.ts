import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type OtpRequest = { email: string; options: { emailRedirectTo: string } }
type OtpResponse = { error: { message: string } | null }

const signInWithOtp = vi.fn(
  async (_request: OtpRequest): Promise<OtpResponse> => ({ error: null })
)

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signInWithOtp } }),
}))

import { sendMagicLink } from "./actions"

function form(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

function sentRedirect() {
  return signInWithOtp.mock.calls[0]?.[0].options.emailRedirectTo
}

describe("sendMagicLink tool intent (QUO-14)", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://selfhost.example")
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it("sends the bare confirm URL when no tool was selected", async () => {
    await sendMagicLink(form({ email: "a@b.com" }))

    expect(sentRedirect()).toBe("https://selfhost.example/auth/confirm")
  })

  it("carries a valid tool id through as an encoded next param", async () => {
    await sendMagicLink(form({ email: "a@b.com", tool: "neverbounce" }))

    const url = new URL(sentRedirect())
    expect(url.pathname).toBe("/auth/confirm")
    expect(url.searchParams.get("next")).toBe("/connect?tool=neverbounce")
  })

  it("drops a malformed tool id rather than failing the sign-in", async () => {
    await sendMagicLink(form({ email: "a@b.com", tool: "../../admin" }))

    expect(sentRedirect()).toBe("https://selfhost.example/auth/confirm")
  })

  it("cannot be used to widen the redirect past the confirm route", async () => {
    await sendMagicLink(
      form({ email: "a@b.com", tool: "neverbounce&next=https://evil.com" })
    )

    expect(sentRedirect()).toBe("https://selfhost.example/auth/confirm")
  })

  it("still surfaces a friendly auth error with a tool intent attached", async () => {
    signInWithOtp.mockResolvedValueOnce({
      error: {
        message:
          "For security purposes, you can only request this after 51 seconds.",
      },
    })

    const result = await sendMagicLink(
      form({ email: "a@b.com", tool: "neverbounce" })
    )

    expect(result).toEqual({
      error: "Too many requests. Wait a minute, then try again.",
    })
  })
})
