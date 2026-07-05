import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const wizaAdapter: ToolAdapter = {
  toolId: "wiza",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await timedFetch("https://wiza.co/api/meta/credits", {
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
    const balance = finiteOrNull(data.credits?.api_credits)
    if (balance === null) {
      return { ok: false, error: "Wiza returned an unexpected response." }
    }
    return {
      ok: true,
      balances: [
        {
          creditType: "api",
          label: "API Credits",
          balance,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    }
  },
}
