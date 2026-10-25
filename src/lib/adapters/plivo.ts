import { Buffer } from "node:buffer"
import { credentialPair, finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

// Hand-written because Plivo authenticates with HTTP Basic over two values
// (Auth ID as username, Auth token as password) and puts the Auth ID in the
// path. The catalog has one `{key}` placeholder and cannot base64-encode it.
const UNEXPECTED = "Plivo returned an unexpected response."

export const plivoAdapter: ToolAdapter = {
  toolId: "plivo",
  async readBalance(secret: string): Promise<AdapterResult> {
    const pair = credentialPair(secret, "auth_id", "auth_token")
    if (!pair) {
      return { ok: false, error: "Plivo needs an Auth ID and Auth token." }
    }
    const [authId, authToken] = pair

    let res: Response
    try {
      res = await timedFetch(
        `https://api.plivo.com/v1/Account/${encodeURIComponent(authId)}/`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Basic ${Buffer.from(`${authId}:${authToken}`).toString("base64")}`,
          },
        }
      )
    } catch {
      return { ok: false, error: "Couldn't reach Plivo." }
    }
    if (res.status === 401 || res.status === 403)
      return { ok: false, error: "Plivo rejected these credentials." }
    if (!res.ok) return { ok: false, error: `Plivo returned ${res.status}.` }

    let data: { cash_credits?: unknown }
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: UNEXPECTED }
    }
    // `cash_credits` is a decimal string in USD ("1.80900").
    const balance = finiteOrNull(data?.cash_credits)
    if (balance === null) return { ok: false, error: UNEXPECTED }
    return {
      ok: true,
      balances: [
        {
          creditType: "balance",
          label: "Balance (USD)",
          balance,
          balanceLimit: null,
          unit: "usd",
        },
      ],
    }
  },
}
