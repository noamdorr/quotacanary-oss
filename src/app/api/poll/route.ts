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

  let ok = 0
  let failed = 0
  const evaluations: AlertEvaluation[] = []
  for (const c of connections ?? []) {
    const result = await refreshConnectionWith(supabase, c.id)
    if (result.ok) {
      ok++
      if (result.alert) evaluations.push(result.alert)
    } else {
      failed++
    }
  }

  const { sent, failedSends } = await dispatchAlerts(supabase, evaluations)

  return NextResponse.json({
    polled: (connections ?? []).length,
    ok,
    failed,
    alertsSent: sent,
    alertsFailed: failedSends,
  })
}
