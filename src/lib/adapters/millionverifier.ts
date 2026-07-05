import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const millionverifierAdapter: ToolAdapter = {
  toolId: "millionverifier",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      // SECURITY: MillionVerifier supports only query-string key auth (no header form), so the
      // key can surface in vendor request logs/proxies. Residual exposure; see 2026-06-22 audit.
      res = await timedFetch(
        `https://api.millionverifier.com/api/v3/credits?api=${encodeURIComponent(apiKey)}`
      )
    } catch {
      return { ok: false, error: "Couldn't reach MillionVerifier." }
    }
    if (!res.ok)
      return { ok: false, error: `MillionVerifier returned ${res.status}.` }

    let data: { credits?: number; error?: string }
    try {
      data = await res.json()
    } catch {
      return {
        ok: false,
        error: "MillionVerifier returned an unexpected response.",
      }
    }
    // MillionVerifier returns HTTP 200 with an {error} field on a bad key
    if (data.error) return { ok: false, error: data.error }
    const balance = finiteOrNull(data.credits)
    if (balance === null) {
      return {
        ok: false,
        error: "MillionVerifier returned an unexpected response.",
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
