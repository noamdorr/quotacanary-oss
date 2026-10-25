import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

// Hand-written because GET /v4/account reports no remaining figure: only the
// monthly allowance (planCredits), the plan's start date (planStart) and a
// per-day usage array. Remaining = planCredits minus the credits used since
// the current billing cycle began, which needs date arithmetic the catalog
// does not have.
type DiffbotResponse = {
  planCredits?: unknown
  planStart?: unknown
  usage?: unknown
}

type DiffbotUsageDay = { date?: unknown; credits?: unknown }

const UNEXPECTED = "Diffbot returned an unexpected response."
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/

function isoDate(year: number, month: number, day: number): string {
  // month is 0-based here; Date.UTC normalises an overflowing month.
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)))
    .toISOString()
    .slice(0, 10)
}

// The start of the billing cycle that contains `today`: the latest monthly
// anniversary of planStart on or before today (a day-31 start clamps to the
// month's last day). Both dates are YYYY-MM-DD, so they compare as strings.
export function diffbotCycleStart(
  planStart: string,
  today: string
): string | null {
  const start = DATE.exec(planStart)
  const now = DATE.exec(today)
  if (!start || !now) return null
  if (planStart >= today) return planStart
  const day = Number(start[3])
  const year = Number(now[1])
  const month = Number(now[2]) - 1
  const thisMonth = isoDate(year, month, day)
  return thisMonth <= today ? thisMonth : isoDate(year, month - 1, day)
}

export const diffbotAdapter: ToolAdapter = {
  toolId: "diffbot",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      // days=31 (the documented default) covers any monthly cycle.
      res = await timedFetch(
        `https://api.diffbot.com/v4/account?token=${encodeURIComponent(apiKey)}&days=31`
      )
    } catch {
      return { ok: false, error: "Couldn't reach Diffbot." }
    }
    if (res.status === 401 || res.status === 403)
      return { ok: false, error: "Diffbot rejected this key." }
    if (!res.ok) return { ok: false, error: `Diffbot returned ${res.status}.` }

    let data: DiffbotResponse
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: UNEXPECTED }
    }

    const planCredits = finiteOrNull(data?.planCredits)
    const cycleStart =
      typeof data?.planStart === "string"
        ? diffbotCycleStart(
            data.planStart,
            new Date().toISOString().slice(0, 10)
          )
        : null
    if (
      planCredits === null ||
      cycleStart === null ||
      !Array.isArray(data.usage)
    )
      return { ok: false, error: UNEXPECTED }

    let used = 0
    for (const day of data.usage as DiffbotUsageDay[]) {
      if (typeof day?.date === "string" && day.date >= cycleStart) {
        used += finiteOrNull(day.credits) ?? 0
      }
    }

    return {
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Monthly credits",
          balance: planCredits - used,
          balanceLimit: planCredits,
          unit: "credits",
        },
      ],
    }
  },
}
