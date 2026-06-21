import { toFiniteNumber } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const bouncifyAdapter: ToolAdapter = {
  toolId: "bouncify",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await fetch(
        `https://api.bouncify.io/v1/info?apikey=${encodeURIComponent(apiKey)}`
      )
    } catch {
      return { ok: false, error: "Couldn't reach Bouncify." }
    }
    if (res.status === 401)
      return { ok: false, error: "Bouncify rejected this key." }
    if (!res.ok) return { ok: false, error: `Bouncify returned ${res.status}.` }

    let data: { credits_info?: { credits_remaining?: number } }
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "Bouncify returned an unexpected response." }
    }
    return {
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: toFiniteNumber(data.credits_info?.credits_remaining),
          balanceLimit: null,
          unit: "credits",
        },
      ],
    }
  },
}
