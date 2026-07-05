import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const searchapiAdapter: ToolAdapter = {
  toolId: "searchapi",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await timedFetch("https://www.searchapi.io/api/v1/me", {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
    } catch {
      return { ok: false, error: "Couldn't reach SearchApi." }
    }
    if (res.status === 401)
      return { ok: false, error: "SearchApi rejected this key." }
    if (!res.ok)
      return { ok: false, error: `SearchApi returned ${res.status}.` }

    let data: {
      account?: { remaining_credits?: number; monthly_allowance?: number }
    }
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "SearchApi returned an unexpected response." }
    }
    const balance = finiteOrNull(data.account?.remaining_credits)
    if (balance === null) {
      return { ok: false, error: "SearchApi returned an unexpected response." }
    }
    return {
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance,
          balanceLimit: finiteOrNull(data.account?.monthly_allowance) || null,
          unit: "credits",
        },
      ],
    }
  },
}
