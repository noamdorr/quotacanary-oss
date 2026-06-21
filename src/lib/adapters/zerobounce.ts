import { toFiniteNumber } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const zerobounceAdapter: ToolAdapter = {
  toolId: "zerobounce",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await fetch(
        `https://api.zerobounce.net/v2/getcredits?api_key=${encodeURIComponent(apiKey)}`
      )
    } catch {
      return { ok: false, error: "Couldn't reach ZeroBounce." }
    }
    if (!res.ok)
      return { ok: false, error: `ZeroBounce returned ${res.status}.` }

    let data: { Credits?: unknown }
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "ZeroBounce returned an unexpected response." }
    }
    const credits = toFiniteNumber(data.Credits)
    if (credits < 0)
      return { ok: false, error: "ZeroBounce rejected this key." }
    return {
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: credits,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    }
  },
}
