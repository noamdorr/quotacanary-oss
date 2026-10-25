import { afterEach, describe, expect, it, vi } from "vitest"
import {
  type AlertDestinationEvent,
  destinationUrlHint,
  isBlockedIp,
  isDestinationLevelAllowed,
  postAlertDestination,
  renderDestinationPayload,
  testDestinationEvent,
  validateDestinationUrl,
} from "./destinations"
import { verifyWebhookSignature } from "./signing"

const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }))
vi.mock("node:dns/promises", () => ({ lookup }))

const { postToPinnedAddress } = vi.hoisted(() => ({
  postToPinnedAddress: vi.fn(),
}))
vi.mock("./pinned-post", () => ({ postToPinnedAddress }))

// The transport POSTs to a pre-resolved address; see pinned-post.test.ts for
// the pinning itself. Here it only stands in for "the webhook answered X".
function stubResponse(status: number) {
  postToPinnedAddress.mockResolvedValue({ status })
}

function sentOptions() {
  return postToPinnedAddress.mock.calls[0][0] as {
    url: string
    addresses: { address: string; family: number }[]
    headers: Record<string, string>
    body: string
    timeoutMs: number
  }
}

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

  // QUO-289: a connection that stopped checking has no pools to report.
  const stopped: AlertDestinationEvent = {
    ...event,
    kind: "stopped_checking",
    title: "Hunter isn't being checked",
    body: "Hunter rejected the saved key for Hunter main.",
    pools: [],
    topupUrl: null,
  }

  it("names a stopped-checking event on generic webhooks", () => {
    expect(renderDestinationPayload("webhook", stopped)).toMatchObject({
      event: "quota.alert.stopped",
      level: "critical",
      title: "Hunter isn't being checked",
      connection: { id: "conn-1", name: "Hunter main" },
      pools: [],
    })
  })

  it("keeps the test event name for a test delivery of any kind", () => {
    expect(
      renderDestinationPayload("webhook", { ...stopped, isTest: true })
    ).toMatchObject({ event: "quota.alert.test" })
  })

  it("sends Slack a stopped-checking message without a missing-pools line", () => {
    const payload = renderDestinationPayload("slack_webhook", stopped) as {
      text: string
      blocks: { type: string; text?: { type: string; text: string } }[]
    }

    expect(payload.text).toContain("isn't being checked")
    const section = payload.blocks.find((b) => b.type === "section")
    expect(section?.text?.text).toBe(
      "Hunter rejected the saved key for Hunter main."
    )
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
    })

    it("connects to the address it validated, not to a re-resolved one", async () => {
      lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }])
      stubResponse(200)

      const res = await postAlertDestination(
        "webhook",
        "https://rebind.example/hook",
        event
      )

      // One resolution, and its answer is what the request connects to. A
      // second lookup here is the DNS-rebinding hole this closes.
      expect(res.ok).toBe(true)
      expect(lookup).toHaveBeenCalledTimes(1)
      expect(sentOptions().addresses).toEqual([
        { address: "93.184.216.34", family: 4 },
      ])
      expect(sentOptions().url).toBe("https://rebind.example/hook")
    })

    it("refuses when any resolved address is internal, not just the first", async () => {
      lookup.mockResolvedValue([
        { address: "93.184.216.34", family: 4 },
        { address: "169.254.169.254", family: 4 },
      ])

      const res = await postAlertDestination(
        "webhook",
        "https://rebind.example/hook",
        event
      )

      expect(res.ok).toBe(false)
      expect(postToPinnedAddress).not.toHaveBeenCalled()
    })

    it("pins an IP-literal target to the literal itself", async () => {
      stubResponse(200)

      await postAlertDestination("webhook", "https://8.8.8.8/hook", event)

      expect(lookup).not.toHaveBeenCalled()
      expect(sentOptions().addresses).toEqual([
        { address: "8.8.8.8", family: 4 },
      ])
    })

    it("does not follow redirects toward internal targets", async () => {
      lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }])
      stubResponse(302)

      const res = await postAlertDestination(
        "webhook",
        "https://example.com/hook",
        event
      )

      // The transport never follows a redirect, so the 302 that would have
      // aimed at 169.254.169.254 is reported as a failed delivery instead.
      expect(res).toEqual({
        ok: false,
        error: "HTTP 302",
        retryable: false,
      })
      expect(postToPinnedAddress).toHaveBeenCalledTimes(1)
    })

    it("sends deliveries with a timeout so a hanging webhook can't stall dispatch", async () => {
      lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }])
      stubResponse(200)

      const res = await postAlertDestination(
        "webhook",
        "https://example.com/hook",
        event
      )

      expect(res.ok).toBe(true)
      expect(sentOptions().timeoutMs).toBe(10_000)
    })

    it("blocks a public hostname that resolves to a private IP", async () => {
      lookup.mockResolvedValue([{ address: "169.254.169.254", family: 4 }])
      stubResponse(200)

      const res = await postAlertDestination(
        "webhook",
        "https://rebind.example/hook",
        event
      )

      expect(res.ok).toBe(false)
      expect(postToPinnedAddress).not.toHaveBeenCalled()
    })

    it("sends an Idempotency-Key header with the delivery ID on generic webhooks", async () => {
      lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }])
      stubResponse(200)

      await postAlertDestination(
        "webhook",
        "https://example.com/hook",
        event,
        "del-123"
      )

      expect(sentOptions().headers["idempotency-key"]).toBe("del-123")
    })

    it("does not add an idempotency header to Slack webhooks", async () => {
      lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }])
      stubResponse(200)

      await postAlertDestination(
        "slack_webhook",
        "https://hooks.slack.com/services/T/B/X",
        event,
        "del-123"
      )

      expect(sentOptions().headers["idempotency-key"]).toBeUndefined()
    })

    it("delivers when the host resolves to a public IP", async () => {
      lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }])
      stubResponse(200)

      const res = await postAlertDestination(
        "webhook",
        "https://example.com/hook",
        event
      )

      expect(res.ok).toBe(true)
      expect(sentOptions().body).toContain("quota.alert.critical")
    })
  })

  describe("postAlertDestination signing", () => {
    afterEach(() => {
      vi.clearAllMocks()
      vi.useRealTimers()
    })

    async function post(
      kind: "webhook" | "slack_webhook",
      secret: string | null
    ) {
      lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }])
      stubResponse(200)
      await postAlertDestination(
        kind,
        kind === "webhook"
          ? "https://example.com/hook"
          : "https://hooks.slack.com/services/T/B/X",
        event,
        "del-123",
        secret
      )
      return sentOptions()
    }

    it("signs the exact bytes it sends, verifiable with the destination secret", async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date("2026-06-10T10:00:00.000Z"))

      const sent = await post("webhook", "qcwh_secret")

      expect(
        verifyWebhookSignature({
          secret: "qcwh_secret",
          header: sent.headers["quotacanary-signature"],
          body: sent.body,
          nowSeconds: Math.floor(Date.parse("2026-06-10T10:00:00.000Z") / 1000),
        })
      ).toEqual({ ok: true })
    })

    it("stamps the signature with the current time", async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date("2026-06-10T10:00:00.000Z"))

      const sent = await post("webhook", "qcwh_secret")

      const t = Math.floor(Date.parse("2026-06-10T10:00:00.000Z") / 1000)
      expect(sent.headers["quotacanary-signature"]).toMatch(
        new RegExp(`^t=${t},v1=[0-9a-f]{64}$`)
      )
    })

    it("produces a signature the wrong secret cannot verify", async () => {
      const sent = await post("webhook", "qcwh_secret")

      expect(
        verifyWebhookSignature({
          secret: "qcwh_other",
          header: sent.headers["quotacanary-signature"],
          body: sent.body,
          nowSeconds: Math.floor(Date.now() / 1000),
        })
      ).toEqual({ ok: false, reason: "mismatch" })
    })

    it("sends unsigned when the destination has no secret", async () => {
      const sent = await post("webhook", null)

      expect(sent.headers["quotacanary-signature"]).toBeUndefined()
    })

    it("never signs Slack deliveries", async () => {
      const sent = await post("slack_webhook", "qcwh_secret")

      expect(sent.headers["quotacanary-signature"]).toBeUndefined()
    })
  })

  describe("postAlertDestination retry classification", () => {
    afterEach(() => {
      vi.clearAllMocks()
    })

    async function post(status?: number, failed?: boolean) {
      lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }])
      // The transport reports a request that never answered as null.
      postToPinnedAddress.mockResolvedValue(failed ? null : { status })
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
      const res = await post(undefined, true)
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

describe("test deliveries", () => {
  it("marks the generic payload so a receiver can skip paging anyone", () => {
    const payload = renderDestinationPayload(
      "webhook",
      testDestinationEvent("https://app.quotacanary.com/dashboard")
    ) as { event: string; level: string }

    expect(payload.event).toBe("quota.alert.test")
    // The shape is otherwise a real alert, so a receiver's parser is exercised.
    expect(payload.level).toBe("low")
  })

  it("says it is a test in the Slack message itself", () => {
    const payload = renderDestinationPayload(
      "slack_webhook",
      testDestinationEvent("https://app.quotacanary.com/dashboard")
    ) as { text: string }

    expect(payload.text).toContain("Test alert from QuotaCanary")
  })

  it("keeps the untested payloads on their real event name", () => {
    expect(renderDestinationPayload("webhook", event)).toMatchObject({
      event: "quota.alert.critical",
    })
  })
})
