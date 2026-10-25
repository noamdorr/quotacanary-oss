import { type RenderedEmail, esc } from "./alert"

// The "stopped checking" email (QUO-289). Its lead is the alert event's own
// body, so the inbox, Slack, the webhook and the email all say the same thing.
export type StoppedCheckingEmailModel = {
  toolName: string
  body: string
  dashboardUrl: string
}

export function renderStoppedCheckingEmail(
  model: StoppedCheckingEmailModel
): RenderedEmail {
  // Staged for Noam's pick with the rest of the QUO-289 copy (option A).
  const subject = `${model.toolName} isn't being checked anymore`

  const html = `<table width="100%" cellpadding="0" cellspacing="0" style="background:#FFFDF5;padding:32px 0;">
  <tr><td align="center">
    <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #f0ead6;border-radius:12px;padding:32px;">
      <tr><td style="font-family:Georgia,serif;font-size:22px;color:#1a1a1a;font-weight:bold;">QuotaCanary 🐤</td></tr>
      <tr><td style="height:16px;"></td></tr>
      <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#1a1a1a;line-height:1.5;">${esc(model.body)}</td></tr>
      <tr><td style="height:24px;"></td></tr>
      <tr><td><a href="${esc(model.dashboardUrl)}" style="background:#FFC400;color:#1a1a1a;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:8px;display:inline-block;font-family:Arial,Helvetica,sans-serif;">Open dashboard</a></td></tr>
    </table>
  </td></tr>
</table>`

  const text = [model.body, "", `Open dashboard: ${model.dashboardUrl}`].join(
    "\n"
  )

  return { subject, html, text }
}
