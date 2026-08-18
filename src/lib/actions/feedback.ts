"use server"

import { APP_VERSION } from "@/lib/app-version"
import { sendEmail } from "@/lib/email/client"
import { renderFeedbackEmail } from "@/lib/email/render/feedback"
import { createClient } from "@/lib/supabase/server"

export type ActionResult = { ok: true } | { ok: false; error: string }

// Not exported: a "use server" file may only export async functions, and a
// const array is a runtime object. The dialog keeps its own display list.
const FEEDBACK_CATEGORIES = ["bug", "feedback", "tool"] as const
type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number]

const MAX_MESSAGE = 4000
const MAX_TOOL_NAME = 120
// Both columns are unbounded `text` and both values are client-supplied, so
// cap them here or they are free storage for anyone with a session. Long
// enough for any real UA string / in-app route.
const MAX_USER_AGENT = 400
const MAX_PAGE_PATH = 200

function isCategory(value: string): value is FeedbackCategory {
  return (FEEDBACK_CATEGORIES as readonly string[]).includes(value)
}

export async function submitFeedback(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Not authenticated" }

  const category = String(formData.get("category") ?? "").trim()
  const message = String(formData.get("message") ?? "").trim()
  const toolName = String(formData.get("toolName") ?? "").trim()
  const pagePath =
    String(formData.get("pagePath") ?? "")
      .trim()
      .slice(0, MAX_PAGE_PATH) || null
  const userAgent =
    String(formData.get("userAgent") ?? "")
      .trim()
      .slice(0, MAX_USER_AGENT) || null

  if (!isCategory(category)) return { ok: false, error: "Pick a category." }
  if (!message) return { ok: false, error: "Tell us what happened." }
  if (message.length > MAX_MESSAGE)
    return {
      ok: false,
      error: `Message is too long (${MAX_MESSAGE.toLocaleString("en-US")} characters max).`,
    }
  if (category === "tool" && !toolName)
    return { ok: false, error: "Which tool? Add its name." }
  if (toolName.length > MAX_TOOL_NAME)
    return {
      ok: false,
      error: `Tool name is too long (${MAX_TOOL_NAME} characters max).`,
    }

  // Before any write: this endpoint turns a session into an outbound-email
  // primitive pointed at the operator's inbox (migration 059).
  const { data: limit, error: limitError } = await supabase.rpc(
    "consume_feedback_rate_limit"
  )
  const allowed = Array.isArray(limit) ? limit[0]?.allowed : limit?.allowed
  if (limitError || !allowed)
    return {
      ok: false,
      error: "That's a lot of feedback in one go. Try again in a bit.",
    }

  if (category === "tool") {
    // Unsupported-tool demand has one home: tool_requests (migration 002),
    // which is what QUO-15 will read. Don't split the signal.
    const { error } = await supabase
      .from("tool_requests")
      .insert({ user_id: user.id, tool_name: toolName, note: message })
    if (error) return { ok: false, error: "Couldn't send that. Try again." }
  } else {
    const { error } = await supabase.from("feedback_submissions").insert({
      user_id: user.id,
      category,
      message,
      page_path: pagePath,
      // Stamped here, not taken from the client: the point is to know which
      // build the report came from.
      app_version: APP_VERSION,
      user_agent: userAgent,
    })
    if (error) return { ok: false, error: "Couldn't send that. Try again." }
  }

  await notify({
    category,
    message,
    toolName: toolName || null,
    pagePath,
    userEmail: user.email ?? null,
  })

  return { ok: true }
}

// Best-effort, after the row has landed. Unset FEEDBACK_NOTIFY_EMAIL (the
// self-host default) means no notification at all - a self-hosted instance
// must never mail its users' feedback to someone else's inbox.
async function notify(model: {
  category: FeedbackCategory
  message: string
  toolName: string | null
  pagePath: string | null
  userEmail: string | null
}): Promise<void> {
  const to = process.env.FEEDBACK_NOTIFY_EMAIL
  if (!to) return

  const { subject, html, text } = renderFeedbackEmail({
    ...model,
    appVersion: APP_VERSION,
  })
  const result = await sendEmail({ to, subject, html, text, tag: "feedback" })
  if (!result.ok) {
    // The submission is already stored, so this is a notification miss, not a
    // lost report. Log it and let the user see success.
    console.error("[feedback] notification failed:", result.error)
  }
}
