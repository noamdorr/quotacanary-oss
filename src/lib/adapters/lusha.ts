import { toFiniteNumber } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const lushaAdapter: ToolAdapter = {
  toolId: "lusha",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await fetch("https://api.lusha.com/v3/account/usage", {
        headers: { api_key: apiKey },
      })
    } catch {
      return { ok: false, error: "Couldn't reach Lusha." }
    }
    if (res.status === 401)
      return { ok: false, error: "Lusha rejected this key." }
    if (!res.ok) return { ok: false, error: `Lusha returned ${res.status}.` }

    let data: {
      usage?: { bulkCredits?: { remaining?: number; total?: number } }
    }
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "Lusha returned an unexpected response." }
    }
    return {
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: toFiniteNumber(data.usage?.bulkCredits?.remaining),
          balanceLimit: toFiniteNumber(data.usage?.bulkCredits?.total) || null,
          unit: "credits",
        },
      ],
    }
  },
}
