import { toFiniteNumber } from "./shared"
import type { AdapterResult, BalanceReading, ToolAdapter } from "./types"

type CreditUsage = {
  credit_type?: string
  allocated?: number
  used?: number
  remaining?: number
}

// "standard_lookup" -> "Standard Lookup"
function humanize(creditType: string | undefined): string {
  if (!creditType) return "Credits"
  return creditType
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

export const rocketreachAdapter: ToolAdapter = {
  toolId: "rocketreach",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      // /api/v2/account/ is the classic account endpoint (works on all plans).
      // /api/v2/universal/account/ is gated behind Universal Credits and 4xxs
      // for normal accounts, so it must not be used here.
      res = await fetch("https://api.rocketreach.co/api/v2/account/", {
        headers: { "Api-Key": apiKey },
      })
    } catch {
      return { ok: false, error: "Couldn't reach RocketReach." }
    }
    if (res.status === 401)
      return { ok: false, error: "RocketReach rejected this key." }
    if (!res.ok)
      return { ok: false, error: `RocketReach returned ${res.status}.` }

    let data: { credit_usage?: CreditUsage[] }
    try {
      data = await res.json()
    } catch {
      return {
        ok: false,
        error: "RocketReach returned an unexpected response.",
      }
    }

    // credit_usage is an array, one entry per credit type. Surface a pool for
    // each type the plan actually allocates; fall back to all entries (or a
    // single zero pool) so we never return nothing.
    const usage = Array.isArray(data.credit_usage) ? data.credit_usage : []
    const active = usage.filter((c) => toFiniteNumber(c.allocated) > 0)
    const source = active.length > 0 ? active : usage
    const balances: BalanceReading[] = source.map((c) => {
      const allocated = toFiniteNumber(c.allocated)
      return {
        creditType: c.credit_type ?? "credits",
        label: humanize(c.credit_type),
        balance: toFiniteNumber(c.remaining),
        balanceLimit: allocated > 0 ? allocated : null,
        unit: "credits",
      }
    })
    if (balances.length === 0) {
      balances.push({
        creditType: "credits",
        label: "Credits",
        balance: 0,
        balanceLimit: null,
        unit: "credits",
      })
    }
    return { ok: true, balances }
  },
}
