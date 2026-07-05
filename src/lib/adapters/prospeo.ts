import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const prospeoAdapter: ToolAdapter = {
  toolId: "prospeo",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await timedFetch("https://api.prospeo.io/account-information", {
        headers: { "X-KEY": apiKey },
      })
    } catch {
      return { ok: false, error: "Couldn't reach Prospeo." }
    }
    if (res.status === 401)
      return { ok: false, error: "Prospeo rejected this key." }
    if (!res.ok) return { ok: false, error: `Prospeo returned ${res.status}.` }

    let data: {
      error?: boolean
      response?: { remaining_credits?: number; used_credits?: number }
    }
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "Prospeo returned an unexpected response." }
    }
    if (data.error === true)
      return { ok: false, error: "Prospeo rejected this key." }

    const remaining = finiteOrNull(data.response?.remaining_credits)
    if (remaining === null) {
      return { ok: false, error: "Prospeo returned an unexpected response." }
    }
    const used = finiteOrNull(data.response?.used_credits)
    return {
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: remaining,
          balanceLimit: used !== null ? remaining + used : null,
          unit: "credits",
        },
      ],
    }
  },
}
