import { toFiniteNumber } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const apifyAdapter: ToolAdapter = {
  toolId: "apify",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await fetch(
        `https://api.apify.com/v2/users/me/limits?token=${encodeURIComponent(apiKey)}`
      )
    } catch {
      return { ok: false, error: "Couldn't reach Apify." }
    }
    if (res.status === 401)
      return { ok: false, error: "Apify rejected this key." }
    if (!res.ok) return { ok: false, error: `Apify returned ${res.status}.` }

    let data: {
      data?: {
        limits?: { maxMonthlyUsageUsd?: unknown }
        current?: { monthlyUsageUsd?: unknown }
      }
    }
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "Apify returned an unexpected response." }
    }
    const limit = toFiniteNumber(data.data?.limits?.maxMonthlyUsageUsd)
    const used = toFiniteNumber(data.data?.current?.monthlyUsageUsd)
    return {
      ok: true,
      balances: [
        {
          creditType: "usage",
          label: "Monthly Usage Left",
          balance: limit - used,
          balanceLimit: limit,
          unit: "usd",
        },
      ],
    }
  },
}
