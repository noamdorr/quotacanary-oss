import { Buffer } from "node:buffer"
import { credentialPair, finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

// Hand-written because Twilio authenticates with HTTP Basic over two values
// (Account SID as username, Auth token as password) and puts the Account SID
// in the path. The catalog has one `{key}` placeholder and cannot
// base64-encode it.
const UNEXPECTED = "Twilio returned an unexpected response."

export const twilioAdapter: ToolAdapter = {
  toolId: "twilio",
  async readBalance(secret: string): Promise<AdapterResult> {
    const pair = credentialPair(secret, "account_sid", "auth_token")
    if (!pair) {
      return { ok: false, error: "Twilio needs an Account SID and Auth token." }
    }
    const [accountSid, authToken] = pair

    let res: Response
    try {
      res = await timedFetch(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Balance.json`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          },
        }
      )
    } catch {
      return { ok: false, error: "Couldn't reach Twilio." }
    }
    if (res.status === 401 || res.status === 403)
      return { ok: false, error: "Twilio rejected these credentials." }
    if (!res.ok) return { ok: false, error: `Twilio returned ${res.status}.` }

    let data: { balance?: unknown; currency?: unknown }
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: UNEXPECTED }
    }
    // The pool is labeled USD; a balance in another currency would be
    // mislabeled, so it reads as unexpected until a currency unit exists.
    if (data?.currency != null && data.currency !== "USD")
      return { ok: false, error: UNEXPECTED }
    // `balance` is a decimal string ("0.05"). Subaccounts carry no balance,
    // which lands here too.
    const balance = finiteOrNull(data?.balance)
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
