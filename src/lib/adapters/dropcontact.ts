import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

// Dropcontact has no dedicated credits endpoint. Their docs say to POST one
// empty object to /enrich/all, which "will return your remaining credits
// without consuming any" and enriches nothing - so this preserves the
// read-only promise despite the POST verb (verified 2026-07-05,
// developer.dropcontact.com).
export const dropcontactAdapter: ToolAdapter = {
  toolId: "dropcontact",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await timedFetch("https://api.dropcontact.com/v1/enrich/all", {
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
    const balance = finiteOrNull(data.credits_left)
    if (balance === null) {
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
          balance,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    }
  },
}
