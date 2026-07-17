import { decrypt } from "@/lib/crypto"
import { type SendEmailResult, sendEmail } from "@/lib/email/client"
import {
  type AlertEmailModel,
  renderAlertEmail,
} from "@/lib/email/render/alert"
import type { AlertLevel, NotifyMode } from "@/lib/types"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  type AlertDeliveryLevel,
  type AlertDestinationEvent,
  type AlertDestinationKind,
  type DestinationSendResult,
  isDestinationLevelAllowed,
  postAlertDestination,
} from "./destinations"
import { type AlertEvaluation, nextAlertAction, rank } from "./severity"

const DELIVERY_BATCH_SIZE = 50

// Poll-aligned exponential backoff, indexed by the attempts already recorded
// before the failing one. The delay is capped rather than the attempt count,
// so a long outage recovers without a tight retry loop or a manual reset.
const RETRY_BACKOFF_MINUTES = [15, 60, 360, 1440]

export function retryBackoffMinutes(attemptCount: number): number {
  return RETRY_BACKOFF_MINUTES[
    Math.min(attemptCount, RETRY_BACKOFF_MINUTES.length - 1)
  ]
}

type UserRow = {
  id: string
  email: string | null
  notify_mode: NotifyMode
  updated_at: string | null
}

type DestinationRow = {
  id: string
  user_id: string
  kind: AlertDestinationKind
  min_level: AlertDeliveryLevel
  is_enabled: boolean
  encrypted_url: string
  consecutive_failures: number
  updated_at: string
}

type EventRow = {
  id: string
  user_id: string
  connection_id: string
  level: AlertDeliveryLevel
  tool_name: string
  connection_name: string
  title: string
  body: string
  pools: AlertDestinationEvent["pools"]
  dashboard_url: string
  topup_url: string | null
  created_at: string
}

type DeliveryRow = {
  id: string
  event_id: string
  delivery_key: string
  channel: "email" | "webhook" | "slack_webhook"
  destination_id: string | null
  attempt_count: number
  claim_token: string
}

type SendResult = SendEmailResult | DestinationSendResult

// Creates durable in-app alert events for connections whose severity rose
// above their stored notified_level, records one delivery row per external
// channel, then processes due deliveries under a claim lease. The connection
// high-water mark advances only after a channel succeeds (or immediately when
// no external channel is configured), so a transient email or webhook failure
// can no longer permanently suppress an alert. Called with the service-role
// client (bypasses RLS).
// `degraded` means the delivery loop could not run to completion. Alerts have
// no other alarm: without it a broken loop still reports alertsSent: 0, which
// reads exactly like a quiet, healthy poll.
type DispatchResult = { sent: number; failedSends: number; degraded: boolean }

export async function dispatchAlerts(
  supabase: SupabaseClient,
  evaluations: AlertEvaluation[]
): Promise<DispatchResult> {
  // Cancellation runs first and must complete: whatever it fails to cancel is
  // still due, and processing it fires the exact stale alert the cancellation
  // exists to stop. Both paths cancel - recovery for a healed connection, and
  // a critical escalation superseding its own earlier low alert.
  if (
    !(await handleRecoveries(supabase, evaluations)) ||
    !(await supersedeLowAlerts(supabase, evaluations))
  ) {
    return { sent: 0, failedSends: 0, degraded: true }
  }
  // Preparation only creates work. A failure there delays new alerts by a poll
  // without making the deliveries already due unsafe to process.
  const prepared = await prepareEscalations(supabase, evaluations)
  const result = await processDueDeliveries(supabase)
  return { ...result, degraded: result.degraded || !prepared }
}

