import { toFiniteNumber } from "./shared"
import type { AdapterResult, BalanceReading, ToolAdapter } from "./types"

type TavilyUsage = {
  key?: {
    usage?: unknown
    limit?: unknown
  }
  account?: {
    plan_usage?: unknown
    plan_limit?: unknown
    paygo_usage?: unknown
    paygo_limit?: unknown
  }
  detail?: {
    error?: string
  }
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const n = toFiniteNumber(value, Number.NaN)
  return Number.isFinite(n) ? n : null
}

function remainingPool(
  creditType: string,
  label: string,
  usage: unknown,
  limit: unknown
): BalanceReading | null {
  const balanceLimit = finiteNumber(limit)
  if (balanceLimit === null) return null

  const used = finiteNumber(usage) ?? 0
  return {
    creditType,
    label,
    balance: Math.max(balanceLimit - used, 0),
    balanceLimit,
    unit: "credits",
  }
}

function activePaygoPool(
  reading: BalanceReading | null
): BalanceReading | null {
  if (!reading) return null
  if ((reading.balanceLimit ?? 0) <= 0 && reading.balance <= 0) return null
  return reading
}

export const tavilyAdapter: ToolAdapter = {
  toolId: "tavily",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await fetch("https://api.tavily.com/usage", {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
      })
    } catch {
      return { ok: false, error: "Couldn't reach Tavily." }
    }

    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "Tavily rejected this key." }
    }
    if (!res.ok) return { ok: false, error: `Tavily returned ${res.status}.` }

    let data: TavilyUsage
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "Tavily returned an unexpected response." }
    }

    if (data.detail?.error) return { ok: false, error: data.detail.error }

    const balances = [
      remainingPool(
        "plan",
        "Plan Credits",
        data.account?.plan_usage,
        data.account?.plan_limit
      ),
      activePaygoPool(
        remainingPool(
          "paygo",
          "Pay-as-you-go Credits",
          data.account?.paygo_usage,
          data.account?.paygo_limit
        )
      ),
      remainingPool("key", "API Key Credits", data.key?.usage, data.key?.limit),
    ].filter((reading): reading is BalanceReading => reading !== null)

    if (balances.length === 0) {
      return { ok: false, error: "Tavily returned an unexpected response." }
    }

    return { ok: true, balances }
  },
}
