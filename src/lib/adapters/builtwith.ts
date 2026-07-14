import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

type BuiltWithDiscoveryResponse = {
  credits_total?: unknown
  credits_available?: unknown
  error?: string | { message?: string }
  message?: string
}

function errorMessage(data: BuiltWithDiscoveryResponse | null): string | null {
  if (!data) return null
  if (typeof data.error === "string") return data.error
  if (typeof data.error?.message === "string") return data.error.message
  return data.message ?? null
}

async function readJson(
  res: Response
): Promise<BuiltWithDiscoveryResponse | null> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

export const builtwithAdapter: ToolAdapter = {
  toolId: "builtwith",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await timedFetch(
        "https://payments.builtwith.com/v1/billing/api-discovery",
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
        }
      )
    } catch {
      return { ok: false, error: "Couldn't reach BuiltWith." }
    }

    if (res.status === 401) {
      return { ok: false, error: "BuiltWith rejected this key." }
    }
    if (res.status === 403) {
      return {
        ok: false,
        error: "BuiltWith billing is suspended for this account.",
      }
    }

    const data = await readJson(res)
    if (!res.ok) {
      return {
        ok: false,
        error: errorMessage(data) ?? `BuiltWith returned ${res.status}.`,
      }
    }
    if (!data)
      return { ok: false, error: "BuiltWith returned an unexpected response." }

    const balance = finiteOrNull(data.credits_available)
    if (balance === null) {
      return { ok: false, error: "BuiltWith returned an unexpected response." }
    }

    return {
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "API Credits",
          balance,
          balanceLimit: finiteOrNull(data.credits_total),
          unit: "credits",
        },
      ],
    }
  },
}
