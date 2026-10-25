import type { ConnectionWithBalance, PoolView } from "@/lib/types"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { ConnectionRow } from "./ConnectionRow"

// QUO-214: the row offers "Top up" only while the balance is at risk; the
// drawer and burn-rate hero carry it on healthy rows.
function render(balance: number) {
  const connection = {
    id: "c1",
    name: "My Hunter",
    status: "active",
    low_threshold: 500,
    alert_threshold: 100,
    pool_thresholds: null,
    tool: {
      id: "hunter",
      name: "Hunter",
      logo_url: null,
      topup_url: "https://hunter.io/welcome/upgrade",
      default_low_threshold: null,
      default_alert_threshold: null,
    },
    pools: [],
  } as unknown as ConnectionWithBalance
  const pool: PoolView = {
    creditType: "credits",
    label: "Credits",
    unit: "credits",
    balance,
    balanceLimit: null,
    recorded_at: new Date().toISOString(),
    history: [],
  }
  return renderToStaticMarkup(
    createElement(ConnectionRow, {
      row: { connection, pool },
      active: false,
      onOpen: () => {},
    })
  )
}

describe("ConnectionRow top-up link", () => {
  it("shows Top up, linked to the vendor, while the balance is at risk", () => {
    const html = render(50)
    expect(html).toContain("Top up")
    expect(html).toContain('href="https://hunter.io/welcome/upgrade"')
  })

  it("stays quiet on a healthy balance", () => {
    const html = render(5000)
    expect(html).not.toContain("Top up")
    expect(html).not.toContain("hunter.io/welcome/upgrade")
  })
})
