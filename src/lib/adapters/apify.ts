import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const apifyAdapter: ToolAdapter = {
  toolId: "apify",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await timedFetch("https://api.apify.com/v2/users/me/limits", {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
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
    const limit = finiteOrNull(data.data?.limits?.maxMonthlyUsageUsd)
    if (limit === null) {
      return { ok: false, error: "Apify returned an unexpected response." }
    }
    const used = finiteOrNull(data.data?.current?.monthlyUsageUsd) ?? 0
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
