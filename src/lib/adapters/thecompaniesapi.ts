import { credentialPair, finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

// Hand-written because The Companies API reads credits per team, and the team
// id is a second value the user copies from the dashboard (no endpoint lists
// a token's teams). The catalog has one `{key}` placeholder for the path.
const UNEXPECTED = "The Companies API returned an unexpected response."

export const thecompaniesapiAdapter: ToolAdapter = {
  toolId: "thecompaniesapi",
  async readBalance(secret: string): Promise<AdapterResult> {
    const pair = credentialPair(secret, "api_token", "team_id")
    if (!pair) {
      return {
        ok: false,
        error: "The Companies API needs an API token and team ID.",
      }
    }
    const [apiToken, teamId] = pair

    let res: Response
    try {
      res = await timedFetch(
        `https://api.thecompaniesapi.com/v2/teams/${encodeURIComponent(teamId)}`,
        {
          // The raw token after "Basic", as the vendor documents it.
          headers: {
            Accept: "application/json",
            Authorization: `Basic ${apiToken}`,
          },
        }
      )
    } catch {
      return { ok: false, error: "Couldn't reach The Companies API." }
    }
    if (res.status === 401)
      return { ok: false, error: "The Companies API rejected this token." }
    if (res.status === 403 || res.status === 404)
      return {
        ok: false,
        error: "The Companies API has no team with this ID for this token.",
      }
    if (!res.ok)
      return { ok: false, error: `The Companies API returned ${res.status}.` }

    let data: { credits?: unknown } | null
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: UNEXPECTED }
    }
    const balance = finiteOrNull(data?.credits)
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
