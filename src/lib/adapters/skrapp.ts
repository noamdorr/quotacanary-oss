import { toFiniteNumber } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

type SkrappAccountResponse = {
  status_code?: unknown
  message?: string
  error?: string
  credit?: {
    email?: {
      quota?: unknown
      used?: unknown
    }
  }
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null

  const n = toFiniteNumber(value, Number.NaN)
  return Number.isFinite(n) ? n : null
}

export const skrappAdapter: ToolAdapter = {
  toolId: "skrapp",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await fetch("https://api.skrapp.io/api/v2/account", {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Access-Key": apiKey,
        },
      })
    } catch {
      return { ok: false, error: "Couldn't reach Skrapp." }
    }

    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "Skrapp rejected this key." }
    }
    if (!res.ok) return { ok: false, error: `Skrapp returned ${res.status}.` }

    let data: SkrappAccountResponse
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "Skrapp returned an unexpected response." }
    }

    const statusCode = finiteNumber(data.status_code)
    if (statusCode !== null && statusCode >= 400) {
      return {
        ok: false,
        error: data.error ?? data.message ?? "Skrapp returned an error.",
      }
    }

    const quota = finiteNumber(data.credit?.email?.quota)
    const used = finiteNumber(data.credit?.email?.used)
    if (quota === null || used === null) {
      return { ok: false, error: "Skrapp returned an unexpected response." }
    }

    return {
      ok: true,
      balances: [
        {
          creditType: "email",
          label: "Email Credits",
          balance: quota - used,
          balanceLimit: quota,
          unit: "credits",
        },
      ],
    }
  },
}
