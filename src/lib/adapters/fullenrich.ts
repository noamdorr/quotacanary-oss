import { toFiniteNumber } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const fullenrichAdapter: ToolAdapter = {
  toolId: "fullenrich",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await fetch("https://app.fullenrich.com/api/v1/account/credits", {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
    } catch {
      return { ok: false, error: "Couldn't reach FullEnrich." }
    }
    if (res.status === 401)
      return { ok: false, error: "FullEnrich rejected this key." }
    if (!res.ok)
      return { ok: false, error: `FullEnrich returned ${res.status}.` }

    let data: { balance?: unknown }
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "FullEnrich returned an unexpected response." }
    }
    return {
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: toFiniteNumber(data.balance),
          balanceLimit: null,
          unit: "credits",
        },
      ],
    }
  },
}
