import { toFiniteNumber } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const brightdataAdapter: ToolAdapter = {
  toolId: "brightdata",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await fetch("https://api.brightdata.com/customer/balance", {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
    } catch {
      return { ok: false, error: "Couldn't reach Bright Data." }
    }
    if (res.status === 401)
      return { ok: false, error: "Bright Data rejected this key." }
    if (!res.ok)
      return { ok: false, error: `Bright Data returned ${res.status}.` }

    let data: { balance?: unknown }
    try {
      data = await res.json()
    } catch {
      return {
        ok: false,
        error: "Bright Data returned an unexpected response.",
      }
    }
    return {
      ok: true,
      balances: [
        {
          creditType: "balance",
          label: "Balance",
          balance: toFiniteNumber(data.balance),
          balanceLimit: null,
          unit: "usd",
        },
      ],
    }
  },
}
