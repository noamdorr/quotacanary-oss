"use server"

import {
  type AlertDeliveryLevel,
  type AlertDestinationKind,
  destinationUrlHint,
  postAlertDestination,
  testDestinationEvent,
  validateDestinationUrl,
} from "@/lib/alerts/destinations"
import { generateWebhookSigningSecret } from "@/lib/alerts/signing"
import { decrypt, encrypt } from "@/lib/crypto"
import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

// `signingSecret` is returned once, on the call that mints it, and never read
// back afterwards - the stored copy is encrypted and only the poller decrypts
// it. The caller must show it immediately.
export type ActionResult =
  | { ok: true; signingSecret?: string }
  | { ok: false; error: string }

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")
  return { supabase, user }
}

export async function createAlertDestination(
  formData: FormData
): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  const kind = parseKind(String(formData.get("kind") ?? ""))
  const minLevel = parseMinLevel(String(formData.get("minLevel") ?? "low"))
  const url = validateDestinationUrl(String(formData.get("url") ?? ""))
  const name = String(formData.get("name") ?? "").trim()

  if (!kind) return { ok: false, error: "Choose a destination type." }
  if (!minLevel) return { ok: false, error: "Choose an alert level." }
  if (!url.ok) return url

  // Slack incoming webhooks have no signature to verify, so only generic
  // webhooks get a secret.
  const signingSecret =
    kind === "webhook" ? generateWebhookSigningSecret() : null
  const fallbackName = kind === "slack_webhook" ? "Slack" : "Webhook"
  const { error } = await supabase.from("alert_destinations").insert({
    user_id: user.id,
    kind,
    name: name || fallbackName,
    encrypted_url: encrypt(url.url),
    url_hint: destinationUrlHint(url.url),
    min_level: minLevel,
    encrypted_signing_secret: signingSecret ? encrypt(signingSecret) : null,
    signing_secret_set_at: signingSecret ? new Date().toISOString() : null,
  })

  if (error) return { ok: false, error: "Couldn't save the destination." }
  revalidatePath("/settings")
  return signingSecret ? { ok: true, signingSecret } : { ok: true }
}

