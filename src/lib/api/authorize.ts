import { jsonError } from "@/lib/api/respond"
import {
  type ApiTokenScope,
  RATE_LIMIT,
  RATE_WINDOW_SECONDS,
  consumeRateLimit,
  verifyApiToken,
} from "@/lib/auth/api-token"
import type { NextResponse } from "next/server"

export type RateState = Awaited<ReturnType<typeof consumeRateLimit>>
export type TokenAuth = NonNullable<Awaited<ReturnType<typeof verifyApiToken>>>

export type Authorized =
  | { ok: true; auth: TokenAuth; rate: RateState }
  | { ok: false; res: NextResponse }

// The three gates GET /api/v1/pools runs inline, in the same order and with
// the same responses: token, scope (checked before any budget is spent), then
// the per-token rate limit shared with the pools endpoint and MCP. Used by the
// write endpoints (QUO-187); the pools route is unchanged.
export async function authorizeApiRequest(
  req: Request,
  scope: ApiTokenScope
): Promise<Authorized> {
  const auth = await verifyApiToken(req)
  if (!auth) {
    const res = jsonError(
      401,
      "unauthorized",
      "Provide a valid API token as 'Authorization: Bearer qc_live_...'."
    )
    res.headers.set("WWW-Authenticate", "Bearer")
    return { ok: false, res }
  }

  if (!auth.scopes.includes(scope)) {
    const res = jsonError(
      403,
      "insufficient_scope",
      `This token does not have the ${scope} scope.`
    )
    res.headers.set("WWW-Authenticate", 'Bearer error="insufficient_scope"')
    return { ok: false, res: withScopesHeader(res, auth) }
  }

  const rate = await consumeRateLimit(auth.tokenId)
  if (!rate.allowed) {
    const res = jsonError(429, "rate_limited", "Too many requests. Slow down.")
    const reset = String(rate.resetSeconds ?? RATE_WINDOW_SECONDS)
    res.headers.set("Retry-After", reset)
    res.headers.set("RateLimit-Limit", String(RATE_LIMIT))
    res.headers.set("RateLimit-Remaining", "0")
    res.headers.set("RateLimit-Reset", reset)
    return { ok: false, res: withScopesHeader(res, auth) }
  }

  return { ok: true, auth, rate }
}

export const SCOPES_HEADER = "X-QuotaCanary-Scopes"

// The token's scopes, space-separated, on every response after the token was
// accepted (success or any 4xx past the 401), so a client learns what the
// token can do up front instead of on its first 403. The Mac app reads it off
// its validation GET (QUO-194). Never on a 401: there is no token to describe.
export function withScopesHeader<T extends Response>(
  res: T,
  auth: TokenAuth
): T {
  res.headers.set(SCOPES_HEADER, auth.scopes.join(" "))
  return res
}

// RateLimit-* on a successful response; a fail-open limiter leaves remaining
// and reset unknown, so those two are omitted rather than invented.
export function withRateLimitHeaders<T extends Response>(
  res: T,
  rate: RateState
): T {
  res.headers.set("RateLimit-Limit", String(RATE_LIMIT))
  if (rate.remaining !== null) {
    res.headers.set("RateLimit-Remaining", String(rate.remaining))
  }
  if (rate.resetSeconds !== null) {
    res.headers.set("RateLimit-Reset", String(rate.resetSeconds))
  }
  return res
}
