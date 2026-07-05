import { timedFetch, toFiniteNumber } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

type BetterContactResponse = {
  success?: boolean
  credits_left?: unknown
  message?: string
}

function finiteNumber(value: unknown): number | null {
  const n = toFiniteNumber(value, Number.NaN)
  return Number.isFinite(n) ? n : null
}

export const bettercontactAdapter: ToolAdapter = {
  toolId: "bettercontact",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await timedFetch("https://app.bettercontact.rocks/api/v2/account", {
        headers: {
          Accept: "application/json",
          "X-API-Key": apiKey,
        },
      })
    } catch {
      return { ok: false, error: "Couldn't reach BetterContact." }
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "BetterContact rejected this key." }
    }
    if (!res.ok)
      return { ok: false, error: `BetterContact returned ${res.status}.` }

    let data: BetterContactResponse
    try {
      data = await res.json()
    } catch {
      return {
        ok: false,
        error: "BetterContact returned an unexpected response.",
      }
    }

    if (data.success === false) {
      return {
        ok: false,
        error: data.message ?? "BetterContact returned an error.",
      }
    }

    const balance = finiteNumber(data.credits_left)
    if (balance === null) {
      return {
        ok: false,
        error: "BetterContact returned an unexpected response.",
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
