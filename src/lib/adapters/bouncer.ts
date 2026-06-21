import { toFiniteNumber } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const bouncerAdapter: ToolAdapter = {
  toolId: "bouncer",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await fetch("https://api.usebouncer.com/v1.1/credits", {
        headers: { "x-api-key": apiKey },
      })
    } catch {
      return { ok: false, error: "Couldn't reach Bouncer." }
    }
    if (res.status === 401)
      return { ok: false, error: "Bouncer rejected this key." }
    if (!res.ok) return { ok: false, error: `Bouncer returned ${res.status}.` }

    let data: { credits?: unknown }
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "Bouncer returned an unexpected response." }
    }
    return {
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: toFiniteNumber(data.credits),
          balanceLimit: null,
          unit: "credits",
        },
      ],
    }
  },
}
