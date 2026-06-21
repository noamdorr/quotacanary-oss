import { toFiniteNumber } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const anymailfinderAdapter: ToolAdapter = {
  toolId: "anymailfinder",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await fetch("https://api.anymailfinder.com/v5.1/account", {
        headers: { Authorization: apiKey },
      })
    } catch {
      return { ok: false, error: "Couldn't reach Anymail Finder." }
    }
    if (res.status === 401)
      return { ok: false, error: "Anymail Finder rejected this key." }
    if (!res.ok)
      return { ok: false, error: `Anymail Finder returned ${res.status}.` }

    let data: { credits_left?: number }
    try {
      data = await res.json()
    } catch {
      return {
        ok: false,
        error: "Anymail Finder returned an unexpected response.",
      }
    }
    return {
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: toFiniteNumber(data.credits_left),
          balanceLimit: null,
          unit: "credits",
        },
      ],
    }
  },
}
