import "server-only"

import { getAdapter } from "@/lib/adapters/registry"
import type { AdapterResult } from "@/lib/adapters/types"
import { type AlertEvaluation, evaluateSeverity } from "@/lib/alerts/severity"
import {
  type StoppedCheckingEvaluation,
  isRejectedKeyError,
} from "@/lib/alerts/stopped-checking"
import { decrypt } from "@/lib/crypto"
import type { AlertLevel, NotifiedLevels, PoolThresholds } from "@/lib/types"
import type { SupabaseClient } from "@supabase/supabase-js"

// Reads a connection's live balance and persists it. Shared by manual refresh
// (src/lib/actions/connections.ts's refreshConnection, which keeps the
// user-ownership check) and the service-role poll route
// (src/app/api/poll/route.ts). "server-only" rather than "use server": this
// takes a caller-supplied client and does no auth check of its own, so it
// must never be importable as a POST-able server action - the caller is
// responsible for authorization.
//
// A failed read returns the facts the poll needs to decide a "stopped
// checking" alert (QUO-289). Nothing here writes the alert stamp: manual
// refresh runs as the signed-in user, and 065's column grant keeps alert marks
// for the service-role dispatch.
export async function refreshConnectionWith(
  supabase: SupabaseClient,
  connectionId: string
): Promise<
  AdapterResult & {
    alert?: AlertEvaluation
    stopped?: StoppedCheckingEvaluation
  }
> {
  const { data: conn } = await supabase
    .from("connections")
    .select(
      `id, user_id, tool_id, encrypted_key, name, alert_enabled, alert_threshold,
       low_threshold, alert_fired_at, notified_level, notified_levels,
       watched_credit_types, pool_thresholds, failure_alerted_at,
       tool:tools(name, topup_url, default_alert_threshold, default_low_threshold)`
    )
    .eq("id", connectionId)
    .single()
  if (!conn || !conn.encrypted_key)
    return { ok: false, error: "Connection not found." }

  const adapter = getAdapter(conn.tool_id)
  if (!adapter) return { ok: false, error: "Unsupported tool." }

  // biome-ignore lint/suspicious/noExplicitAny: embedded tool select is untyped
  const tool = (conn as any).tool as {
    name: string
    topup_url: string | null
    default_alert_threshold: number | null
    default_low_threshold: number | null
  } | null
  const failureAlertedAt = (conn.failure_alerted_at as string | null) ?? null
  const stopped = (
    consecutiveFailures: number,
    keyRejected: boolean
  ): StoppedCheckingEvaluation => ({
    connectionId,
    userId: conn.user_id,
    toolName: tool?.name ?? "A tool",
    connectionName: conn.name,
    alertEnabled: conn.alert_enabled,
    consecutiveFailures,
    keyRejected,
    failureAlertedAt,
  })

  let result: AdapterResult
  try {
    result = await adapter.readBalance(decrypt(conn.encrypted_key))
  } catch (err) {
    // The stored error stays generic (it renders in the UI); the real cause
    // (timeout vs auth vs vendor 5xx) survives only in the server log.
    console.error(
      `[refresh] adapter threw for ${conn.tool_id} ${connectionId}:`,
      err
    )
    result = { ok: false, error: "Couldn't read this connection's balance." }
  }

  if (!result.ok) {
    const { data: cur } = await supabase
      .from("connections")
      .select("consecutive_failures")
      .eq("id", connectionId)
      .single()
    const failures = (cur?.consecutive_failures ?? 0) + 1
    await supabase
      .from("connections")
      .update({
        status: "error",
        last_error: result.error,
        consecutive_failures: failures,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connectionId)
    return {
      ...result,
      stopped: stopped(failures, isRejectedKeyError(result.error)),
    }
  }

  const { error: insertErr } = await supabase.from("balances").insert(
    result.balances.map((b) => ({
      connection_id: connectionId,
      credit_type: b.creditType,
      label: b.label,
      balance: b.balance,
      balance_limit: b.balanceLimit,
      unit: b.unit,
    }))
  )
  if (insertErr) {
    const { data: cur } = await supabase
      .from("connections")
      .select("consecutive_failures")
      .eq("id", connectionId)
      .single()
    const failures = (cur?.consecutive_failures ?? 0) + 1
    await supabase
      .from("connections")
      .update({
        status: "error",
        last_error: "Couldn't record the balance.",
        consecutive_failures: failures,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connectionId)
    // Our own write failed, not the user's key or vendor: no stopped-checking
    // alert blames them for it.
    return { ok: false, error: "Couldn't record the balance." }
  }

  // Resolve per-pool thresholds and evaluate severity. Email dispatch happens
  // in the poll route, which has the user's email + notify_mode.
  const watched = conn.watched_credit_types as string[] | null
  const poolThresholds = (conn.pool_thresholds as PoolThresholds | null) ?? {}

  const evalPools = result.balances
    .filter((b) => !watched || watched.includes(b.creditType))
    .map((b) => {
      const pt = poolThresholds[b.creditType]
      return {
        creditType: b.creditType,
        label: b.label,
        balance: b.balance,
        unit: b.unit ?? null,
        low:
          pt?.low ?? conn.low_threshold ?? tool?.default_low_threshold ?? null,
        critical:
          pt?.critical ??
          conn.alert_threshold ??
          tool?.default_alert_threshold ??
          null,
      }
    })

  const severity = evaluateSeverity(
    evalPools.map((p) => ({
      balance: p.balance,
      low: p.low,
      critical: p.critical,
    }))
  )

  await supabase
    .from("connections")
    .update({
      status: "active",
      last_error: null,
      consecutive_failures: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId)

  const alert: AlertEvaluation = {
    connectionId,
    userId: conn.user_id,
    toolName: tool?.name ?? "A tool",
    connectionName: conn.name,
    topupUrl: tool?.topup_url ?? null,
    alertEnabled: conn.alert_enabled,
    severity,
    notifiedLevel: (conn.notified_level ?? "none") as AlertLevel,
    notifiedLevels: (conn.notified_levels as NotifiedLevels | null) ?? {},
    pools: evalPools,
    failureAlertedAt,
  }

  return { ...result, alert }
}
