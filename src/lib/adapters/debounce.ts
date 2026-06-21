import { toFiniteNumber } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const debounceAdapter: ToolAdapter = {
  toolId: "debounce",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await fetch(
        `https://api.debounce.io/v1/balance/?api=${encodeURIComponent(apiKey)}`
      )
    } catch {
      return { ok: false, error: "Couldn't reach DeBounce." }
    }
    if (res.status === 401)
      return { ok: false, error: "DeBounce rejected this key." }
    if (!res.ok) return { ok: false, error: `DeBounce returned ${res.status}.` }

    let data: { balance?: string | number }
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "DeBounce returned an unexpected response." }
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
