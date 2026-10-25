import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { mostAtRisk } from "@/lib/most-at-risk"
import type { PoolRow } from "@/lib/pool-rows"
import {
  HEALTHY_SHORT_RUNWAY_NOTE,
  HERO_EYEBROW,
  RUNWAY_HEADING,
} from "@/lib/runway-copy"
import type { ConnectionWithBalance, PoolView } from "@/lib/types"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { BurnRateHero } from "./BurnRateHero"
import { ConnectionCard } from "./ConnectionCard"
import { ConnectionRow } from "./ConnectionRow"

// QUO-201: the status badge is the Warn below state, runway is the forecast,
// and every surface labels them apart, so a short runway beside HEALTHY (or a
// long one beside LOW) never reads as a contradiction. Vitest runs in node, so
// the real components are rendered to HTML and the text read back.

const NOW = Date.now()
const DAY = 86_400_000

function fixture(
  id: string,
  balance: number,
  perDay: number | null,
  status = "active"
): PoolRow {
  const pool: PoolView = {
    creditType: "credits",
    label: "Credits",
    unit: "credits",
    balance,
    balanceLimit: null,
    recorded_at: new Date(NOW).toISOString(),
    history:
      perDay == null
        ? [{ balance, recorded_at: new Date(NOW).toISOString() }]
        : [
            {
              balance: balance + perDay,
              recorded_at: new Date(NOW - DAY).toISOString(),
            },
            { balance, recorded_at: new Date(NOW).toISOString() },
          ],
  }
  const connection = {
    id,
    name: id,
    status,
    // Warn below 300 (low), critical at 100.
    low_threshold: 300,
    alert_threshold: 100,
    pool_thresholds: null,
    last_error: null,
    tags: [],
    tool: {
      id: "t",
      name: "Tool",
      logo_url: null,
      topup_url: null,
      default_low_threshold: null,
      default_alert_threshold: null,
      pools: null,
      credential_fields: null,
    },
    pools: [pool],
  } as unknown as ConnectionWithBalance
  return { connection, pool }
}

// 2000 left, burning 1000/day: two days of runway, still above Warn below.
const healthyShort = fixture("healthy-short", 2000, 1000)
// 250 left, burning 3/day: about three months, but under Warn below.
const lowLong = fixture("low-long", 250, 3)
const dry = fixture("dry", 0, 50)
const noBurn = fixture("no-burn", 5000, null)
const stale = fixture("stale", 2000, 1000, "stale")
const errored = fixture("errored", 2000, 1000, "error")

const hero = (row: PoolRow) =>
  renderToStaticMarkup(createElement(BurnRateHero, { row }))
const card = (row: PoolRow) =>
  renderToStaticMarkup(createElement(ConnectionCard, { row, onOpen: () => {} }))
const tableRow = (row: PoolRow) =>
  renderToStaticMarkup(
    createElement(ConnectionRow, { row, active: false, onOpen: () => {} })
  )

describe("hero: ranked by runway, labelled as runway", () => {
  it("names runway as the measure behind the pick", () => {
    expect(hero(healthyShort)).toContain(HERO_EYEBROW)
  })

  it("explains a short runway beside a healthy badge", () => {
    const html = hero(healthyShort)
    expect(html).toContain("Healthy")
    expect(html).toContain(HEALTHY_SHORT_RUNWAY_NOTE)
  })

  it("adds no note when the badge already warns", () => {
    expect(hero(lowLong)).not.toContain(HEALTHY_SHORT_RUNWAY_NOTE)
    expect(hero(dry)).not.toContain(HEALTHY_SHORT_RUNWAY_NOTE)
  })

  it("adds no note on a reading it cannot trust", () => {
    expect(hero(stale)).toContain("Stale reading")
    expect(hero(stale)).not.toContain(HEALTHY_SHORT_RUNWAY_NOTE)
    expect(hero(errored)).not.toContain(HEALTHY_SHORT_RUNWAY_NOTE)
  })
})

describe("row and card: runway reads as its own label", () => {
  const cases: [string, PoolRow, string, string][] = [
    ["healthy, short runway", healthyShort, "Healthy", "Empties in ~2 days"],
    ["low, long runway", lowLong, "Low", "Empties in ~3 months"],
    ["dry", dry, "Critical", "Already empty"],
    ["no burn", noBurn, "Healthy", "Not draining yet"],
    ["stale", stale, "Stale reading", "Empties in ~2 days"],
    ["error", errored, "Error", "Empties in ~2 days"],
  ]

  for (const [name, row, badge, runway] of cases) {
    it(`${name}: badge ${badge}, runway "${runway}"`, () => {
      for (const html of [tableRow(row), card(row)]) {
        expect(html).toContain(badge)
        expect(html).toContain(runway)
      }
    })
  }
})

describe("filtered subset: the hero follows the visible rows", () => {
  it("picks the shortest runway among what the filter shows", () => {
    // Filtered to Low only, the healthy two-day pool is out of view.
    expect(mostAtRisk([lowLong, noBurn])?.connection.id).toBe("low-long")
    expect(mostAtRisk([lowLong, healthyShort])?.connection.id).toBe(
      "healthy-short"
    )
  })

  it("hides the hero when nothing visible is draining", () => {
    expect(mostAtRisk([noBurn])).toBeNull()
  })
})

describe("drawer: runway has its own heading", () => {
  // The drawer is a base-ui Dialog that does not render outside a browser,
  // so its wiring is pinned at the source.
  const source = readFileSync(
    resolve(process.cwd(), "src/components/dashboard/ConnectionDrawer.tsx"),
    "utf8"
  )

  it("heads the ETA block with the runway label", () => {
    expect(source).toContain("RUNWAY_HEADING")
    expect(RUNWAY_HEADING.length).toBeGreaterThan(0)
  })
})
