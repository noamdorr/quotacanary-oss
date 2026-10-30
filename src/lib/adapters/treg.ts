import { credentialPair, finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

// Hand-written because the balance route takes the integer org id in the path
// (a slug answers 422), a second value beside the token, and the catalog has
// one `{key}` placeholder. The token goes in X-Treg-Token; Bearer is a 401.
const UNEXPECTED = "treg returned an unexpected response."

export const tregAdapter: ToolAdapter = {
  toolId: "treg",
  async readBalance(secret: string): Promise<AdapterResult> {
    const pair = credentialPair(secret, "api_token", "org_id")
    if (!pair) {
      return { ok: false, error: "treg needs an API token and org ID." }
    }
    const [apiToken, orgId] = pair

    let res: Response
    try {
      res = await timedFetch(
        `https://treg.to/orgs/${encodeURIComponent(orgId)}/balance`,
        { headers: { Accept: "application/json", "X-Treg-Token": apiToken } }
      )
    } catch {
      return { ok: false, error: "Couldn't reach treg." }
    }
    if (res.status === 401)
      return { ok: false, error: "treg rejected this token." }
    // A slug for the id (422), an unknown org (404), an identity token with no
    // pinned org (400), or a token that may not read this org (403).
    if ([400, 403, 404, 422].includes(res.status))
      return {
        ok: false,
        error: "This treg token can't read the balance of this org ID.",
      }
    if (!res.ok) return { ok: false, error: `treg returned ${res.status}.` }

    // The body also carries a ledger page; only the USD figure is read.
    let data: { balance_usd?: unknown } | null
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: UNEXPECTED }
    }
    const balance = finiteOrNull(data?.balance_usd)
    if (balance === null) return { ok: false, error: UNEXPECTED }
    return {
      ok: true,
      balances: [
        {
          creditType: "balance",
          label: "Balance",
          balance,
          balanceLimit: null,
          unit: "usd",
        },
      ],
    }
  },
}
