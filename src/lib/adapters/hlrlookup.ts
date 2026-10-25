import { credentialPair, finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

// Hand-written because HLR Lookup takes two values (API key and API secret)
// inside the JSON body. The catalog has one `{key}` placeholder and sends a
// static body verbatim.
const UNEXPECTED = "HLR Lookup returned an unexpected response."

export const hlrlookupAdapter: ToolAdapter = {
  toolId: "hlrlookup",
  async readBalance(secret: string): Promise<AdapterResult> {
    const pair = credentialPair(secret, "api_key", "api_secret")
    if (!pair) {
      return {
        ok: false,
        error: "HLR Lookup needs an API key and API secret.",
      }
    }
    const [apiKey, apiSecret] = pair

    let res: Response
    try {
      res = await timedFetch("https://api.hlrlookup.com/apiv2/balance", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ api_key: apiKey, api_secret: apiSecret }),
      })
    } catch {
      return { ok: false, error: "Couldn't reach HLR Lookup." }
    }
    if (res.status === 401 || res.status === 403)
      return { ok: false, error: "HLR Lookup rejected these credentials." }
    if (!res.ok)
      return { ok: false, error: `HLR Lookup returned ${res.status}.` }

    let data: { body?: { Status?: unknown; Credits?: unknown } } | null
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: UNEXPECTED }
    }
    if (data?.body?.Status !== "OK") return { ok: false, error: UNEXPECTED }
    const balance = finiteOrNull(data.body.Credits)
    if (balance === null) return { ok: false, error: UNEXPECTED }
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
