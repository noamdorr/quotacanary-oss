import { toFiniteNumber } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const serpwowAdapter: ToolAdapter = {
  toolId: "serpwow",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await fetch(
        `https://api.serpwow.com/live/account?api_key=${encodeURIComponent(apiKey)}`
      )
    } catch {
      return { ok: false, error: "Couldn't reach SerpWow." }
    }
    if (res.status === 401)
      return { ok: false, error: "SerpWow rejected this key." }
    if (!res.ok) return { ok: false, error: `SerpWow returned ${res.status}.` }

    let data: {
      account_info?: { credits_remaining?: number; credits_limit?: number }
    }
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "SerpWow returned an unexpected response." }
    }
    return {
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: toFiniteNumber(data.account_info?.credits_remaining),
          balanceLimit:
            toFiniteNumber(data.account_info?.credits_limit) || null,
          unit: "credits",
        },
      ],
    }
  },
}
