import { decrypt } from "@/lib/crypto"
import { sendEmail } from "@/lib/email/client"
import {
  type AlertEmailModel,
  renderAlertEmail,
} from "@/lib/email/render/alert"
import type { AlertLevel, NotifyMode } from "@/lib/types"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  type AlertDeliveryLevel,
  type AlertDestinationEvent,
  type AlertDestinationRow,
  isDestinationLevelAllowed,
  postAlertDestination,
} from "./destinations"
import { type AlertEvaluation, nextAlertAction, rank } from "./severity"

// Creates in-app alert events for connections whose severity rose above their
// stored notified_level, then fans those events out to email and webhook-style
// destinations. Called with the service-role client (bypasses RLS).
export async function dispatchAlerts(
  supabase: SupabaseClient,
  evaluations: AlertEvaluation[]
): Promise<{ sent: number; failedSends: number }> {
  let sent = 0
  let failedSends = 0

  // 1. Re-arm recovered connections (no email).
  for (const e of evaluations) {
    if (e.severity === "healthy" && e.notifiedLevel !== "none") {
      await supabase
        .from("connections")
        .update({ notified_level: "none", alert_fired_at: null })
        .eq("id", e.connectionId)
    }
  }

  // 2. Candidate escalations.
  const candidates = evaluations.filter(
    (e) => e.alertEnabled && rank(e.severity) > rank(e.notifiedLevel)
  )
  if (candidates.length === 0) return { sent, failedSends }

  // 3. Batch-fetch each user's email + notify_mode + alert destinations.
  const userIds = [...new Set(candidates.map((e) => e.userId))]
  const { data: users } = await supabase
    .from("users")
    .select("id, email, notify_mode")
    .in("id", userIds)
  const byId = new Map(
    (users ?? []).map(
      (u: { id: string; email: string; notify_mode: NotifyMode }) => [u.id, u]
    )
  )
  const { data: destinations } = await supabase
    .from("alert_destinations")
    .select(
      "id, user_id, kind, name, encrypted_url, min_level, is_enabled, consecutive_failures"
    )
    .in("user_id", userIds)
  const destinationsByUser = new Map<string, AlertDestinationRow[]>()
  for (const destination of (destinations ?? []) as AlertDestinationRow[]) {
    if (destination.is_enabled === false) continue
    destinationsByUser.set(destination.user_id, [
      ...(destinationsByUser.get(destination.user_id) ?? []),
      destination,
    ])
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://app.quotacanary.com"
  const dashboardUrl = `${appUrl}/dashboard`

  for (const e of candidates) {
    const u = byId.get(e.userId)
    if (!u) continue

    const action = nextAlertAction({
      severity: e.severity,
      notifiedLevel: e.notifiedLevel,
      notifyMode: u.notify_mode,
      alertEnabled: e.alertEnabled,
    })
    const level = e.severity as AlertDeliveryLevel

    const pools = alertPoolsForLevel(e, level)
    const title = `${e.toolName} is ${
      level === "critical" ? "critically low" : "running low"
    }`
    const body =
      pools.length > 0
        ? `${e.connectionName} crossed ${level} threshold for ${pools
            .map((p) => p.label)
            .join(", ")}.`
        : `${e.connectionName} crossed a ${level} threshold.`

    const { data: eventRow } = await supabase
      .from("alert_events")
      .insert({
        user_id: e.userId,
        connection_id: e.connectionId,
        level,
        tool_name: e.toolName,
        connection_name: e.connectionName,
        title,
        body,
        pools,
        dashboard_url: dashboardUrl,
        topup_url: e.topupUrl,
      })
      .select("id, created_at")
      .single()

    if (!eventRow?.id || !eventRow.created_at) continue

    const update: { notified_level: AlertLevel; alert_fired_at?: string } = {
      notified_level: level,
    }
    if (level === "critical") update.alert_fired_at = new Date().toISOString()
    await supabase.from("connections").update(update).eq("id", e.connectionId)

    const event: AlertDestinationEvent = {
      id: eventRow.id,
      level,
      toolName: e.toolName,
      connectionId: e.connectionId,
      connectionName: e.connectionName,
      title,
      body,
      pools,
      dashboardUrl,
      topupUrl: e.topupUrl,
      createdAt: eventRow.created_at,
    }

    const model: AlertEmailModel = {
      toolName: e.toolName,
      severity: level,
      pools,
      dashboardUrl,
      topupUrl: e.topupUrl,
    }
    if (u.email && action.send) {
      const { subject, html, text } = renderAlertEmail(model)
      const res = await sendEmail({
        to: u.email,
        subject,
        html,
        text,
        tag: `alert-${action.send}`,
      })

      if (res.ok) sent++
      else failedSends++
    }

    for (const destination of destinationsByUser.get(e.userId) ?? []) {
      if (!isDestinationLevelAllowed(destination.min_level, level)) continue
      await deliverDestination(supabase, destination, event)
    }
  }

  return { sent, failedSends }
}

function alertPoolsForLevel(
  evaluation: AlertEvaluation,
  level: AlertDeliveryLevel
): AlertDestinationEvent["pools"] {
  return evaluation.pools
    .map((p) => {
      const threshold = level === "critical" ? p.critical : p.low
      // Inclusive `<=` to match the severity evaluator (severity.ts) and the
      // dashboard pill: a pool sitting exactly on its threshold triggers the
      // alert, so it must also appear in notifications.
      return threshold != null && p.balance <= threshold
        ? { label: p.label, balance: p.balance, threshold, unit: p.unit }
        : null
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)
}

async function deliverDestination(
  supabase: SupabaseClient,
  destination: AlertDestinationRow & { consecutive_failures?: number },
  event: AlertDestinationEvent
) {
  let url: string
  try {
    url = decrypt(destination.encrypted_url)
  } catch {
    await supabase
      .from("alert_destinations")
      .update({
        last_error: "Couldn't decrypt webhook URL.",
        consecutive_failures: (destination.consecutive_failures ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", destination.id)
    return
  }

  const result = await postAlertDestination(destination.kind, url, event)
  const update = result.ok
    ? {
        last_sent_at: new Date().toISOString(),
        last_error: null,
        consecutive_failures: 0,
        updated_at: new Date().toISOString(),
      }
    : {
        last_error: result.error,
        consecutive_failures: (destination.consecutive_failures ?? 0) + 1,
        updated_at: new Date().toISOString(),
      }

  await supabase
    .from("alert_destinations")
    .update(update)
    .eq("id", destination.id)
}
