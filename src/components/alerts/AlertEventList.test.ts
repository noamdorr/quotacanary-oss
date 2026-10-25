import type { AlertEvent } from "@/lib/types"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { AlertEventList } from "./AlertEventList"

function event(overrides: Partial<AlertEvent>): AlertEvent {
  return {
    id: "evt-1",
    user_id: "u1",
    connection_id: "c1",
    kind: "balance",
    level: "critical",
    tool_name: "Apollo",
    connection_name: "Apollo main",
    title: "Apollo is critically low",
    body: "Apollo main crossed critical threshold for Credits.",
    pools: [],
    dashboard_url: "https://app.quotacanary.com/dashboard",
    topup_url: null,
    read_at: "2026-10-18T10:00:00.000Z",
    created_at: "2026-10-18T09:00:00.000Z",
    ...overrides,
  }
}

describe("AlertEventList", () => {
  it("labels a stopped-checking alert as stopped, not as a critical balance", () => {
    // QUO-289: the event carries level "critical" for routing only.
    const html = renderToStaticMarkup(
      createElement(AlertEventList, {
        events: [
          event({
            kind: "stopped_checking",
            title: "Apollo isn't being checked",
          }),
        ],
      })
    )
    expect(html).toContain(">stopped<")
    expect(html).not.toContain(">critical<")
  })

  it("keeps the level label on balance alerts", () => {
    const html = renderToStaticMarkup(
      createElement(AlertEventList, { events: [event({})] })
    )
    expect(html).toContain(">critical<")
  })
})
