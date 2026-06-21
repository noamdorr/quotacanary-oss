import { toFiniteNumber } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const outscraperAdapter: ToolAdapter = {
  toolId: "outscraper",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await fetch("https://api.outscraper.com/profile/balance", {
        headers: { "X-API-KEY": apiKey },
      })
    } catch {
      return { ok: false, error: "Couldn't reach Outscraper." }
    }
    if (res.status === 401 || res.status === 403)
      return { ok: false, error: "Outscraper rejected this key." }
    if (!res.ok)
      return { ok: false, error: `Outscraper returned ${res.status}.` }

    let data: { balance?: unknown; error?: boolean; errorMessage?: string }
    try {
      data = await res.json()
    } catch {
      return {
        ok: false,
        error: "Outscraper returned an unexpected response.",
      }
    }

    if (data.error) {
      return {
        ok: false,
        error: data.errorMessage ?? "Outscraper returned an error.",
      }
    }

    return {
      ok: true,
      balances: [
        {
          creditType: "balance",
          label: "Account Balance",
          balance: toFiniteNumber(data.balance),
          balanceLimit: null,
          unit: "usd",
        },
      ],
    }
  },
}
