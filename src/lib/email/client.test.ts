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
    expect(res).toEqual({ ok: false, error: "Postmark error 422" })
    // The error body echoes the recipient address (PII); it must not be
    // pulled into logs.
    expect(textMock).not.toHaveBeenCalled()
  })
})
