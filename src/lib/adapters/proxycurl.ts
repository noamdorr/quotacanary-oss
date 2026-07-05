import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

type ProxycurlResponse = {
  credit_balance?: unknown
}

export const proxycurlAdapter: ToolAdapter = {
  toolId: "proxycurl",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await timedFetch("https://nubela.co/api/v1/meta/credit-balance", {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
    } catch {
      return { ok: false, error: "Couldn't reach Proxycurl." }
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "Proxycurl rejected this key." }
    }
    if (!res.ok)
      return { ok: false, error: `Proxycurl returned ${res.status}.` }

    let data: ProxycurlResponse
    try {
      data = await res.json()
    } catch {
      return {
        ok: false,
        error: "Proxycurl returned an unexpected response.",
      }
    }

    const balance = finiteOrNull(data.credit_balance)
    if (balance === null) {
      return {
        ok: false,
        error: "Proxycurl returned an unexpected response.",
      }
    }
    return {
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    }
  },
}
