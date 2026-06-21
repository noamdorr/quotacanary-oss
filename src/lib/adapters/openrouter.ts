import { toFiniteNumber } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const openrouterAdapter: ToolAdapter = {
  toolId: "openrouter",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await fetch("https://openrouter.ai/api/v1/credits", {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
    } catch {
      return { ok: false, error: "Couldn't reach OpenRouter." }
    }
    // OpenRouter returns HTTP 401 on a bad key
    if (res.status === 401)
      return { ok: false, error: "OpenRouter rejected this key." }
    if (!res.ok)
      return { ok: false, error: `OpenRouter returned ${res.status}.` }

    let data: {
      data?: { total_credits?: number; total_usage?: number }
    }
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "OpenRouter returned an unexpected response." }
    }
    const total = toFiniteNumber(data.data?.total_credits)
    const used = toFiniteNumber(data.data?.total_usage)
    // total_credits is lifetime top-ups, not a quota; showing it as a
    // denominator misreads pay-per-use as a cap, so report balance only.
    return {
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: total - used,
          balanceLimit: null,
          unit: "usd",
        },
      ],
    }
  },
}