// Mints a fresh secret for a generic webhook, replacing any existing one. Also
// the path by which a destination created before QUO-9 gets its first secret.
// There is no overlap window: the previous secret stops being valid the moment
// this returns, so the receiver has to be updated with the new one.
export async function rotateAlertDestinationSecret(
  formData: FormData
): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  const id = String(formData.get("id") ?? "")
  if (!id) return { ok: false, error: "Missing destination." }

  const signingSecret = generateWebhookSigningSecret()
  // updated_at moves on purpose here (unlike the poller's health write): a
  // rotation is a user edit, so claim_due_alert_deliveries should re-arm the
  // deliveries this destination had paused.
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from("alert_destinations")
    .update({
      encrypted_signing_secret: encrypt(signingSecret),
      signing_secret_set_at: now,
      updated_at: now,
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("kind", "webhook")
    .select("id")

  if (error) return { ok: false, error: "Couldn't rotate the signing secret." }
  // RLS plus the kind filter means an empty result is "no such generic webhook
  // of yours", not a failure worth reporting as one.
  if (!data || data.length === 0) {
    return { ok: false, error: "Couldn't find that webhook." }
  }
  revalidatePath("/settings")
  return { ok: true, signingSecret }
}

// Sends one synthetic alert to a destination the caller owns, so a broken URL
// or a revoked Slack hook shows up here instead of during a real low-credit
// event. Every outbound request goes through postAlertDestination, which
// re-validates the URL and pins the resolved address, so the test cannot reach
// anywhere a real delivery could not.
export async function sendTestAlertDestination(
  formData: FormData
): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  const id = String(formData.get("id") ?? "")
  if (!id) return { ok: false, error: "Missing destination." }

  const { data: destination, error: loadError } = await supabase
    .from("alert_destinations")
    .select("id, kind, encrypted_url, encrypted_signing_secret")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle()
  if (loadError) return { ok: false, error: "Couldn't load the destination." }
  if (!destination) return { ok: false, error: "Couldn't find that webhook." }
  const row = destination as {
    kind: AlertDestinationKind
    encrypted_url: string
    encrypted_signing_secret: string | null
  }

  // Consume the budget BEFORE sending. Charging on the way out would let a
  // stream of failing sends run uncounted, which is exactly the case a retry
  // loop produces.
  const { data: limit, error: limitError } = await supabase.rpc(
    "consume_test_delivery_rate_limit"
  )
  const gate = (
    limit as { allowed: boolean; reset_seconds: number }[] | null
  )?.[0]
  if (limitError || !gate) {
    return { ok: false, error: "Couldn't check the test limit. Try again." }
  }
  if (!gate.allowed) {
    return {
      ok: false,
      error: `Too many test sends. Try again in ${formatRetryAfter(gate.reset_seconds)}.`,
    }
  }

  let url: string
  try {
    url = decrypt(row.encrypted_url)
  } catch {
    // Never log or return the ciphertext or the URL: the whole point of
    // encrypting it is that it does not appear beside itself in a log line.
    return {
      ok: false,
      error:
        "Couldn't read the saved URL. Remove this destination and add it again.",
    }
  }

  // Sign the test exactly as a real delivery is signed (QUO-9). An unsigned
  // test would be rejected by any receiver that verifies the signature, which
  // is precisely the receiver this button exists to prove out. Fail closed on
  // an undecryptable secret for the same reason the poller does: silently
  // downgrading to unsigned tests a path that never ships.
  let signingSecret: string | null = null
  if (row.encrypted_signing_secret) {
    try {
      signingSecret = decrypt(row.encrypted_signing_secret)
    } catch {
      return {
        ok: false,
        error: "Couldn't read the signing secret. Rotate it, then test again.",
      }
    }
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://app.quotacanary.com"
  const result = await postAlertDestination(
    row.kind,
    url,
    testDestinationEvent(`${appUrl}/dashboard`),
    // No delivery id: `idempotency-key` identifies a retried real delivery, and
    // a test is never retried.
    undefined,
    signingSecret
  )

  // Record the attempt on the same health fields the poller writes, so the
  // settings page tells one story regardless of which path last touched it.
  //
  // Two fields are deliberately left alone. `updated_at`, because
  // claim_due_alert_deliveries re-arms a paused delivery once its destination's
  // updated_at moves past the version it last attempted - a test is a probe,
  // not an edit of the target, and bumping it would re-fire real alerts.
  // `consecutive_failures`, because that counter is the poller's streak of
  // real deliveries; folding a manual probe into it would misreport history.
  const now = new Date().toISOString()
  const { error: healthError } = await supabase
    .from("alert_destinations")
    .update(
      result.ok
        ? { last_attempt_at: now, last_sent_at: now, last_error: null }
        : { last_attempt_at: now, last_error: result.error }
    )
    .eq("id", id)
    .eq("user_id", user.id)
  if (healthError) {
    // Display-only, and the send already happened. Reporting it as the test's
    // outcome would be a lie in both directions.
    console.error("[alerts] recording a test delivery result failed")
  }

  revalidatePath("/settings")
  if (!result.ok) {
    return {
      ok: false,
      error: `Test delivery failed (${result.error.replace(/\.$/, "")}).`,
    }
  }
  return { ok: true }
}

function formatRetryAfter(seconds: number): string {
  if (seconds <= 60) return "a minute"
  return `${Math.ceil(seconds / 60)} minutes`
}

export async function toggleAlertDestination(
  formData: FormData
): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  const id = String(formData.get("id") ?? "")
  const enabled = String(formData.get("enabled") ?? "") === "true"
  if (!id) return { ok: false, error: "Missing destination." }

  // RLS already scopes this; the user_id filter is belt and braces.
  const { error } = await supabase
    .from("alert_destinations")
    .update({ is_enabled: enabled, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)

  if (error) return { ok: false, error: "Couldn't update the destination." }
  revalidatePath("/settings")
  return { ok: true }
}

export async function deleteAlertDestination(
  formData: FormData
): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  const id = String(formData.get("id") ?? "")
  if (!id) return { ok: false, error: "Missing destination." }

  const { error } = await supabase
    .from("alert_destinations")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)

  if (error) return { ok: false, error: "Couldn't remove the destination." }
  revalidatePath("/settings")
  return { ok: true }
}

export async function markAlertEventRead(
  formData: FormData
): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  const id = String(formData.get("id") ?? "")
  if (!id) return { ok: false, error: "Missing alert." }

  const { error } = await supabase
    .from("alert_events")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)

  if (error) return { ok: false, error: "Couldn't mark the alert read." }
  revalidatePath("/alerts")
  return { ok: true }
}

function parseKind(value: string): AlertDestinationKind | null {
  if (value === "webhook" || value === "slack_webhook") return value
  return null
}

function parseMinLevel(value: string): AlertDeliveryLevel | null {
  if (value === "low" || value === "critical") return value
  return null
}
