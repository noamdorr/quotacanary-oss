import { toFiniteNumber } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const wizaAdapter: ToolAdapter = {
  toolId: "wiza",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await fetch("https://wiza.co/api/meta/credits", {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
    } catch {
      return { ok: false, error: "Couldn't reach Wiza." }
    }
    if (res.status === 401)
      return { ok: false, error: "Wiza rejected this key." }
    if (!res.ok) return { ok: false, error: `Wiza returned ${res.status}.` }

    let data: { credits?: { api_credits?: number | string } }
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "Wiza returned an unexpected response." }
    }
    return {
      ok: true,
      balances: [
        {
          creditType: "api",
          label: "API Credits",
          balance: toFiniteNumber(data.credits?.api_credits),
          balanceLimit: null,
          unit: "credits",
        },
      ],
    }
  },
}
