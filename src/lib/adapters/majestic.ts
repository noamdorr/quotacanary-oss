import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, BalanceReading, ToolAdapter } from "./types"

// Hand-written because Majestic answers every failure with HTTP 200 and a
// non-"OK" Code, and its ErrorMessage echoes the submitted key back
// ("API Key does not appear to be correct: API_KEY - '<key>'"). The catalog
// could only pass that message through verbatim, which would store and show
// the key, so the error copy is mapped here from Code instead.
const MAJESTIC_API_URL = "https://api.majestic.com/api/json"

// Codes that mean the key itself is wrong or missing: Majestic's "Common
// errors" page, plus AuthenticationRequired (sent for a missing key). A bad
// key comes back as the generic FailedRequestViaAPI, matched on its message.
const KEY_CODES = new Set([
  "AuthenticationFailed",
  "AuthenticationRequired",
  "FailedAuth",
])

const UNEXPECTED = "Majestic returned an unexpected response."

// The global remaining totals across every active subscription.
const POOLS = [
  {
    creditType: "analysis_units",
    label: "Analysis units",
    field: "TotalAnalysisResUnits",
  },
  {
    creditType: "retrieval_units",
    label: "Retrieval units",
    field: "TotalRetrievalResUnits",
  },
  {
    creditType: "index_item_info_units",
    label: "Index item info units",
    field: "TotalIndexItemInfoResUnits",
  },
] as const

type MajesticResponse = Record<string, unknown>

function codeError(code: string, message: unknown): string {
  if (KEY_CODES.has(code)) return "Majestic rejected this key."
  if (
    code === "FailedRequestViaAPI" &&
    typeof message === "string" &&
    /api key/i.test(message)
  )
    return "Majestic rejected this key."
  return /^[A-Za-z]+$/.test(code)
    ? `Majestic returned ${code}.`
    : "Majestic returned an error."
}

export const majesticAdapter: ToolAdapter = {
  toolId: "majestic",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      // POST with a form body (the docs advise POST over GET) keeps the key
      // out of the URL; Majestic documents no header auth.
      res = await timedFetch(MAJESTIC_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          app_api_key: apiKey,
          cmd: "GetSubscriptionInfo",
        }).toString(),
      })
    } catch {
      return { ok: false, error: "Couldn't reach Majestic." }
    }
    if (res.status === 401 || res.status === 403)
      return { ok: false, error: "Majestic rejected this key." }
    if (!res.ok) return { ok: false, error: `Majestic returned ${res.status}.` }

    let data: MajesticResponse
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: UNEXPECTED }
    }
    if (typeof data?.Code !== "string") return { ok: false, error: UNEXPECTED }
    if (data.Code !== "OK")
      return { ok: false, error: codeError(data.Code, data.ErrorMessage) }

    const balances: BalanceReading[] = []
    for (const pool of POOLS) {
      const balance = finiteOrNull(data[pool.field])
      if (balance === null) continue
      balances.push({
        creditType: pool.creditType,
        label: pool.label,
        balance,
        balanceLimit: null,
        unit: "credits",
      })
    }
    if (balances.length === 0) return { ok: false, error: UNEXPECTED }
    return { ok: true, balances }
  },
}
