import type { PoolRow } from "@/lib/pool-rows"
import type { ConnectionWithBalance, PoolView } from "@/lib/types"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { BurnRateHero } from "./BurnRateHero"
import { ConnectionCard } from "./ConnectionCard"
import { ConnectionRow } from "./ConnectionRow"

// QUO-184: every dashboard surface that shows the burn-out ETA says relative
// units ("in ~3 days"), never a weekday. Vitest runs in node with no DOM, so
// the real components are rendered to HTML and the text read back.

const NOW = Date.now()
const DAY = 86_400_000

// 1000 -> 600 over two days = 200/day; 600 left = 3 days of runway.
const pool: PoolView = {
  creditType: "credits",
  label: "Credits",
  unit: "credits",
  balance: 600,
  balanceLimit: 5000,
  recorded_at: new Date(NOW).toISOString(),
  history: [
    { balance: 1000, recorded_at: new Date(NOW - 2 * DAY).toISOString() },
    { balance: 600, recorded_at: new Date(NOW).toISOString() },
  ],
}

const connection = {
  id: "c1",
  name: "Hunter.io",
  status: "active",
  low_threshold: null,
  alert_threshold: null,
  pool_thresholds: null,
  tool: {
    id: "hunter",
    name: "Hunter.io",
    logo_url: null,
    topup_url: null,
    default_low_threshold: null,
    default_alert_threshold: null,
    pools: null,
    credential_fields: null,
  },
  pools: [pool],
} as unknown as ConnectionWithBalance

const row: PoolRow = { connection, pool }

const WEEKDAY = /(Sun|Mon|Tues|Wednes|Thurs|Fri|Satur)day/

describe("dashboard ETA wording", () => {
  it("hero says 'in ~3 days' for three days of runway", () => {
    const html = renderToStaticMarkup(createElement(BurnRateHero, { row }))
    expect(html).toContain("in ~3 days")
    expect(html).toContain("Empties in ~3 days.")
    expect(html).not.toMatch(WEEKDAY)
  })

  it("row says 'in ~3 days'", () => {
    const html = renderToStaticMarkup(
      createElement(ConnectionRow, { row, active: false, onOpen: () => {} })
    )
    expect(html).toContain("in ~3 days")
    expect(html).not.toMatch(WEEKDAY)
  })

  it("card says 'in ~3 days'", () => {
    const html = renderToStaticMarkup(
      createElement(ConnectionCard, { row, onOpen: () => {} })
    )
    expect(html).toContain("in ~3 days")
    expect(html).not.toMatch(WEEKDAY)
  })
})
