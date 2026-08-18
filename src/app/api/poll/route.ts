import { timingSafeEqual } from "node:crypto"
import { dispatchAlerts } from "@/lib/alerts/dispatch"
import type { AlertEvaluation } from "@/lib/alerts/severity"
import { sendEmail } from "@/lib/email/client"
import { renderPollAlarmEmail } from "@/lib/email/render/poll-alarm"
import { heartbeatSuffix, shouldEmailOperator } from "@/lib/poll-alarm"
import {
  type PollOutcome,
  classifyPollRun,
  missedRunsSince,
} from "@/lib/poll-run"
import { refreshConnectionWith } from "@/lib/refresh-connection"
import { createAdminClient } from "@/lib/supabase/admin"
import type { SupabaseClient } from "@supabase/supabase-js"
import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const maxDuration = 60

type RunSummary = {
  outcome: PollOutcome
  connections_polled: number
  refresh_ok: number
  refresh_failed: number
  alerts_sent: number
  alerts_failed: number
  alerts_degraded: boolean
  pruned: number
  missed_runs: number
}

// When the previous run started, so this one can tell a quiet schedule from a
// stopped one, and how it ended, so a degradation that persists can be told
// from one flaky vendor. Best-effort: a fresh install has no row, and an
// install that has not run migration 053 has no table.
async function previousRun(
  supabase: SupabaseClient
): Promise<{ startedAt: string; outcome: PollOutcome } | null> {
  const { data, error } = await supabase
    .from("poll_runs")
    .select("started_at, outcome")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error("[poll] previous run lookup failed:", error.message)
    return null
  }
  const row = data as { started_at: string; outcome: PollOutcome } | null
  return row ? { startedAt: row.started_at, outcome: row.outcome } : null
}

type PollableConnection = { id: string; tool_id: string }

// PostgREST clamps every response to `max_rows` (1000 by default - see
// supabase/config.toml and the hosted API's "Max rows"), so an unpaginated
// select drops every connection past the ceiling while still reporting success.
const PAGE_SIZE = 1000

// Keyset paging on `id` rather than offsets: it stays correct under the inserts
// and deletes a long run races with, where offsets skip and repeat rows. The
// loop stops only on an EMPTY page, never on a short one, so an instance
// configured with a max_rows below PAGE_SIZE cannot truncate the run either.
async function fetchApiConnections(supabase: SupabaseClient): Promise<{
  rows: PollableConnection[]
  error: { message: string } | null
}> {
  const rows: PollableConnection[] = []
  let after: string | null = null
  for (;;) {
    const filtered = supabase
      .from("connections")
      .select("id, tool_id")
      .eq("connection_type", "api")
    const { data, error } = await (after ? filtered.gt("id", after) : filtered)
      .order("id", { ascending: true })
      .limit(PAGE_SIZE)
    // A mid-loop failure means a PARTIAL set. Polling it would look like a
    // healthy run over fewer connections, so the whole run fails instead.
    if (error) return { rows: [], error }
    const page = (data ?? []) as PollableConnection[]
    if (page.length === 0) return { rows, error: null }
    rows.push(...page)
    after = page[page.length - 1].id
  }
}

// The tripwire. Whatever ceiling the fetch hits next - a new API cap, a
// misconfigured max_rows, a filter that stopped matching - it can never again
// be silent. Diagnostics only: a failed probe must not fail the poll.
async function countApiConnections(
  supabase: SupabaseClient
): Promise<number | null> {
  const { count, error } = await supabase
    .from("connections")
    .select("id", { count: "exact", head: true })
    .eq("connection_type", "api")
  if (error) {
    console.error("[poll] connection count probe failed:", error.message)
    return null
  }
  return count ?? null
}

// Telemetry must never fail the poll it describes, so every failure here is
// logged and swallowed. The row carries counts only: no connection or user ids,
// no vendor names, no error strings (migration 053).
async function recordRun(
  supabase: SupabaseClient,
  startedAt: Date,
  summary: RunSummary
) {
  const { error } = await supabase.from("poll_runs").insert({
    ...summary,
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    duration_ms: Date.now() - startedAt.getTime(),
  })
  if (error) console.error("[poll] run summary insert failed:", error.message)
}

