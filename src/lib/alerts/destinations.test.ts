import { afterEach, describe, expect, it, vi } from "vitest"
import {
  type AlertDestinationEvent,
  destinationUrlHint,
  isBlockedIp,
  isDestinationLevelAllowed,
  postAlertDestination,
  renderDestinationPayload,
  validateDestinationUrl,
} from "./destinations"

const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }))
vi.mock("node:dns/promises", () => ({ lookup }))

const event: AlertDestinationEvent = {
  id: "evt-1",
  level: "critical",
  toolName: "Hunter",
  connectionId: "conn-1",
  connectionName: "Hunter main",
  title: "Hunter is critically low",
  body: "Hunter main has 38 credits left.",
  pools: [
    {
      label: "Credits",
      balance: 38,
      threshold: 50,
      unit: "credits",
    },
  ],
  dashboardUrl: "https://app.quotacanary.com/dashboard",
  topupUrl: "https://hunter.io/welcome/upgrade",
  createdAt: "2026-06-10T10:00:00.000Z",
}

describe("alert destination payloads", () => {
  it("renders generic webhooks as QuotaCanary alert JSON", () => {
    expect(renderDestinationPayload("webhook", event)).toMatchObject({
      event: "quota.alert.critical",
      id: "evt-1",
      level: "critical",
      tool: { name: "Hunter" },
      connection: { id: "conn-1", name: "Hunter main" },
      pools: [{ label: "Credits", balance: 38, threshold: 50 }],
      dashboard_url: "https://app.quotacanary.com/dashboard",
      topup_url: "https://hunter.io/welcome/upgrade",
    })
  })

  it("renders Slack incoming webhooks as text plus blocks", () => {
    const payload = renderDestinationPayload("slack_webhook", event) as {
      text: string
      blocks: unknown[]
    }

    expect(payload.text).toContain("Hunter")
    expect(payload.text).toContain("critical")
    expect(payload.blocks.length).toBeGreaterThan(1)
  })

  it("escapes Slack mrkdwn control characters in the title and body", () => {
    const payload = renderDestinationPayload("slack_webhook", {
      ...event,
      title: "<https://evil.example|click> & co",
      body: "<https://evil.example|click> & co",
    }) as {
      text: string
      blocks: { type: string; text?: { type: string; text: string } }[]
    }

    const escaped = "&lt;https://evil.example|click&gt; &amp; co"
    expect(payload.text).toContain(escaped)
    expect(payload.text).not.toContain("<")
    const section = payload.blocks.find((b) => b.type === "section")
    expect(section?.text?.text).toContain(escaped)
    expect(section?.text?.text).not.toContain("<")
  })

  it("delivers low events only to low-or-critical destinations", () => {
    expect(isDestinationLevelAllowed("low", "low")).toBe(true)
    expect(isDestinationLevelAllowed("critical", "low")).toBe(false)
    expect(isDestinationLevelAllowed("critical", "critical")).toBe(true)
  })
})

describe("alert destination URL validation", () => {
  it("accepts public HTTPS URLs and stores only the host in the hint", () => {
    const result = validateDestinationUrl("https://hooks.example.com/a/b/c")

    expect(result).toEqual({
      ok: true,
      url: "https://hooks.example.com/a/b/c",
    })
    expect(destinationUrlHint("https://hooks.example.com/a/b/c")).toBe(
      "hooks.example.com"
    )
  })

  it("omits Slack incoming-webhook secret path segments", () => {
    expect(destinationUrlHint("https://hooks.slack.com/services/T/B/X")).toBe(
      "hooks.slack.com"
    )
  })

  it("omits generic webhook credentials and secret URL components", () => {
    expect(
      destinationUrlHint(
        "https://user:pass@hooks.example.com:8443/team/token?key=x#fragment"
      )
    ).toBe("hooks.example.com:8443")
  })

  it("rejects local webhook targets", () => {
    expect(validateDestinationUrl("http://localhost:3000/hook")).toEqual({
      ok: false,
      error: "Use a public HTTPS webhook URL.",
    })
  })
})

