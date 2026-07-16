import { afterEach, describe, expect, it, vi } from "vitest"
import { sendEmail } from "./client"

describe("sendEmail", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("returns an error when the token is missing", async () => {
    vi.stubEnv("POSTMARK_SERVER_TOKEN", "")
    const res = await sendEmail({
      to: "a@b.com",
      subject: "s",
      html: "<p>h</p>",
      text: "h",
    })
    expect(res.ok).toBe(false)
  })

  it("posts to Postmark with the token header on success", async () => {
    vi.stubEnv("POSTMARK_SERVER_TOKEN", "tok-123")
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, text: async () => "" })
    vi.stubGlobal("fetch", fetchMock)

    const res = await sendEmail({
      to: "a@b.com",
      subject: "Low",
      html: "<p>h</p>",
      text: "h",
      tag: "alert-low",
    })

    expect(res.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe("https://api.postmarkapp.com/email")
    expect(opts.headers["X-Postmark-Server-Token"]).toBe("tok-123")
    const body = JSON.parse(opts.body)
    expect(body.To).toBe("a@b.com")
    expect(body.From).toContain("hey@quotacanary.com")
    expect(body.MessageStream).toBe("outbound")
  })

  it("sends with a 10-second timeout signal", async () => {
    vi.stubEnv("POSTMARK_SERVER_TOKEN", "tok-123")
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout")
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, text: async () => "" })
    vi.stubGlobal("fetch", fetchMock)

    await sendEmail({
      to: "a@b.com",
      subject: "s",
      html: "<p>h</p>",
      text: "h",
    })

    expect(timeoutSpy).toHaveBeenCalledWith(10_000)
    const [, opts] = fetchMock.mock.calls[0]
    expect(opts.signal).toBeInstanceOf(AbortSignal)
    timeoutSpy.mockRestore()
  })

  it("classifies 5xx and 429 responses as retryable", async () => {
    vi.stubEnv("POSTMARK_SERVER_TOKEN", "tok-123")
    for (const status of [500, 503, 429, 408, 425]) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: false, status, text: async () => "" })
      )
      const res = await sendEmail({
        to: "a@b.com",
        subject: "s",
        html: "<p>h</p>",
        text: "h",
      })
      expect(res).toEqual({
        ok: false,
        error: `Postmark error ${status}`,
        retryable: true,
      })
    }
  })

  it("classifies other 4xx responses as not retryable", async () => {
    vi.stubEnv("POSTMARK_SERVER_TOKEN", "tok-123")
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: false, status: 422, text: async () => "" })
    )
    const res = await sendEmail({
      to: "a@b.com",
      subject: "s",
      html: "<p>h</p>",
      text: "h",
    })
    expect(res).toEqual({
      ok: false,
      error: "Postmark error 422",
      retryable: false,
    })
  })

  it("classifies network failures as retryable", async () => {
    vi.stubEnv("POSTMARK_SERVER_TOKEN", "tok-123")
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")))
    const res = await sendEmail({
      to: "a@b.com",
      subject: "s",
      html: "<p>h</p>",
      text: "h",
    })
    expect(res).toEqual({
      ok: false,
      error: "Email send failed.",
      retryable: true,
    })
  })

  it("classifies a missing token as retryable so a later config fix recovers", async () => {
    vi.stubEnv("POSTMARK_SERVER_TOKEN", "")
    const res = await sendEmail({
      to: "a@b.com",
      subject: "s",
      html: "<p>h</p>",
      text: "h",
    })
    expect(res).toEqual({
      ok: false,
      error: "Email not configured.",
      retryable: true,
    })
  })

  it("returns an error on a non-2xx response without reading the body", async () => {
    vi.stubEnv("POSTMARK_SERVER_TOKEN", "tok-123")
    const textMock = vi.fn(async () => "bad")
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 422, text: textMock })
    )
    const res = await sendEmail({
      to: "a@b.com",
      subject: "s",
      html: "<p>h</p>",
      text: "h",
    })
    expect(res).toEqual({
      ok: false,
      error: "Postmark error 422",
      retryable: false,
    })
    // The error body echoes the recipient address (PII); it must not be
    // pulled into logs.
    expect(textMock).not.toHaveBeenCalled()
  })
})