// Recovery re-arms the connection and cancels everything still in flight:
// unsatisfied events close, and pending/paused deliveries are canceled even
// when their event was already satisfied, so an old low-balance warning
// cannot arrive after the balance is healthy.
// Returns false when a lookup or write failed, leaving the cancellations
// incomplete. Every write here is retried by the next poll - the connection is
// still healthy, and its still-active event keeps the loop entering this
// branch - so returning early costs one poll and never a lost cancellation.
async function handleRecoveries(
  supabase: SupabaseClient,
  evaluations: AlertEvaluation[]
): Promise<boolean> {
  const healthy = evaluations.filter((e) => e.severity === "healthy")
  if (healthy.length === 0) return true

  // A connection can hold an active event without ever advancing its
  // high-water mark (every channel failed), so recovery cannot key off
  // notified_level alone. The active-event probe is cheap: it is backed by
  // the partial unique index. Reading a failed probe as "nothing in flight"
  // skips the cancellation and lets the stale warning fire this same poll.
  const { data: activeEvents, error: activeError } = await supabase
    .from("alert_events")
    .select("id, connection_id")
    .in(
      "connection_id",
      healthy.map((e) => e.connectionId)
    )
    .is("delivery_satisfied_at", null)
    .is("delivery_canceled_at", null)
  if (activeError) {
    logDegraded("probing active alert events", activeError)
    return false
  }
  const withActiveEvent = new Set(
    ((activeEvents ?? []) as { connection_id: string }[]).map(
      (r) => r.connection_id
    )
  )

  for (const e of healthy) {
    const notified = e.notifiedLevel !== "none"
    if (!notified && !withActiveEvent.has(e.connectionId)) continue

    if (notified) {
      const { error: rearmError } = await supabase
        .from("connections")
        .update({ notified_level: "none", alert_fired_at: null })
        .eq("id", e.connectionId)
      if (rearmError) {
        logDegraded("re-arming a recovered connection", rearmError)
        return false
      }
    }

    const { data: events, error: eventsError } = await supabase
      .from("alert_events")
      .select("id")
      .eq("connection_id", e.connectionId)
    if (eventsError) {
      logDegraded("loading a recovered connection's events", eventsError)
      return false
    }
    const eventIds = ((events ?? []) as { id: string }[]).map((r) => r.id)
    if (eventIds.length > 0) {
      const { error: cancelError } = await supabase
        .from("alert_deliveries")
        .update({ status: "canceled", updated_at: new Date().toISOString() })
        .in("event_id", eventIds)
        .in("status", ["pending", "paused"])
      if (cancelError) {
        logDegraded(
          "canceling a recovered connection's deliveries",
          cancelError
        )
        return false
      }
    }

    const { error: closeError } = await supabase
      .from("alert_events")
      .update({ delivery_canceled_at: new Date().toISOString() })
      .eq("connection_id", e.connectionId)
      .is("delivery_satisfied_at", null)
      .is("delivery_canceled_at", null)
    if (closeError) {
      logDegraded("closing a recovered connection's events", closeError)
      return false
    }
  }

  return true
}

// A critical escalation supersedes the connection's earlier low event: its
// pending/paused deliveries are canceled (whether or not the low event was
// already satisfied) and an unsatisfied low event is closed.
//
// This cancels sends, so it belongs with recovery rather than with
// preparation, which by contract only creates work and may degrade. Nothing
// retries a skipped supersede: the moment the critical delivery advances the
// high-water mark the connection stops being a candidate, and the low event's
// stranded deliveries fire as a "running low" alert after the critical one.
// Returns false when a lookup or write failed, leaving the cancellation
// incomplete.
async function supersedeLowAlerts(
  supabase: SupabaseClient,
  evaluations: AlertEvaluation[]
): Promise<boolean> {
  const superseding = evaluations.filter(
    (e) =>
      e.alertEnabled &&
      e.severity === "critical" &&
      rank(e.severity) > rank(e.notifiedLevel)
  )
  if (superseding.length === 0) return true

  for (const e of superseding) {
    const { data: lowEvents, error: lowEventsError } = await supabase
      .from("alert_events")
      .select("id")
      .eq("connection_id", e.connectionId)
      .eq("level", "low")
    if (lowEventsError) {
      logDegraded("loading superseded low events", lowEventsError)
      return false
    }
    const lowIds = ((lowEvents ?? []) as { id: string }[]).map((r) => r.id)
    if (lowIds.length > 0) {
      const { error: cancelError } = await supabase
        .from("alert_deliveries")
        .update({ status: "canceled", updated_at: new Date().toISOString() })
        .in("event_id", lowIds)
        .in("status", ["pending", "paused"])
      if (cancelError) {
        logDegraded("canceling superseded low deliveries", cancelError)
        return false
      }
    }

    const { error: closeError } = await supabase
      .from("alert_events")
      .update({ delivery_canceled_at: new Date().toISOString() })
      .eq("connection_id", e.connectionId)
      .eq("level", "low")
      .is("delivery_satisfied_at", null)
      .is("delivery_canceled_at", null)
    if (closeError) {
      logDegraded("closing a superseded low event", closeError)
      return false
    }
  }

  return true
}

