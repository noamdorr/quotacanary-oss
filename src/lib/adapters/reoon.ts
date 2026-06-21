import { toFiniteNumber } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const reoonAdapter: ToolAdapter = {
  toolId: "reoon",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await fetch(
        `https://emailverifier.reoon.com/api/v1/check-account-balance/?key=${encodeURIComponent(apiKey)}`
      )
    } catch {
      return { ok: false, error: "Couldn't reach Reoon." }
    }
    if (res.status === 401)
      return { ok: false, error: "Reoon rejected this key." }
    if (!res.ok) return { ok: false, error: `Reoon returned ${res.status}.` }

    let data: {
      remaining_instant_credits?: number
      remaining_daily_credits?: number
    }
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "Reoon returned an unexpected response." }
    }
    return {
      ok: true,
      balances: [
        {
          creditType: "instant",
          label: "Credits",
          balance: toFiniteNumber(data.remaining_instant_credits),
          balanceLimit: null,
          unit: "credits",
        },
        {
          creditType: "daily",
          label: "Daily Credits",
          balance: toFiniteNumber(data.remaining_daily_credits),
          balanceLimit: null,
          unit: "credits",
        },
      ],
    }
  },
}
