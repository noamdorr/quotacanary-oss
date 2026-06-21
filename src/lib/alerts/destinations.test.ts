import { describe, expect, it } from "vitest"
import {
  type AlertDestinationEvent,
  destinationUrlHint,
  isDestinationLevelAllowed,
  renderDestinationPayload,
  validateDestinationUrl,
} from "./destinations"

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
