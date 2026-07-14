import { jsonError, jsonOk } from "@/lib/api/respond"
import { type PoolPayload, serializePoolRow } from "@/lib/api/serialize"
import { KNOWN_STATUSES, parseStatusFilter } from "@/lib/api/status-filter"
import {
  RATE_LIMIT,
  RATE_WINDOW_SECONDS,
  consumeRateLimit,
  verifyApiToken,
} from "@/lib/auth/api-token"
import { listConnectionsWithBalance } from "@/lib/db/connections"
import { toPoolRows } from "@/lib/pool-rows"
import { createAdminClient } from "@/lib/supabase/admin"
import type { NextRequest } from "next/server"

export const dynamic = "force-dynamic"
export const maxDuration = 15

export async function GET(req: NextRequest) {
  // 1. Authenticate
  const auth = await verifyApiToken(req)
  if (!auth) {
    const res = jsonError(
      401,
      "unauthorized",
      "Provide a valid API token as 'Authorization: Bearer qc_live_...'."
    )
    res.headers.set("WWW-Authenticate", "Bearer")
    return res
  }

  // 2. Scope check (tokens carry scopes; this endpoint requires "read")
  if (!auth.scopes.includes("read")) {
    const res = jsonError(
      403,
      "insufficient_scope",
      "This token does not have the read scope."
    )
    res.headers.set("WWW-Authenticate", 'Bearer error="insufficient_scope"')
    return res
  }

  // 3. Rate limit
  const rate = await consumeRateLimit(auth.tokenId)
  if (!rate.allowed) {
    const res = jsonError(429, "rate_limited", "Too many requests. Slow down.")
    // Reset falls back to the window size when the limiter did not report it.
    const reset = String(rate.resetSeconds ?? RATE_WINDOW_SECONDS)
    res.headers.set("Retry-After", reset)
    res.headers.set("RateLimit-Limit", String(RATE_LIMIT))
    res.headers.set("RateLimit-Remaining", "0")
    res.headers.set("RateLimit-Reset", reset)
    return res
  }

  // 4. Parse status filter
  const filter = parseStatusFilter(req.nextUrl.searchParams.get("status"))
  if (!filter.ok) {
    return jsonError(
      400,
      "invalid_status",
      `Invalid status value. Valid values: ${KNOWN_STATUSES.join(", ")}.`
    )
  }

  // 5. Fetch + serialize (userId comes ONLY from the verified token, never from query params)
  const supabase = createAdminClient()
  let pools: PoolPayload[]
  try {
    const connections = await listConnectionsWithBalance(supabase, auth.userId)
    pools = toPoolRows(connections).map(serializePoolRow)
  } catch {
    return jsonError(
      500,
      "internal",
      "Failed to fetch pools. Try again shortly."
    )
  }

  // 6. Apply status filter if provided
  if (filter.statuses !== null) {
    const statuses = filter.statuses
    pools = pools.filter((p) => statuses.has(p.status))
  }

  // 7. Respond (fail-open leaves remaining/reset unknown; omit those headers)
  const res = jsonOk({ pools })
  res.headers.set("RateLimit-Limit", String(RATE_LIMIT))
  if (rate.remaining !== null) {
    res.headers.set("RateLimit-Remaining", String(rate.remaining))
  }
  if (rate.resetSeconds !== null) {
    res.headers.set("RateLimit-Reset", String(rate.resetSeconds))
  }
  return res
}