// The heartbeat (QUO-77). An external monitor expects a ping every interval and
// alarms when one does not arrive, which is the only signal that survives this
// app, its database, or the whole schedule being down - none of which can send
// anything. Unset POLL_HEARTBEAT_URL (the self-host default) means no ping.
// The body carries the same counts as the poll_runs row: no identifiers.
async function pingHeartbeat(summary: RunSummary): Promise<void> {
  const url = process.env.POLL_HEARTBEAT_URL
  if (!url) return

  const target = `${url.replace(/\/+$/, "")}${heartbeatSuffix(summary.outcome)}`
  try {
    const res = await fetch(target, {
      method: "POST",
      body: JSON.stringify(summary),
      // A hanging monitor must not stall the run it is only describing.
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) console.error(`[poll] heartbeat ping ${res.status}`)
  } catch (err) {
    console.error("[poll] heartbeat ping failed:", err)
  }
}

// The operator email (QUO-77). The heartbeat says something is wrong; this says
// what. Unset POLL_ALERT_EMAIL (the self-host default) means no mail. Note that
// a run whose alert delivery is broken cannot mail its own alarm either - that
// blind spot is exactly what the heartbeat covers.
async function emailOperator(
  summary: RunSummary,
  previousOutcome: PollOutcome | null
): Promise<void> {
  const to = process.env.POLL_ALERT_EMAIL
  if (!to) return
  if (
    !shouldEmailOperator({
      outcome: summary.outcome,
      previousOutcome,
      missedRuns: summary.missed_runs,
    })
  ) {
    return
  }

  const { subject, html, text } = renderPollAlarmEmail({
    outcome: summary.outcome,
    connectionsPolled: summary.connections_polled,
    refreshFailed: summary.refresh_failed,
    alertsFailed: summary.alerts_failed,
    alertsDegraded: summary.alerts_degraded,
    missedRuns: summary.missed_runs,
  })
  const result = await sendEmail({ to, subject, html, text, tag: "poll-alarm" })
  if (!result.ok) console.error("[poll] alarm email failed:", result.error)
}

// Both alarms are best-effort and neither may change the outcome of the run
// they describe, so failures are logged inside each and settled here.
async function raiseAlarms(
  summary: RunSummary,
  previousOutcome: PollOutcome | null
): Promise<void> {
  await Promise.allSettled([
    pingHeartbeat(summary),
    emailOperator(summary, previousOutcome),
  ])
}

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
  const startedAt = new Date()
  const previous = await previousRun(supabase)
  const missedRuns = missedRunsSince(previous?.startedAt ?? null)
  if (missedRuns > 0) {
    // The schedule lives outside this repo, so a paused or retimed cron leaves
    // no other trace. Reported on the first run after the gap.
    console.error(`[poll] missed ${missedRuns} scheduled run(s)`)
  }

  const expectedCount = await countApiConnections(supabase)
  const { rows: all, error } = await fetchApiConnections(supabase)
  if (error) {
    // Log the detail server-side only: the response body can end up in cron
    // logs, and the DB message may carry connection/DSN details.
    console.error("[poll] connections query failed:", error.message)
    const summary: RunSummary = {
      outcome: "failed",
      connections_polled: 0,
      refresh_ok: 0,
      refresh_failed: 0,
      alerts_sent: 0,
      alerts_failed: 0,
      alerts_degraded: false,
      pruned: 0,
      missed_runs: missedRuns,
    }
    await recordRun(supabase, startedAt, summary)
    await raiseAlarms(summary, previous?.outcome ?? null)
    return NextResponse.json(
      { error: "query failed", outcome: "failed" },
      { status: 500 }
    )
  }

  // Refresh in bounded-concurrency batches so one slow/failing vendor can't
  // stall or abort the rest of the run (a throw is isolated per connection).
  const CONCURRENCY = 8
  if (expectedCount !== null && expectedCount !== all.length) {
    console.error(
      `[poll] connection fetch truncated: fetched ${all.length} of ${expectedCount}`
    )
  }
  let ok = 0
  let failed = 0
  const evaluations: AlertEvaluation[] = []
  for (let i = 0; i < all.length; i += CONCURRENCY) {
    const chunk = all.slice(i, i + CONCURRENCY)
    const settled = await Promise.allSettled(
      chunk.map((c) => refreshConnectionWith(supabase, c.id))
    )
    for (const [idx, s] of settled.entries()) {
      if (s.status === "fulfilled" && s.value.ok) {
        ok++
        if (s.value.alert) evaluations.push(s.value.alert)
      } else {
        failed++
        // Server-side only (like the query-failure log above): the response
        // counts failures but can't say WHO, and the row's error status heals
        // on the next successful poll, so this log is the only durable trace.
        const conn = chunk[idx]
        const reason =
          s.status === "rejected"
            ? s.reason
            : (!s.value.ok && s.value.error) || "unknown"
        console.error(
          `[poll] refresh failed: ${conn.tool_id} ${conn.id}:`,
          reason
        )
      }
    }
  }

  // alertsDegraded is the only signal that alert delivery is broken: a dispatch
  // that failed outright still reports alertsSent: 0, exactly like a quiet poll.
  const { sent, failedSends, degraded } = await dispatchAlerts(
    supabase,
    evaluations
  )

  // Retention (migration 038): drop readings past 90 days, keeping the newest
  // 50 per pool. Non-fatal - a prune failure must not fail the poll run.
  let pruned = 0
  try {
    const { data, error: pruneErr } = await supabase.rpc("prune_balances")
    if (!pruneErr && typeof data === "number") pruned = data
  } catch {
    // ignore: pruning is best-effort housekeeping
  }

  const outcome = classifyPollRun({
    polled: all.length,
    failed,
    alertsFailed: failedSends,
    alertsDegraded: degraded,
  })
  // One greppable line per non-healthy run, for log-based alerting on hosts
  // where the cron's own exit status is not wired to anything.
  if (outcome !== "ok") {
    console.error(
      `[poll] run ${outcome}: ${failed}/${all.length} refreshes failed, ` +
        `${failedSends} sends failed, alerts ${degraded ? "degraded" : "ok"}`
    )
  }

  const summary: RunSummary = {
    outcome,
    connections_polled: all.length,
    refresh_ok: ok,
    refresh_failed: failed,
    alerts_sent: sent,
    alerts_failed: failedSends,
    alerts_degraded: degraded,
    pruned,
    missed_runs: missedRuns,
  }
  await recordRun(supabase, startedAt, summary)
  await raiseAlarms(summary, previous?.outcome ?? null)

  // A failed run answers 5xx so the caller's own failure handling fires: the
  // hosted cron's start command (railway/poll-cron.json) exits non-zero on a
  // non-2xx, which turns the Railway cron run red. A degraded run stays 200 - it
  // did most of its job, and a red run per flaky vendor would train the
  // operator to ignore the alarm.
  return NextResponse.json(
    {
      outcome,
      polled: all.length,
      ok,
      failed,
      alertsSent: sent,
      alertsFailed: failedSends,
      alertsDegraded: degraded,
      pruned,
      missedRuns,
    },
    { status: outcome === "failed" ? 500 : 200 }
  )
}
