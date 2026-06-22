import { toFiniteNumber } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const emailableAdapter: ToolAdapter = {
  toolId: "emailable",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await fetch("https://api.emailable.com/v1/account", {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
    } catch {
      return { ok: false, error: "Couldn't reach Emailable." }
    }
    if (res.status === 401)
      return { ok: false, error: "Emailable rejected this key." }
    if (!res.ok)
      return { ok: false, error: `Emailable returned ${res.status}.` }

    let data: { available_credits?: unknown }
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "Emailable returned an unexpected response." }
    }
    return {
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: toFiniteNumber(data.available_credits),
          balanceLimit: null,
          unit: "credits",
        },
      ],
    }
  },
}