describe("webhook SSRF guards", () => {
  it("rejects the cloud-metadata IP (169.254.169.254)", () => {
    expect(
      validateDestinationUrl("https://169.254.169.254/latest/meta-data/")
    ).toEqual({ ok: false, error: "Use a public HTTPS webhook URL." })
  })

  it("rejects a decimal-encoded metadata IP", () => {
    // 2852039166 === 169.254.169.254; the URL parser normalizes it to dotted form.
    expect(validateDestinationUrl("https://2852039166/").ok).toBe(false)
  })

  it("rejects IPv6 loopback and link-local targets", () => {
    expect(validateDestinationUrl("https://[::1]/hook").ok).toBe(false)
    expect(validateDestinationUrl("https://[fe80::1]/hook").ok).toBe(false)
    expect(validateDestinationUrl("https://127.0.0.1/hook").ok).toBe(false)
  })

  it("rejects IPv4-mapped IPv6 literals that hide internal targets", () => {
    // The URL parser prints these in hex form (e.g. ::ffff:7f00:1), which the
    // old dotted-decimal-only guard missed, so loopback/metadata/RFC1918 slipped
    // through as public. Each must resolve to a blocked v4 target.
    expect(validateDestinationUrl("https://[::ffff:127.0.0.1]/hook").ok).toBe(
      false
    )
    expect(
      validateDestinationUrl("https://[::ffff:169.254.169.254]/latest/").ok
    ).toBe(false)
    expect(validateDestinationUrl("https://[::ffff:10.0.0.5]/hook").ok).toBe(
      false
    )
    expect(validateDestinationUrl("https://[::ffff:192.168.1.1]/hook").ok).toBe(
      false
    )
  })

  it("blocks the hex spelling of a mapped internal address directly", () => {
    // ::ffff:7f00:1 === ::ffff:127.0.0.1, ::ffff:a9fe:a9fe === 169.254.169.254.
    expect(isBlockedIp("::ffff:7f00:1")).toBe(true)
    expect(isBlockedIp("::ffff:a9fe:a9fe")).toBe(true)
    expect(isBlockedIp("::ffff:a00:5")).toBe(true)
  })

  it("treats a public v4-mapped v6 host consistently with its v4 form", () => {
    // ::ffff:8.8.8.8 prints as ::ffff:808:808; a public mapped address stays
    // allowed, matching how the bare 8.8.8.8 is classified.
    expect(isBlockedIp("::ffff:808:808")).toBe(false)
    expect(validateDestinationUrl("https://[::ffff:8.8.8.8]/hook").ok).toBe(
      true
    )
  })

  it("rejects the GCP metadata hostname", () => {
    expect(validateDestinationUrl("https://metadata.google.internal/").ok).toBe(
      false
    )
  })

  it("rejects CGNAT-range metadata (100.100.100.200)", () => {
    expect(validateDestinationUrl("https://100.100.100.200/").ok).toBe(false)
  })

  it("still accepts a public HTTPS webhook", () => {
    expect(
      validateDestinationUrl("https://hooks.slack.com/services/T/B/X").ok
    ).toBe(true)
  })

  it("classifies internal and public addresses", () => {
    for (const ip of [
      "127.0.0.1",
      "10.0.0.1",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "169.254.170.2",
      "100.64.0.1",
      "100.100.100.200",
      "0.0.0.0",
      "192.0.0.192",
      "168.63.129.16",
      "::1",
      "fe80::1",
      "fc00::1",
      "fd12:3456::1",
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "::ffff:a9fe:a9fe",
      "::ffff:a00:5",
    ]) {
      expect(isBlockedIp(ip), `${ip} should be blocked`).toBe(true)
    }
    for (const ip of [
      "8.8.8.8",
      "1.1.1.1",
      "93.184.216.34",
      "2606:4700:4700::1111",
    ]) {
      expect(isBlockedIp(ip), `${ip} should be allowed`).toBe(false)
    }
  })

  describe("postAlertDestination network guards", () => {
    afterEach(() => {
      vi.clearAllMocks()
      vi.unstubAllGlobals()
    })

    it("does not follow redirects toward internal targets", async () => {
      lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }])
      const fetchMock = vi.fn(
        async () =>
          new Response(null, {
            status: 302,
            headers: { location: "http://169.254.169.254/" },
          })
      )
      vi.stubGlobal("fetch", fetchMock)

      const res = await postAlertDestination(
        "webhook",
        "https://example.com/hook",
        event
      )

      expect(res.ok).toBe(false)
      expect(fetchMock).toHaveBeenCalledWith(
        "https://example.com/hook",
        expect.objectContaining({ redirect: "manual" })
      )
    })

    it("sends deliveries with a timeout so a hanging webhook can't stall dispatch", async () => {
      lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }])
      const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }))
      vi.stubGlobal("fetch", fetchMock)

      const res = await postAlertDestination(
        "webhook",
        "https://example.com/hook",
        event
      )

      expect(res.ok).toBe(true)
      expect(fetchMock).toHaveBeenCalledWith(
        "https://example.com/hook",
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      )
    })

    it("blocks a public hostname that resolves to a private IP", async () => {
      lookup.mockResolvedValue([{ address: "169.254.169.254", family: 4 }])
      const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }))
      vi.stubGlobal("fetch", fetchMock)

      const res = await postAlertDestination(
        "webhook",
        "https://rebind.example/hook",
        event
      )

      expect(res.ok).toBe(false)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it("sends an Idempotency-Key header with the delivery ID on generic webhooks", async () => {
      lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }])
      const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }))
      vi.stubGlobal("fetch", fetchMock)

      await postAlertDestination(
        "webhook",
        "https://example.com/hook",
        event,
        "del-123"
      )

      const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect((opts.headers as Record<string, string>)["idempotency-key"]).toBe(
        "del-123"
      )
    })

    it("does not add an idempotency header to Slack webhooks", async () => {
      lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }])
      const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }))
      vi.stubGlobal("fetch", fetchMock)

      await postAlertDestination(
        "slack_webhook",
        "https://hooks.slack.com/services/T/B/X",
        event,
        "del-123"
      )

      const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(
        (opts.headers as Record<string, string>)["idempotency-key"]
      ).toBeUndefined()
    })

    it("delivers when the host resolves to a public IP", async () => {
      lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }])
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response("ok", { status: 200 }))
      )

      const res = await postAlertDestination(
        "webhook",
        "https://example.com/hook",
        event
      )

      expect(res.ok).toBe(true)
    })
  })

  describe("postAlertDestination retry classification", () => {
    afterEach(() => {
      vi.clearAllMocks()
      vi.unstubAllGlobals()
    })

    async function post(status?: number, error?: Error) {
      lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }])
      vi.stubGlobal(
        "fetch",
        error
          ? vi.fn(async () => {
              throw error
            })
          : vi.fn(async () => new Response("x", { status }))
      )
      return postAlertDestination("webhook", "https://example.com/hook", event)
    }

    it("marks 5xx and retry-hinting 4xx responses retryable", async () => {
      for (const status of [500, 503, 408, 425, 429]) {
        const res = await post(status)
        expect(res).toEqual({
          ok: false,
          error: `HTTP ${status}`,
          retryable: true,
        })
      }
    })

    it("pauses on other 4xx responses", async () => {
      const res = await post(404)
      expect(res).toEqual({ ok: false, error: "HTTP 404", retryable: false })
    })

    it("marks network failures retryable", async () => {
      const res = await post(undefined, new Error("socket hang up"))
      expect(res).toEqual({
        ok: false,
        error: "Webhook request failed.",
        retryable: true,
      })
    })

    it("pauses on an invalid or disallowed target", async () => {
      const res = await postAlertDestination(
        "webhook",
        "http://localhost/hook",
        event
      )
      expect(res).toEqual({
        ok: false,
        error: "Webhook target is not allowed.",
        retryable: false,
      })
    })

    it("pauses when the host resolves to a blocked address", async () => {
      lookup.mockResolvedValue([{ address: "169.254.169.254", family: 4 }])
      const res = await postAlertDestination(
        "webhook",
        "https://rebind.example/hook",
        event
      )
      expect(res).toEqual({
        ok: false,
        error: "Webhook host is not allowed.",
        retryable: false,
      })
    })

    it("marks a DNS lookup failure retryable", async () => {
      lookup.mockRejectedValue(new Error("EAI_AGAIN"))
      const res = await postAlertDestination(
        "webhook",
        "https://example.com/hook",
        event
      )
      expect(res).toEqual({
        ok: false,
        error: "Webhook request failed.",
        retryable: true,
      })
    })
  })
})
