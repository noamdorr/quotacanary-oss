import type { PollOutcome } from "@/lib/poll-run"
import { type RenderedEmail, esc } from "./alert"

export type PollAlarmEmailModel = {
  outcome: PollOutcome
  connectionsPolled: number
  refreshFailed: number
  alertsFailed: number
  alertsDegraded: boolean
  missedRuns: number
}

// Operator-facing, like the feedback notification: this lands in the inbox of
// whoever runs the instance, so it optimises for deciding which playbook to
// open (docs/runbooks/poll-cron.md) over brand voice. Nothing here is
// user-supplied, but every value is escaped anyway.
export function renderPollAlarmEmail(
  model: PollAlarmEmailModel
): RenderedEmail {
  const heading =
    model.outcome === "ok"
      ? `Poll schedule missed ${model.missedRuns} ${
          model.missedRuns === 1 ? "run" : "runs"
        }`
      : `Poll run ${model.outcome}`

  const meta: [string, string][] = [
    ["Outcome", model.outcome],
    ["Connections polled", String(model.connectionsPolled)],
    ["Refreshes failed", String(model.refreshFailed)],
    ["Alert sends failed", String(model.alertsFailed)],
    ["Alert delivery", model.alertsDegraded ? "degraded" : "ok"],
    ["Missed runs", String(model.missedRuns)],
  ]

  const footer = "Server logs carry the cause on the lines starting [poll]."

  const metaRows = meta
    .map(
      ([key, value]) =>
        `<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6b6b6b;padding:2px 12px 2px 0;">${esc(key)}</td><td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#1a1a1a;">${esc(value)}</td></tr>`
    )
    .join("")

  const html = `<table width="100%" cellpadding="0" cellspacing="0" style="background:#FFFDF5;padding:32px 0;">
  <tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #f0ead6;border-radius:12px;padding:32px;">
      <tr><td style="font-family:Georgia,serif;font-size:20px;color:#1a1a1a;font-weight:bold;">${esc(heading)}</td></tr>
      <tr><td style="height:24px;"></td></tr>
      <tr><td><table cellpadding="0" cellspacing="0">${metaRows}</table></td></tr>
      <tr><td style="height:24px;"></td></tr>
      <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6b6b6b;line-height:1.5;">${esc(footer)}</td></tr>
    </table>
  </td></tr>
</table>`

  const text = [
    heading,
    "",
    ...meta.map(([key, value]) => `${key}: ${value}`),
    "",
    footer,
  ].join("\n")

  return { subject: `[QuotaCanary] ${heading}`, html, text }
}
