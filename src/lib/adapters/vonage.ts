import { Buffer } from "node:buffer"
import { credentialPair, finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

// Hand-written because Vonage authenticates with HTTP Basic over two values
// (API key as username, API secret as password), which the catalog's single
// `{key}` placeholder cannot base64-encode.
const UNEXPECTED = "Vonage returned an unexpected response."

export const vonageAdapter: ToolAdapter = {
  toolId: "vonage",
  async readBalance(secret: string): Promise<AdapterResult> {
    const pair = credentialPair(secret, "api_key", "api_secret")
    if (!pair) {
      return { ok: false, error: "Vonage needs an API key and API secret." }
    }
    const [apiKey, apiSecret] = pair

    let res: Response
    try {
      res = await timedFetch("https://rest.nexmo.com/account/get-balance", {
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`,
        },
      })
    } catch {
      return { ok: false, error: "Couldn't reach Vonage." }
    }
    if (res.status === 401 || res.status === 403)
      return { ok: false, error: "Vonage rejected these credentials." }
    if (!res.ok) return { ok: false, error: `Vonage returned ${res.status}.` }

    let data: { value?: unknown }
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: UNEXPECTED }
    }
    // `value` is the account balance in EUR (a number).
    const balance = finiteOrNull(data?.value)
    if (balance === null) return { ok: false, error: UNEXPECTED }
    return {
      ok: true,
      balances: [
        {
          creditType: "balance",
          label: "Balance (EUR)",
          balance,
          balanceLimit: null,
          unit: "eur",
        },
      ],
    }
  },
}
