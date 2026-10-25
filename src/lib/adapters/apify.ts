import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

// Hand-written because it takes two requests (QUO-282): the plan's included
// monthly credit is data.plan.monthlyUsageCreditsUsd on GET /v2/users/me, and
// the usage this cycle is data.current.monthlyUsageUsd on GET
// /v2/users/me/limits. That second body also has data.limits.maxMonthlyUsageUsd,
// but that is the account's spending cap (500 by default), not what the plan
// includes, so it is never read.
const APIFY_API_URL = "https://api.apify.com/v2"

const UNEXPECTED = "Apify returned an unexpected response."

async function getJson(
  path: string,
  apiKey: string
): Promise<{ status: number; body?: unknown }> {
  const res = await timedFetch(`${APIFY_API_URL}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) return { status: res.status }
  try {
    return { status: res.status, body: await res.json() }
  } catch {
    return { status: res.status, body: undefined }
  }
}

type ApifyMe = { data?: { plan?: { monthlyUsageCreditsUsd?: unknown } } }
type ApifyLimits = { data?: { current?: { monthlyUsageUsd?: unknown } } }

export const apifyAdapter: ToolAdapter = {
  toolId: "apify",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let me: { status: number; body?: unknown }
    let limits: { status: number; body?: unknown }
    try {
      me = await getJson("/users/me", apiKey)
      if (me.status === 401 || me.status === 403)
        return { ok: false, error: "Apify rejected this key." }
      if (me.status < 200 || me.status >= 300)
        return { ok: false, error: `Apify returned ${me.status}.` }
      limits = await getJson("/users/me/limits", apiKey)
    } catch {
      return { ok: false, error: "Couldn't reach Apify." }
    }
    if (limits.status === 401 || limits.status === 403)
      return { ok: false, error: "Apify rejected this key." }
    if (limits.status < 200 || limits.status >= 300)
      return { ok: false, error: `Apify returned ${limits.status}.` }
    if (me.body === undefined || limits.body === undefined)
      return { ok: false, error: UNEXPECTED }

    const included = finiteOrNull(
      (me.body as ApifyMe)?.data?.plan?.monthlyUsageCreditsUsd
    )
    if (included === null) return { ok: false, error: UNEXPECTED }
    const used =
      finiteOrNull(
        (limits.body as ApifyLimits)?.data?.current?.monthlyUsageUsd
      ) ?? 0

    return {
      ok: true,
      balances: [
        {
          creditType: "usage",
          label: "Monthly Usage Left",
          // Usage past the included credit is overage billed up to the
          // spending cap; it shows as 0 left, never a negative balance.
          balance: Math.max(included - used, 0),
          balanceLimit: included,
          unit: "usd",
        },
      ],
    }
  },
}
