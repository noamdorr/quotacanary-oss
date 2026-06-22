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
  topupUrl: "https://hunter.io/billing",
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
      topup_url: "https://hunter.io/billing",
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

  it("delivers low events only to low-or-critical destinations", () => {
    expect(isDestinationLevelAllowed("low", "low")).toBe(true)
    expect(isDestinationLevelAllowed("critical", "low")).toBe(false)
    expect(isDestinationLevelAllowed("critical", "critical")).toBe(true)
  })
})

describe("alert destination URL validation", () => {
  it("accepts public HTTPS URLs and produces a safe hint", () => {
    const result = validateDestinationUrl("https://hooks.example.com/a/b/c")

    expect(result).toEqual({
      ok: true,
      url: "https://hooks.example.com/a/b/c",
    })
    expect(destinationUrlHint("https://hooks.example.com/a/b/c")).toBe(
      "hooks.example.com/a/b/c"
    )
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
})
