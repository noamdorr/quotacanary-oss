import { toFiniteNumber } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const clearoutAdapter: ToolAdapter = {
  toolId: "clearout",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await fetch("https://api.clearout.io/v2/email_verify/getcredits", {
        headers: { Authorization: apiKey },
      })
    } catch {
      return { ok: false, error: "Couldn't reach Clearout." }
    }
    if (res.status === 401)
      return { ok: false, error: "Clearout rejected this key." }
    if (!res.ok) return { ok: false, error: `Clearout returned ${res.status}.` }

    let data: {
      data?: { available_credits?: number; credits?: { total?: number } }
    }
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "Clearout returned an unexpected response." }
    }
    return {
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: toFiniteNumber(data.data?.available_credits),
          balanceLimit: toFiniteNumber(data.data?.credits?.total) || null,
          unit: "credits",
        },
      ],
    }
  },
}
