import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

// Hand-written because the balance route takes the integer org id in the path,
// which the key itself names through /auth/me (QUO-423): two calls, one key.
// A secret saved before that is {"api_token","org_id"} JSON; its token is used
// and its org id ignored. The token goes in X-Treg-Token; Bearer is a 401.
const UNEXPECTED = "treg returned an unexpected response."
const NOT_TIED_TO_A_TEAM = "This treg token isn't tied to a team."

type Step = { ok: true; body: unknown } | { ok: false; error: string }

// The key itself, or the api_token of a two-field secret.
function tokenOf(secret: string): string {
  try {
    const parsed: unknown = JSON.parse(secret)
    if (parsed && typeof parsed === "object") {
      const token = (parsed as Record<string, unknown>).api_token
      return typeof token === "string" ? token.trim() : ""
    }
  } catch {
    // Not JSON: the bare key.
  }
  return secret.trim()
}

async function get(url: string, apiToken: string): Promise<Step> {
  let res: Response
  try {
    res = await timedFetch(url, {
      headers: { Accept: "application/json", "X-Treg-Token": apiToken },
    })
  } catch {
    return { ok: false, error: "Couldn't reach treg." }
  }
  if (res.status === 401)
    return { ok: false, error: "treg rejected this token." }
  // A token with no pinned team (400), one that may not read this org (403),
  // or an org that is gone (404).
  if ([400, 403, 404].includes(res.status))
    return { ok: false, error: NOT_TIED_TO_A_TEAM }
  if (!res.ok) return { ok: false, error: `treg returned ${res.status}.` }
  try {
    return { ok: true, body: await res.json() }
  } catch {
    return { ok: false, error: UNEXPECTED }
  }
}

export const tregAdapter: ToolAdapter = {
  toolId: "treg",
  async readBalance(secret: string): Promise<AdapterResult> {
    const apiToken = tokenOf(secret)
    if (!apiToken) return { ok: false, error: "treg needs an API token." }

    const me = await get("https://treg.to/auth/me", apiToken)
    if (!me.ok) return me
    const orgId = (me.body as { org_id?: unknown } | null)?.org_id
    if (typeof orgId !== "number" || !Number.isInteger(orgId) || orgId <= 0)
      return { ok: false, error: NOT_TIED_TO_A_TEAM }

    const res = await get(`https://treg.to/orgs/${orgId}/balance`, apiToken)
    if (!res.ok) return res
    // The body also carries a ledger page; only the USD figure is read.
    const balance = finiteOrNull(
      (res.body as { balance_usd?: unknown } | null)?.balance_usd
    )
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
