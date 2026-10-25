import { credentialPair, finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

// Hand-written because Icypeas wants the key owner's account email in the
// JSON body beside the key in the header. The catalog has one `{key}`
// placeholder and sends a static body verbatim.
const UNEXPECTED = "Icypeas returned an unexpected response."

export const icypeasAdapter: ToolAdapter = {
  toolId: "icypeas",
  async readBalance(secret: string): Promise<AdapterResult> {
    const pair = credentialPair(secret, "api_key", "email")
    if (!pair) {
      return {
        ok: false,
        error: "Icypeas needs an API key and the account email.",
      }
    }
    const [apiKey, email] = pair

    let res: Response
    try {
      res = await timedFetch(
        "https://app.icypeas.com/api/a/actions/subscription-information",
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: apiKey,
          },
          body: JSON.stringify({ email }),
        }
      )
    } catch {
      return { ok: false, error: "Couldn't reach Icypeas." }
    }
    if (res.status === 401 || res.status === 403)
      return { ok: false, error: "Icypeas rejected this API key." }
    if (!res.ok) return { ok: false, error: `Icypeas returned ${res.status}.` }

    let data: { credits?: unknown; success?: unknown } | null
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: UNEXPECTED }
    }
    // Icypeas answers a validation failure with a 200 and `success: false`.
    if (data?.success === false)
      return { ok: false, error: "Icypeas did not accept this account email." }
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
