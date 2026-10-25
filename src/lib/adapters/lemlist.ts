import { Buffer } from "node:buffer"
import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

// Hand-written because lemlist uses HTTP Basic auth with an empty username
// and the API key as the password: `Authorization: Basic base64(":" + key)`.
// The catalog's `{key}` template substitutes the key verbatim and cannot
// base64-encode it.
const LEMLIST_CREDITS_URL = "https://api.lemlist.com/api/team/credits"

const UNEXPECTED = "lemlist returned an unexpected response."

export const lemlistAdapter: ToolAdapter = {
  toolId: "lemlist",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await timedFetch(LEMLIST_CREDITS_URL, {
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${Buffer.from(`:${apiKey}`).toString("base64")}`,
        },
      })
    } catch {
      return { ok: false, error: "Couldn't reach lemlist." }
    }
    if (res.status === 401 || res.status === 403)
      return { ok: false, error: "lemlist rejected this key." }
    if (!res.ok) return { ok: false, error: `lemlist returned ${res.status}.` }

    let data: { credits?: unknown }
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: UNEXPECTED }
    }
    // `credits` is the team's whole remaining balance (it equals
    // details.remaining.total); the details split it by source.
    const credits = finiteOrNull(data?.credits)
    if (credits === null) return { ok: false, error: UNEXPECTED }
    return {
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: credits,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    }
  },
}
