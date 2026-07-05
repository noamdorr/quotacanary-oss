import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const findymailAdapter: ToolAdapter = {
  toolId: "findymail",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await timedFetch("https://app.findymail.com/api/credits", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      })
    } catch {
      return { ok: false, error: "Couldn't reach Findymail." }
    }
    if (res.status === 401)
      return { ok: false, error: "Findymail rejected this key." }
    if (!res.ok)
      return { ok: false, error: `Findymail returned ${res.status}.` }

    let data: { credits?: number }
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "Findymail returned an unexpected response." }
    }
    const balance = finiteOrNull(data.credits)
    if (balance === null) {
      return { ok: false, error: "Findymail returned an unexpected response." }
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
