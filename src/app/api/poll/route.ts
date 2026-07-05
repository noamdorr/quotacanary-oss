import { timingSafeEqual } from "node:crypto"
import { refreshConnectionWith } from "@/lib/actions/connections"
import { dispatchAlerts } from "@/lib/alerts/dispatch"
import type { AlertEvaluation } from "@/lib/alerts/severity"
import { createAdminClient } from "@/lib/supabase/admin"
import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const secret = process.env.POLL_SECRET
  if (!secret) {
    return NextResponse.json({ error: "not configured" }, { status: 500 })
  }

  const auth = request.headers.get("authorization")
  const expected = `Bearer ${secret}`
  const provided = Buffer.from(auth ?? "")
  const expectedBuf = Buffer.from(expected)
  if (
    provided.length !== expectedBuf.length ||
    !timingSafeEqual(provided, expectedBuf)
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const supabase = createAdminClient()
  const { data: connections, error } = await supabase
    .from("connections")
    .select("id")
    .eq("connection_type", "api")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Refresh in bounded-concurrency batches so one slow/failing vendor can't
  // stall or abort the rest of the run (a throw is isolated per connection).
  const CONCURRENCY = 8
  const all = connections ?? []
  let ok = 0
  let failed = 0
  const evaluations: AlertEvaluation[] = []
  for (let i = 0; i < all.length; i += CONCURRENCY) {
    const chunk = all.slice(i, i + CONCURRENCY)
    const settled = await Promise.allSettled(
      chunk.map((c) => refreshConnectionWith(supabase, c.id))
    )
    for (const s of settled) {
      if (s.status === "fulfilled" && s.value.ok) {
        ok++
        if (s.value.alert) evaluations.push(s.value.alert)
      } else {
        failed++
      }
    }
  }

  const { sent, failedSends } = await dispatchAlerts(supabase, evaluations)

  // Retention (migration 038): drop readings past 90 days, keeping the newest
  // 50 per pool. Non-fatal - a prune failure must not fail the poll run.
  let pruned = 0
  try {
    const { data, error: pruneErr } = await supabase.rpc("prune_balances")
    if (!pruneErr && typeof data === "number") pruned = data
  } catch {
    // ignore: pruning is best-effort housekeeping
  }

  return NextResponse.json({
    polled: all.length,
    ok,
    failed,
    alertsSent: sent,
    alertsFailed: failedSends,
    pruned,
  })
}
