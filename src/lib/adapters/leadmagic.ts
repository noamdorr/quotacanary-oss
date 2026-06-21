import { toFiniteNumber } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const leadmagicAdapter: ToolAdapter = {
  toolId: "leadmagic",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await fetch("https://api.leadmagic.io/v1/credits", {
        headers: { "X-API-Key": apiKey },
      })
    } catch {
      return { ok: false, error: "Couldn't reach LeadMagic." }
    }
    if (res.status === 401)
      return { ok: false, error: "LeadMagic rejected this key." }
    if (!res.ok)
      return { ok: false, error: `LeadMagic returned ${res.status}.` }

    let data: { credits?: number }
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "LeadMagic returned an unexpected response." }
    }
    return {
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: toFiniteNumber(data.credits),
          balanceLimit: null,
          unit: "credits",
        },
      ],
    }
  },
}
