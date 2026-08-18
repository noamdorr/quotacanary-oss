import type { SendEmailInput } from "@/lib/email/client"
import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const sendEmail = vi.fn(async (_input: SendEmailInput) => ({
  ok: true as const,
}))
const rpc = vi.fn(
  async (
    ..._args: unknown[]
  ): Promise<{ data: boolean | null; error: { message: string } | null }> => ({
    data: false,
    error: null,
  })
)
const testUser = { email: "new@user.com" }

// The route only needs a client whose auth calls succeed; cookie plumbing and
// env are irrelevant to the redirect-target logic under test.
vi.mock("@/lib/supabase/server", () => ({
  createRouteClient: () => ({
    auth: {
      exchangeCodeForSession: async () => ({
        error: null,
        data: { user: testUser },
      }),
      verifyOtp: async () => ({ error: null, data: { user: testUser } }),
    },
    rpc: (...args: unknown[]) => rpc(...args),
  }),
}))
vi.mock("@/lib/email/client", () => ({
  sendEmail: (input: SendEmailInput) => sendEmail(input),
}))

import { GET } from "./route"

function confirm(query: string) {
  return GET(new NextRequest(`http://localhost:3000/auth/confirm${query}`))
}

describe("GET /auth/confirm", () => {
  afterEach(() => {
    vi.clearAllMocks()
    rpc.mockResolvedValue({ data: false, error: null })
  })

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

  it("forwards a tool intent to /connect with the id intact (QUO-14)", async () => {
    // Exactly what magicLinkRedirectUrl puts in the emailed link: the connect
    // path is one encoded `next` value, so `tool` is not read as a param here.
    const res = await confirm("?code=x&next=%2Fconnect%3Ftool%3Dneverbounce")
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("/connect?tool=neverbounce")
  })

  it("fails to login when neither code nor token_hash is present", async () => {
    const res = await confirm("")
    expect(res.headers.get("location")).toBe("/login?error=confirmation_failed")
  })
})

describe("GET /auth/confirm welcome email (QUO-74)", () => {
  afterEach(() => {
    vi.clearAllMocks()
    rpc.mockResolvedValue({ data: false, error: null })
  })

  it("sends exactly one welcome email tagged welcome when mark_user_welcomed reports a first send", async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null })

    const res = await confirm("?code=x")
    expect(res.status).toBe(307)

    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledOnce())
    expect(rpc).toHaveBeenCalledWith("mark_user_welcomed")
    const call = sendEmail.mock.calls[0][0]
    expect(call.to).toBe("new@user.com")
    expect(call.tag).toBe("welcome")
  })

  it("does not send a welcome email for a returning user (mark_user_welcomed reports no fresh send)", async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null })

    await confirm("?code=x")
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledOnce())
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("does not send when mark_user_welcomed errors, and still redirects", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "boom" },
    })

    const res = await confirm("?code=x")
    expect(res.status).toBe(307)
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledOnce())
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("redirect does not wait on the welcome-email send (fire-and-forget)", async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null })
    sendEmail.mockImplementationOnce(() => new Promise(() => {}))

    const res = await confirm("?code=x")
    expect(res.status).toBe(307)
  })

  it("works on the OTP flow too", async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null })

    await confirm("?token_hash=abc&type=magiclink")
    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledOnce())
  })
})