// Returns false when a lookup failed, leaving escalations unprepared.
async function prepareEscalations(
  supabase: SupabaseClient,
  evaluations: AlertEvaluation[]
): Promise<boolean> {
  const candidates = evaluations.filter(
    (e) => e.alertEnabled && rank(e.severity) > rank(e.notifiedLevel)
  )
  if (candidates.length === 0) return true

  // An absent recipient skips the candidate silently, so a failed lookup
  // prepares nothing while the poll still reports a healthy alertsSent: 0.
  const userIds = [...new Set(candidates.map((e) => e.userId))]
  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id, email, notify_mode, updated_at")
    .in("id", userIds)
  if (usersError) {
    logDegraded("loading escalation recipients", usersError)
    return false
  }
  const usersById = new Map(((users ?? []) as UserRow[]).map((u) => [u.id, u]))

  // Absent destinations are read as "no external channel is configured", which
  // satisfies the event and advances the high-water mark. That decision is not
  // retryable: the connection never becomes a candidate again until it
  // recovers, so a failed lookup here silences a live alert for good.
  const { data: destinations, error: destinationsError } = await supabase
    .from("alert_destinations")
    .select("id, user_id, kind, min_level, is_enabled, updated_at")
    .in("user_id", userIds)
  if (destinationsError) {
    logDegraded("loading escalation destinations", destinationsError)
    return false
  }
  const destinationsByUser = new Map<string, DestinationRow[]>()
  for (const destination of (destinations ?? []) as DestinationRow[]) {
    if (destination.is_enabled === false) continue
    destinationsByUser.set(destination.user_id, [
      ...(destinationsByUser.get(destination.user_id) ?? []),
      destination,
    ])
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://app.quotacanary.com"
  const dashboardUrl = `${appUrl}/dashboard`

  let ok = true
  for (const e of candidates) {
    const u = usersById.get(e.userId)
    if (!u) continue
    const level = e.severity as AlertDeliveryLevel

    const event = await ensureEvent(supabase, e, level, dashboardUrl)
    if (!event) continue

    // Preparation is restart-safe: the unique (event_id, delivery_key)
    // boundary means rerunning fills missing rows without duplicating any.
    const action = nextAlertAction({
      severity: e.severity,
      notifiedLevel: e.notifiedLevel,
      notifyMode: u.notify_mode,
      alertEnabled: e.alertEnabled,
    })
    const rows: Record<string, unknown>[] = []
    if (u.email && action.send && process.env.POSTMARK_SERVER_TOKEN) {
      rows.push({
        event_id: event.id,
        delivery_key: "email",
        channel: "email",
        target_updated_at: u.updated_at ?? event.created_at,
      })
    }
    for (const destination of destinationsByUser.get(e.userId) ?? []) {
      if (!isDestinationLevelAllowed(destination.min_level, level)) continue
      rows.push({
        event_id: event.id,
        delivery_key: `destination:${destination.id}`,
        channel: destination.kind,
        destination_id: destination.id,
        target_updated_at: destination.updated_at,
      })
    }

    if (rows.length > 0) {
      const { error: upsertError } = await supabase
        .from("alert_deliveries")
        .upsert(rows, {
          onConflict: "event_id,delivery_key",
          ignoreDuplicates: true,
        })
      if (upsertError) {
        logDegraded("recording alert deliveries", upsertError)
        ok = false
      }
    } else {
      // No external channel is configured for this event: the durable in-app
      // record satisfies the alert and the high-water mark advances now.
      //
      // Advance FIRST. The next poll reuses an unsatisfied event but cannot
      // reuse a satisfied one, so satisfying ahead of a failed advance leaves
      // a candidate with no active event and every later poll inserts a fresh
      // in-app alert. Ordered this way the trailing write is the one whose
      // failure the next poll can still repair.
      const update: { notified_level: AlertLevel; alert_fired_at?: string } = {
        notified_level: level,
      }
      if (level === "critical") update.alert_fired_at = new Date().toISOString()
      const { error: advanceError } = await supabase
        .from("connections")
        .update(update)
        .eq("id", e.connectionId)
      if (advanceError) {
        logDegraded("advancing a connection's alert level", advanceError)
        ok = false
        continue
      }

      const { error: satisfyError } = await supabase
        .from("alert_events")
        .update({ delivery_satisfied_at: new Date().toISOString() })
        .eq("id", event.id)
        .is("delivery_satisfied_at", null)
      if (satisfyError) {
        logDegraded("satisfying an in-app alert event", satisfyError)
        ok = false
      }
    }
  }

  return ok
}

// Reuse the connection's active event for this level, otherwise insert one.
// The partial unique index makes the insert race-safe: a concurrent poll's
// duplicate insert fails with 23505 and we re-read the winner's row.
async function ensureEvent(
  supabase: SupabaseClient,
  e: AlertEvaluation,
  level: AlertDeliveryLevel,
  dashboardUrl: string
): Promise<{ id: string; created_at: string } | null> {
  const findActive = () =>
    supabase
      .from("alert_events")
      .select("id, created_at")
      .eq("connection_id", e.connectionId)
      .eq("level", level)
      .is("delivery_satisfied_at", null)
      .is("delivery_canceled_at", null)
      .maybeSingle()

  const { data: active } = await findActive()
  if (active?.id) return active

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

  const { data: inserted, error } = await supabase
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

  if (inserted?.id) return inserted
  if (error?.code === "23505") {
    const { data: raced } = await findActive()
    return raced?.id ? raced : null
  }
  return null
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

// Log server-side only: the poll response can end up in cron logs, and a DB
// message may carry connection detail.
function logDegraded(step: string, error: { message: string }) {
  console.error(`[alerts] ${step} failed:`, error.message)
}

// Claim a bounded batch of due deliveries under a five-minute lease and
// process them sequentially, recording each result through the atomic RPC
// before moving on. Failed attempts are counted without aborting the poll.
//
// A supporting query that ERRORS is never read as "the row is absent": absence
// records a non-retryable pause, which only re-arms when the target is edited,
// so treating a transient failure that way would suppress a live alert for
// good. Abort the batch instead and report it - the claim lease lapses and the
// next poll picks the same deliveries back up.
async function processDueDeliveries(
  supabase: SupabaseClient
): Promise<DispatchResult> {
  let sent = 0
  let failedSends = 0
  let degraded = false

  const { data: claimed, error: claimError } = await supabase.rpc(
    "claim_due_alert_deliveries",
    { batch_size: DELIVERY_BATCH_SIZE }
  )
  if (claimError) {
    logDegraded("claiming due deliveries", claimError)
    return { sent, failedSends, degraded: true }
  }
  const deliveries = (claimed ?? []) as DeliveryRow[]
  if (deliveries.length === 0) return { sent, failedSends, degraded: false }

  const eventIds = [...new Set(deliveries.map((d) => d.event_id))]
  const { data: events, error: eventsError } = await supabase
    .from("alert_events")
    .select("*")
    .in("id", eventIds)
  if (eventsError) {
    logDegraded("loading alert events", eventsError)
    return { sent, failedSends, degraded: true }
  }
  const eventsById = new Map(
    ((events ?? []) as EventRow[]).map((e) => [e.id, e])
  )

  const userIds = [
    ...new Set(((events ?? []) as EventRow[]).map((e) => e.user_id)),
  ]
  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id, email")
    .in("id", userIds)
  if (usersError) {
    logDegraded("loading alert recipients", usersError)
    return { sent, failedSends, degraded: true }
  }
  const emailByUser = new Map(
    ((users ?? []) as { id: string; email: string | null }[]).map((u) => [
      u.id,
      u.email,
    ])
  )

  const destinationIds = [
    ...new Set(
      deliveries
        .map((d) => d.destination_id)
        .filter((id): id is string => id != null)
    ),
  ]
  const destinationsById = new Map<string, DestinationRow>()
  if (destinationIds.length > 0) {
    const { data: destinations, error: destinationsError } = await supabase
      .from("alert_destinations")
      .select(
        "id, user_id, kind, min_level, is_enabled, encrypted_url, consecutive_failures, updated_at"
      )
      .in("id", destinationIds)
    if (destinationsError) {
      logDegraded("loading alert destinations", destinationsError)
      return { sent, failedSends, degraded: true }
    }
    for (const destination of (destinations ?? []) as DestinationRow[]) {
      destinationsById.set(destination.id, destination)
    }
  }

  for (const delivery of deliveries) {
    const event = eventsById.get(delivery.event_id)
    let result: SendResult
    if (!event) {
      result = { ok: false, error: "Alert event is gone.", retryable: false }
    } else if (delivery.channel === "email") {
      result = await sendEmailDelivery(event, emailByUser.get(event.user_id))
    } else {
      result = await sendWebhookDelivery(
        supabase,
        delivery,
        event,
        destinationsById.get(delivery.destination_id ?? "")
      )
    }

    if (result.ok) sent++
    else failedSends++

    // An unrecorded result leaves the row claimed until its lease lapses, so
    // the next poll sends the same alert again. Left silent, a persistently
    // failing record call is a duplicate-alert loop.
    const { error: recordError } = await supabase.rpc(
      "record_alert_delivery_result",
      {
        p_delivery_id: delivery.id,
        p_claim_token: delivery.claim_token,
        p_outcome: result.ok
          ? "succeeded"
          : result.retryable
            ? "retry"
            : "paused",
        p_error: result.ok ? null : result.error,
        p_next_attempt_at:
          !result.ok && result.retryable
            ? new Date(
                Date.now() +
                  retryBackoffMinutes(delivery.attempt_count) * 60_000
              ).toISOString()
            : null,
      }
    )
    if (recordError) {
      logDegraded("recording a delivery result", recordError)
      degraded = true
    }
  }

  return { sent, failedSends, degraded }
}

async function sendEmailDelivery(
  event: EventRow,
  email: string | null | undefined
): Promise<SendResult> {
  if (!email) {
    // Paused until the user's email changes (users.updated_at then moves past
    // the delivery's target_updated_at, making it claimable again).
    return { ok: false, error: "No email address on file.", retryable: false }
  }
  const model: AlertEmailModel = {
    toolName: event.tool_name,
    severity: event.level,
    pools: event.pools,
    dashboardUrl: event.dashboard_url,
    topupUrl: event.topup_url,
  }
  const { subject, html, text } = renderAlertEmail(model)
  return sendEmail({
    to: email,
    subject,
    html,
    text,
    tag: `alert-${event.level}`,
  })
}

async function sendWebhookDelivery(
  supabase: SupabaseClient,
  delivery: DeliveryRow,
  event: EventRow,
  destination: DestinationRow | undefined
): Promise<SendResult> {
  if (!destination) {
    return { ok: false, error: "Destination is gone.", retryable: false }
  }

  let url: string
  try {
    url = decrypt(destination.encrypted_url)
  } catch {
    const result: SendResult = {
      ok: false,
      error: "Couldn't decrypt webhook URL.",
      retryable: false,
    }
    await updateDestinationHealth(supabase, destination, result)
    return result
  }

  const destinationEvent: AlertDestinationEvent = {
    id: event.id,
    level: event.level,
    toolName: event.tool_name,
    connectionId: event.connection_id,
    connectionName: event.connection_name,
    title: event.title,
    body: event.body,
    pools: event.pools,
    dashboardUrl: event.dashboard_url,
    topupUrl: event.topup_url,
    createdAt: event.created_at,
  }

  const result = await postAlertDestination(
    destination.kind,
    url,
    destinationEvent,
    delivery.id
  )
  await updateDestinationHealth(supabase, destination, result)
  return result
}

// last_sent_at / last_error / consecutive_failures stay authoritative for the
// settings UI, updated from each webhook attempt as before QUO-5.
async function updateDestinationHealth(
  supabase: SupabaseClient,
  destination: DestinationRow,
  result: SendResult
) {
  // Never touch updated_at here. claim_due_alert_deliveries re-arms a paused
  // delivery when its destination's updated_at moves past the version it last
  // attempted, and the claim stamps that version BEFORE this write - so a bump
  // here re-arms the very attempt that just failed, re-firing a dead webhook
  // every poll forever. Only a user edit may move it.
  const update = result.ok
    ? {
        last_sent_at: new Date().toISOString(),
        last_error: null,
        consecutive_failures: 0,
      }
    : {
        last_error: result.error,
        consecutive_failures: (destination.consecutive_failures ?? 0) + 1,
      }

  const { error } = await supabase
    .from("alert_destinations")
    .update(update)
    .eq("id", destination.id)
  // Display-only, and the send already happened: nothing reads these fields to
  // decide a delivery, so a failure here can neither suppress nor duplicate an
  // alert. Log it without degrading - `degraded` means the loop could not do
  // its job, and crying wolf over a cosmetic write blunts the only alarm.
  if (error) logDegraded("updating destination health", error)
}
