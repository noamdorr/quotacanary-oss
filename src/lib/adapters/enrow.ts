import { toFiniteNumber } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const enrowAdapter: ToolAdapter = {
  toolId: "enrow",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await fetch("https://api.enrow.io/account/info", {
        headers: { "x-api-key": apiKey },
      })
    } catch {
      return { ok: false, error: "Couldn't reach Enrow." }
    }
    if (res.status === 401)
      return { ok: false, error: "Enrow rejected this key." }
    if (!res.ok) return { ok: false, error: `Enrow returned ${res.status}.` }

    let data: { credits?: number }
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "Enrow returned an unexpected response." }
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
