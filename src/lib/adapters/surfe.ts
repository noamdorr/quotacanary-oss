import { toFiniteNumber } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const surfeAdapter: ToolAdapter = {
  toolId: "surfe",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await fetch("https://api.surfe.com/v1/credits", {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
    } catch {
      return { ok: false, error: "Couldn't reach Surfe." }
    }
    if (res.status === 401)
      return { ok: false, error: "Surfe rejected this key." }
    if (!res.ok) return { ok: false, error: `Surfe returned ${res.status}.` }

    let data: {
      totalEmail?: number
      totalMobile?: number
      totalSearch?: number
    }
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "Surfe returned an unexpected response." }
    }
    return {
      ok: true,
      balances: [
        {
          creditType: "email",
          label: "Email Credits",
          balance: toFiniteNumber(data.totalEmail),
          balanceLimit: null,
          unit: "credits",
        },
        {
          creditType: "mobile",
          label: "Mobile Credits",
          balance: toFiniteNumber(data.totalMobile),
          balanceLimit: null,
          unit: "credits",
        },
        {
          creditType: "search",
          label: "Search Credits",
          balance: toFiniteNumber(data.totalSearch),
          balanceLimit: null,
          unit: "credits",
        },
      ],
    }
  },
}
