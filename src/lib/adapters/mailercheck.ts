import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const mailercheckAdapter: ToolAdapter = {
  toolId: "mailercheck",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await timedFetch("https://app.mailercheck.com/api/credits", {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
    } catch {
      return { ok: false, error: "Couldn't reach MailerCheck." }
    }

    if (res.status === 401 || res.status === 403)
      return { ok: false, error: "MailerCheck rejected this key." }
    if (!res.ok)
      return { ok: false, error: `MailerCheck returned ${res.status}.` }

    let data: { total?: unknown }
    try {
      data = await res.json()
    } catch {
      return {
        ok: false,
        error: "MailerCheck returned an unexpected response.",
      }
    }

    const balance = finiteOrNull(data.total)
    if (balance === null) {
      return {
        ok: false,
        error: "MailerCheck returned an unexpected response.",
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
