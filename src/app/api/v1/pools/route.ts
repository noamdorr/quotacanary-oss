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

  // 2. Rate limit
  const allowed = await consumeRateLimit(auth.tokenId)
  if (!allowed) {
    const res = jsonError(429, "rate_limited", "Too many requests. Slow down.")
    res.headers.set("Retry-After", String(RATE_WINDOW_SECONDS))
    res.headers.set("RateLimit-Limit", String(RATE_LIMIT))
    res.headers.set("RateLimit-Remaining", "0")
    // Reset is the window size (conservative); we don't track exact time remaining.
    res.headers.set("RateLimit-Reset", String(RATE_WINDOW_SECONDS))
    return res
  }

  // 3. Parse status filter
  const filter = parseStatusFilter(req.nextUrl.searchParams.get("status"))
  if (!filter.ok) {
    return jsonError(
      400,
      "invalid_status",
      `Invalid status value. Valid values: ${KNOWN_STATUSES.join(", ")}.`
    )
  }

  // 4. Fetch + serialize (userId comes ONLY from the verified token — never from query params)
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

  // 5. Apply status filter if provided
  if (filter.statuses !== null) {
    const statuses = filter.statuses
    pools = pools.filter((p) => statuses.has(p.status))
  }

  // 6. Respond
  return jsonOk({ pools })
}
