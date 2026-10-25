import { decrypt } from "@/lib/crypto"
import { type SendEmailResult, sendEmail } from "@/lib/email/client"
import {
  type AlertEmailModel,
  renderAlertEmail,
} from "@/lib/email/render/alert"
import { renderStoppedCheckingEmail } from "@/lib/email/render/stopped-checking"
import type { AlertLevel, NotifiedLevels, NotifyMode } from "@/lib/types"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  type AlertDeliveryLevel,
  type AlertDestinationEvent,
  type AlertDestinationKind,
  type AlertEventKind,
  type DestinationSendResult,
  isDestinationLevelAllowed,
  postAlertDestination,
} from "./destinations"
import {
  type AlertEvaluation,
  type Escalation,
  advancedNotifiedLevels,
  escalation,
  rearmedNotifiedLevels,
  rollupNotifiedLevel,
  shouldSendEmail,
} from "./severity"
import {
  type StoppedCheckingEvaluation,
  alertedThisIncident,
  stoppedCheckingBody,
  stoppedCheckingDue,
  stoppedCheckingTitle,
} from "./stopped-checking"

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
  encrypted_signing_secret: string | null
  consecutive_failures: number
  updated_at: string
}

type EventRow = {
  id: string
  user_id: string
  connection_id: string
  kind: AlertEventKind
  level: AlertDeliveryLevel
  tool_name: string
  connection_name: string
  title: string
  body: string
  pools: AlertDestinationEvent["pools"]
  credit_types: string[] | null
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

// `evaluations` are this poll's good reads; `stopped` its failed ones (QUO-289).
export async function dispatchAlerts(
  supabase: SupabaseClient,
  evaluations: AlertEvaluation[],
  stopped: StoppedCheckingEvaluation[] = []
): Promise<DispatchResult> {
  // Cancellation runs first and must complete: whatever it fails to cancel is
  // still due, and processing it fires the exact stale alert the cancellation
  // exists to stop. Three paths cancel - recovery for a healed connection, a
  // critical escalation superseding its own earlier low alert, and a good read
  // ending a stopped-checking incident.
  if (
    !(await handleRecoveries(supabase, evaluations)) ||
    !(await supersedeLowAlerts(supabase, evaluations)) ||
    !(await rearmRecoveredPools(supabase, evaluations)) ||
    !(await closeRecoveredStoppedAlerts(supabase, evaluations))
  ) {
    return { sent: 0, failedSends: 0, degraded: true }
  }
  // Preparation only creates work. A failure there delays new alerts by a poll
  // without making the deliveries already due unsafe to process.
  const prepared = await prepareEscalations(supabase, evaluations)
  const preparedStopped = await prepareStoppedChecking(supabase, stopped)
  const result = await processDueDeliveries(supabase)
  return {
    ...result,
    degraded: result.degraded || !prepared || !preparedStopped,
  }
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
    const notified =
      e.notifiedLevel !== "none" || Object.keys(e.notifiedLevels).length > 0
    if (!notified && !withActiveEvent.has(e.connectionId)) continue

    if (notified) {
      const { error: rearmError } = await supabase
        .from("connections")
        .update({
          notified_level: "none",
          notified_levels: {},
          alert_fired_at: null,
        })
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

// Partial recovery: a connection where SOME pools healed while others are
// still below threshold. handleRecoveries above owns the fully-healthy case
// (it also cancels what is still in flight); this pass only drops the marks of
// the pools that healed, so each of them can alert again on its next crossing.
//
// Marks are per pool, but events and their cancellation stay per connection:
// one event can name several pools, and it is only stale once the whole
// connection has recovered. So nothing is canceled here.
// Returns false when a write failed, leaving marks unpruned - the next poll
// recomputes the same desired map from fresh readings and retries.
async function rearmRecoveredPools(
  supabase: SupabaseClient,
  evaluations: AlertEvaluation[]
): Promise<boolean> {
  for (const e of evaluations) {
    if (e.severity === "healthy") continue
    const next = rearmedNotifiedLevels(e)
    if (sameNotifiedLevels(next, e.notifiedLevels)) continue

    const { error } = await supabase
      .from("connections")
      .update({
        notified_levels: next,
        notified_level: rollupNotifiedLevel(next),
      })
      .eq("id", e.connectionId)
    if (error) {
      logDegraded("re-arming recovered pools", error)
      return false
    }
  }
  return true
}

function sameNotifiedLevels(
  a: AlertEvaluation["notifiedLevels"],
  b: AlertEvaluation["notifiedLevels"]
): boolean {
  const keys = Object.keys(a)
  return (
    keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k])
  )
}

// A good read ends a stopped-checking incident (QUO-289). Whatever alert for it
// is still in flight is stale - a late "isn't being checked" after the key
// works again would be false - so its pending/paused deliveries are canceled,
// even on an event already satisfied by another channel, and the stamp is
// cleared so the next incident alerts. handleRecoveries already does the
// canceling for a fully healthy connection; this covers every good read, a
// still-low one included.
//
// The candidates are the stamped connections plus any with an active
// stopped-checking event (delivered nowhere yet, so unstamped). The stamp is
// cleared last, so a failed write leaves the connection in this set and the
// next poll finishes the job.
async function closeRecoveredStoppedAlerts(
  supabase: SupabaseClient,
  evaluations: AlertEvaluation[]
): Promise<boolean> {
  if (evaluations.length === 0) return true

  const { data: activeEvents, error: activeError } = await supabase
    .from("alert_events")
    .select("connection_id")
    .eq("kind", "stopped_checking")
    .in(
      "connection_id",
      evaluations.map((e) => e.connectionId)
    )
    .is("delivery_satisfied_at", null)
    .is("delivery_canceled_at", null)
  if (activeError) {
    logDegraded("probing active stopped-checking events", activeError)
    return false
  }
  const withActiveEvent = new Set(
    ((activeEvents ?? []) as { connection_id: string }[]).map(
      (r) => r.connection_id
    )
  )

  for (const e of evaluations) {
    const stamped = e.failureAlertedAt != null
    if (!stamped && !withActiveEvent.has(e.connectionId)) continue

    const { data: events, error: eventsError } = await supabase
      .from("alert_events")
      .select("id")
      .eq("connection_id", e.connectionId)
      .eq("kind", "stopped_checking")
    if (eventsError) {
      logDegraded(
        "loading a recovered connection's stopped events",
        eventsError
      )
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
        logDegraded("canceling stale stopped-checking deliveries", cancelError)
        return false
      }
    }

    const { error: closeError } = await supabase
      .from("alert_events")
      .update({ delivery_canceled_at: new Date().toISOString() })
      .eq("connection_id", e.connectionId)
      .eq("kind", "stopped_checking")
      .is("delivery_satisfied_at", null)
      .is("delivery_canceled_at", null)
    if (closeError) {
      logDegraded("closing a recovered stopped-checking event", closeError)
      return false
    }

    if (stamped) {
      const { error: rearmError } = await supabase
        .from("connections")
        .update({ failure_alerted_at: null })
        .eq("id", e.connectionId)
      if (rearmError) {
        logDegraded(
          "re-arming a recovered connection's stopped alert",
          rearmError
        )
        return false
      }
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
    (e) => e.alertEnabled && escalation(e)?.level === "critical"
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
  // A pool that newly crossed its own threshold is news even when the
  // connection's overall severity is unchanged, which is exactly the case the
  // old connection-level high-water mark swallowed.
  const candidates = evaluations
    .map((e) => ({ e, esc: e.alertEnabled ? escalation(e) : null }))
    .filter((c): c is { e: AlertEvaluation; esc: Escalation } => c.esc !== null)
  if (candidates.length === 0) return true

  const recipients = await loadRecipients(
    supabase,
    candidates.map((c) => c.e.userId)
  )
  if (!recipients) return false
  const { usersById, destinationsByUser } = recipients
  const dashboardUrl = appDashboardUrl()

  let ok = true
  for (const { e, esc } of candidates) {
    const u = usersById.get(e.userId)
    if (!u) continue
    const level: AlertDeliveryLevel = esc.level

    const event = await ensureEvent(supabase, e, esc, dashboardUrl)
    if (!event) continue

    // Preparation is restart-safe: the unique (event_id, delivery_key)
    // boundary means rerunning fills missing rows without duplicating any.
    const sendEmailRow = shouldSendEmail({
      level,
      notifyMode: u.notify_mode,
      alertEnabled: e.alertEnabled,
    })
    const rows: Record<string, unknown>[] = []
    // Deliberately not gated on POSTMARK_SERVER_TOKEN. A missing token is a
    // send-time condition the send path already treats as retryable, so the
    // row pauses and resumes once the operator configures it. Skipping the row
    // here instead falls through to the no-channel branch below, which
    // satisfies the event and advances the high-water mark - suppressing the
    // alert for good.
    if (u.email && sendEmailRow) {
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
      //
      // Only the pools this event names advance. A pool left out (it crossed
      // a lower level in the same poll) keeps its mark and alerts on its own
      // next time round.
      const levels = advancedNotifiedLevels(e, esc)
      const update: {
        notified_level: AlertLevel
        notified_levels: NotifiedLevels
        alert_fired_at?: string
      } = {
        notified_level: rollupNotifiedLevel(levels),
        notified_levels: levels,
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

type Recipients = {
  usersById: Map<string, UserRow>
  destinationsByUser: Map<string, DestinationRow[]>
}

// The users and enabled destinations alerts are prepared for. Null when a
// lookup failed, and the caller prepares nothing.
async function loadRecipients(
  supabase: SupabaseClient,
  userIdList: string[]
): Promise<Recipients | null> {
  // An absent recipient skips the candidate silently, so a failed lookup
  // prepares nothing while the poll still reports a healthy alertsSent: 0.
  const userIds = [...new Set(userIdList)]
  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id, email, notify_mode, updated_at")
    .in("id", userIds)
  if (usersError) {
    logDegraded("loading escalation recipients", usersError)
    return null
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
    return null
  }
  const destinationsByUser = new Map<string, DestinationRow[]>()
  for (const destination of (destinations ?? []) as DestinationRow[]) {
    if (destination.is_enabled === false) continue
    destinationsByUser.set(destination.user_id, [
      ...(destinationsByUser.get(destination.user_id) ?? []),
      destination,
    ])
  }
  return { usersById, destinationsByUser }
}

function appDashboardUrl(): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://app.quotacanary.com"
  return `${appUrl}/dashboard`
}

// QUO-289. A failed read that reached the alert (stoppedCheckingDue) on a
// connection whose incident has not alerted yet gets one "isn't being checked"
// alert through the same ledger as the balance alerts. Like prepareEscalations
// this only creates work, and it is restart-safe: until a channel succeeds
// and record_alert_delivery_result stamps the incident, every poll re-prepares
// it, reusing the active event and its delivery rows rather than adding any.
//
// The event carries level "critical": notify_mode "critical" and critical-only
// destinations hear about it, because a connection nobody is watching is at
// least as urgent as a balance about to run dry.
// Returns false when a lookup failed, leaving some candidates unprepared.
async function prepareStoppedChecking(
  supabase: SupabaseClient,
  stopped: StoppedCheckingEvaluation[]
): Promise<boolean> {
  let ok = true
  const candidates: StoppedCheckingEvaluation[] = []
  for (const s of stopped.filter(stoppedCheckingDue)) {
    if (s.failureAlertedAt == null) {
      candidates.push(s)
      continue
    }
    // A stamp only dates the incident it was sent for when no good read came
    // after it, and the good read in between may have been a manual refresh
    // the poller never saw.
    const { data: lastGood, error } = await supabase
      .from("balances")
      .select("recorded_at")
      .eq("connection_id", s.connectionId)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) {
      logDegraded("reading a failing connection's last good read", error)
      ok = false
      continue
    }
    const lastGoodReadAt =
      (lastGood as { recorded_at: string } | null)?.recorded_at ?? null
    if (alertedThisIncident(s.failureAlertedAt, lastGoodReadAt)) continue
    candidates.push(s)
  }
  if (candidates.length === 0) return ok

  const recipients = await loadRecipients(
    supabase,
    candidates.map((s) => s.userId)
  )
  if (!recipients) return false
  const dashboardUrl = appDashboardUrl()

  for (const s of candidates) {
    const u = recipients.usersById.get(s.userId)
    if (!u) continue

    const event = await ensureStoppedEvent(supabase, s, dashboardUrl)
    if (!event) {
      ok = false
      continue
    }

    const rows: Record<string, unknown>[] = []
    if (
      u.email &&
      shouldSendEmail({
        level: "critical",
        notifyMode: u.notify_mode,
        alertEnabled: s.alertEnabled,
      })
    ) {
      rows.push({
        event_id: event.id,
        delivery_key: "email",
        channel: "email",
        target_updated_at: u.updated_at ?? event.created_at,
      })
    }
    for (const destination of recipients.destinationsByUser.get(s.userId) ??
      []) {
      if (!isDestinationLevelAllowed(destination.min_level, "critical")) {
        continue
      }
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
        logDegraded("recording stopped-checking deliveries", upsertError)
        ok = false
      }
      continue
    }

    // No external channel: the in-app event is the alert. Stamp FIRST, for
    // the reason prepareEscalations advances first - a satisfied event cannot
    // be reused, so satisfying ahead of a failed stamp re-alerts every poll.
    const { error: stampError } = await supabase
      .from("connections")
      .update({ failure_alerted_at: event.created_at })
      .eq("id", s.connectionId)
    if (stampError) {
      logDegraded("stamping a stopped-checking incident", stampError)
      ok = false
      continue
    }
    const { error: satisfyError } = await supabase
      .from("alert_events")
      .update({ delivery_satisfied_at: new Date().toISOString() })
      .eq("id", event.id)
      .is("delivery_satisfied_at", null)
    if (satisfyError) {
      logDegraded("satisfying an in-app stopped-checking event", satisfyError)
      ok = false
    }
  }

  return ok
}

// Reuse the connection's active stopped-checking event, otherwise insert one.
// Race-safe the same way as ensureEvent, on the same partial unique index.
async function ensureStoppedEvent(
  supabase: SupabaseClient,
  s: StoppedCheckingEvaluation,
  dashboardUrl: string
): Promise<{ id: string; created_at: string } | null> {
  const findActive = () =>
    supabase
      .from("alert_events")
      .select("id, created_at")
      .eq("connection_id", s.connectionId)
      .eq("kind", "stopped_checking")
      .is("delivery_satisfied_at", null)
      .is("delivery_canceled_at", null)
      .maybeSingle()

  const { data: active } = await findActive()
  if (active?.id) return active

  const { data: inserted, error } = await supabase
    .from("alert_events")
    .insert({
      user_id: s.userId,
      connection_id: s.connectionId,
      kind: "stopped_checking",
      level: "critical",
      tool_name: s.toolName,
      connection_name: s.connectionName,
      title: stoppedCheckingTitle(s.toolName),
      body: stoppedCheckingBody(s),
      pools: [],
      dashboard_url: dashboardUrl,
      topup_url: null,
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

// Reuse the connection's active event for this level, otherwise insert one.
// The partial unique index makes the insert race-safe: a concurrent poll's
// duplicate insert fails with 23505 and we re-read the winner's row.
//
// One active event per (connection, level) still holds, so a second pool
// crossing while the first pool's event is still undelivered MERGES into it
// rather than waiting for it. Reusing the row untouched would leave the new
// pool off the event, off its credit_types, and therefore never marked - the
// pool would stay a candidate forever behind a stuck delivery.
async function ensureEvent(
  supabase: SupabaseClient,
  e: AlertEvaluation,
  esc: Escalation,
  dashboardUrl: string
): Promise<{ id: string; created_at: string } | null> {
  const level = esc.level
  const findActive = () =>
    supabase
      .from("alert_events")
      .select("id, created_at, pools, credit_types")
      .eq("connection_id", e.connectionId)
      .eq("kind", "balance")
      .eq("level", level)
      .is("delivery_satisfied_at", null)
      .is("delivery_canceled_at", null)
      .maybeSingle()

  const pools = alertEventPools(esc)
  const creditTypes = esc.pools.map((p) => p.creditType)

  const { data: active } = await findActive()
  if (active?.id) return mergeIntoEvent(supabase, e, esc, active)

  const { data: inserted, error } = await supabase
    .from("alert_events")
    .insert({
      user_id: e.userId,
      connection_id: e.connectionId,
      level,
      tool_name: e.toolName,
      connection_name: e.connectionName,
      title: eventTitle(e, level),
      body: eventBody(e, level, pools),
      pools,
      credit_types: creditTypes,
      dashboard_url: dashboardUrl,
      topup_url: e.topupUrl,
    })
    .select("id, created_at")
    .single()

  if (inserted?.id) return inserted
  if (error?.code === "23505") {
    const { data: raced } = await findActive()
    return raced?.id ? mergeIntoEvent(supabase, e, esc, raced) : null
  }
  return null
}

// Fold pools the active event does not already name into it. A failed merge
// returns the event unchanged: the alert still goes out for the pools already
// on it, and the missing pool is still a candidate next poll.
async function mergeIntoEvent(
  supabase: SupabaseClient,
  e: AlertEvaluation,
  esc: Escalation,
  active: { id: string; created_at: string } & Record<string, unknown>
): Promise<{ id: string; created_at: string }> {
  const existingTypes = active.credit_types as string[] | null
  // An event created before migration 056 has no credit_types, but its pools
  // are already listed on it. Adopt the keys only: re-appending the pools
  // would name each of them twice in the body.
  if (existingTypes == null) {
    const { error } = await supabase
      .from("alert_events")
      .update({ credit_types: esc.pools.map((p) => p.creditType) })
      .eq("id", active.id)
    if (error) logDegraded("adopting credit types on a legacy event", error)
    return active
  }

  const missing = esc.pools.filter((p) => !existingTypes.includes(p.creditType))
  if (missing.length === 0) return active

  const pools = [
    ...((active.pools as AlertDestinationEvent["pools"] | null) ?? []),
    ...alertEventPools({ level: esc.level, pools: missing }),
  ]
  const { error } = await supabase
    .from("alert_events")
    .update({
      pools,
      credit_types: [...existingTypes, ...missing.map((p) => p.creditType)],
      body: eventBody(e, esc.level, pools),
    })
    .eq("id", active.id)
  if (error) logDegraded("merging a pool into an active alert event", error)
  return active
}

function eventTitle(e: AlertEvaluation, level: AlertDeliveryLevel): string {
  return `${e.toolName} is ${
    level === "critical" ? "critically low" : "running low"
  }`
}

function eventBody(
  e: AlertEvaluation,
  level: AlertDeliveryLevel,
  pools: AlertDestinationEvent["pools"]
): string {
  return pools.length > 0
    ? `${e.connectionName} crossed ${level} threshold for ${pools
        .map((p) => p.label)
        .join(", ")}.`
    : `${e.connectionName} crossed a ${level} threshold.`
}

// The pools an alert names are exactly the ones that just crossed to its
// level, so a pool already alerted at that level is not re-announced.
function alertEventPools(esc: Escalation): AlertDestinationEvent["pools"] {
  return esc.pools.map((p) => ({
    label: p.label,
    balance: p.balance,
    threshold: (esc.level === "critical" ? p.critical : p.low) as number,
    unit: p.unit,
  }))
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
        "id, user_id, kind, min_level, is_enabled, encrypted_url, encrypted_signing_secret, consecutive_failures, updated_at"
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
  if (event.kind === "stopped_checking") {
    const { subject, html, text } = renderStoppedCheckingEmail({
      toolName: event.tool_name,
      body: event.body,
      dashboardUrl: event.dashboard_url,
    })
    return sendEmail({ to: email, subject, html, text, tag: "alert-stopped" })
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

  // Fail closed rather than falling back to an unsigned send: a receiver that
  // requires the signature would reject it anyway, and one that does not would
  // silently accept a delivery the user believes is signed. Non-retryable, so
  // it pauses until the owner rotates the secret (which moves updated_at and
  // re-arms the delivery).
  let signingSecret: string | null = null
  if (destination.encrypted_signing_secret) {
    try {
      signingSecret = decrypt(destination.encrypted_signing_secret)
    } catch {
      const result: SendResult = {
        ok: false,
        error: "Couldn't decrypt the webhook signing secret.",
        retryable: false,
      }
      await updateDestinationHealth(supabase, destination, result)
      return result
    }
  }

  const destinationEvent: AlertDestinationEvent = {
    id: event.id,
    kind: event.kind,
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
    delivery.id,
    signingSecret
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
  // last_attempt_at moves on every attempt, success or not. It is what dates
  // last_error: without it the settings page can say a destination failed but
  // not when, and last_sent_at only moves on the successes that have no error.
  const now = new Date().toISOString()
  const update = result.ok
    ? {
        last_attempt_at: now,
        last_sent_at: now,
        last_error: null,
        consecutive_failures: 0,
      }
    : {
        last_attempt_at: now,
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
