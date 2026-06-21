import { toFiniteNumber } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const dropcontactAdapter: ToolAdapter = {
  toolId: "dropcontact",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await fetch("https://api.dropcontact.com/v1/enrich/all", {
        method: "POST",
        headers: {
          "X-Access-Token": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ data: [{}] }),
      })
    } catch {
      return { ok: false, error: "Couldn't reach Dropcontact." }
    }
    if (res.status === 401)
      return { ok: false, error: "Dropcontact rejected this key." }
    if (!res.ok)
      return { ok: false, error: `Dropcontact returned ${res.status}.` }

    let data: { credits_left?: number }
    try {
      data = await res.json()
    } catch {
      return {
        ok: false,
        error: "Dropcontact returned an unexpected response.",
      }
    }
    return {
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: toFiniteNumber(data.credits_left),
          balanceLimit: null,
          unit: "credits",
        },
      ],
    }
  },
}
