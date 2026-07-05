import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const captaindataAdapter: ToolAdapter = {
  toolId: "captaindata",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await timedFetch("https://api.captaindata.com/v1/quotas", {
        headers: { "X-API-Key": apiKey },
      })
    } catch {
      return { ok: false, error: "Couldn't reach Captain Data." }
    }
    if (res.status === 401)
      return { ok: false, error: "Captain Data rejected this key." }
    if (!res.ok)
      return { ok: false, error: `Captain Data returned ${res.status}.` }

    let data: { credits_left?: number; credits_max?: number }
    try {
      data = await res.json()
    } catch {
      return {
        ok: false,
        error: "Captain Data returned an unexpected response.",
      }
    }
    const balance = finiteOrNull(data.credits_left)
    if (balance === null) {
      return {
        ok: false,
        error: "Captain Data returned an unexpected response.",
      }
    }
    return {
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance,
          balanceLimit: finiteOrNull(data.credits_max) || null,
          unit: "credits",
        },
      ],
    }
  },
}
