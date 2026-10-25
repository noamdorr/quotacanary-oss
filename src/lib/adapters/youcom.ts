import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

// Hand-written because the balance arrives in USD cents (fractional, e.g.
// 718924.5) and the catalog has no cents unit. It is the organization's shared
// pool for an org member's key, the personal balance otherwise.
const YOUCOM_BALANCE_URL = "https://api.you.com/v1/billing/account_balance"

const UNEXPECTED = "You.com returned an unexpected response."

export const youcomAdapter: ToolAdapter = {
  toolId: "youcom",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await timedFetch(YOUCOM_BALANCE_URL, {
        headers: { Accept: "application/json", "X-API-Key": apiKey },
      })
    } catch {
      return { ok: false, error: "Couldn't reach You.com." }
    }
    if (res.status === 401)
      return { ok: false, error: "You.com rejected this key." }
    // 403 is a valid key without the scope for the billing path.
    if (res.status === 403)
      return { ok: false, error: "This You.com key can't read the balance." }
    if (!res.ok) return { ok: false, error: `You.com returned ${res.status}.` }

    let data: { data?: { attributes?: { balance?: unknown } } }
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: UNEXPECTED }
    }
    const cents = finiteOrNull(data?.data?.attributes?.balance)
    if (cents === null) return { ok: false, error: UNEXPECTED }
    return {
      ok: true,
      balances: [
        {
          creditType: "balance",
          label: "Balance",
          balance: cents / 100,
          balanceLimit: null,
          unit: "usd",
        },
      ],
    }
  },
}
