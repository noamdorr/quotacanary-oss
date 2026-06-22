import { toFiniteNumber } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

const SEMRUSH_BALANCE_URL = "https://www.semrush.com/users/countapiunits.html"

function parseBalanceUnits(body: string): number | null {
  const firstLine = body
    .trim()
    .split(/\r?\n/)
    .find((line) => line.trim() !== "")

  if (!firstLine) return null

  const balance = toFiniteNumber(firstLine.replace(/,/g, ""), Number.NaN)
  return Number.isFinite(balance) ? balance : null
}

export const semrushAdapter: ToolAdapter = {
  toolId: "semrush",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      // SECURITY: Semrush's countapiunits balance call supports only query-string key auth
      // (header auth exists only for their Listing Management API), so the key can surface in
      // vendor request logs/proxies. Residual exposure; see 2026-06-22 audit.
      res = await fetch(
        `${SEMRUSH_BALANCE_URL}?key=${encodeURIComponent(apiKey)}`,
        {
          headers: {
            Accept: "text/csv, text/plain;q=0.9, application/json;q=0.8",
          },
        }
      )
    } catch {
      return { ok: false, error: "Couldn't reach Semrush." }
    }

    let body: string
    try {
      body = await res.text()
    } catch {
      return { ok: false, error: "Semrush returned an unexpected response." }
    }

    if (res.status === 400 || res.status === 401 || res.status === 403) {
      return { ok: false, error: "Semrush rejected this key." }
    }
    if (!res.ok) return { ok: false, error: `Semrush returned ${res.status}.` }

    const balance = parseBalanceUnits(body)
    if (balance === null) {
      return { ok: false, error: "Semrush returned an unexpected response." }
    }

    return {
      ok: true,
      balances: [
        {
          creditType: "units",
          label: "API Units",
          balance,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    }
  },
}
