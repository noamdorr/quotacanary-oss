import { type RenderedEmail, esc } from "./alert"

export type FeedbackEmailModel = {
  category: "bug" | "feedback" | "tool"
  message: string
  toolName: string | null
  pagePath: string | null
  appVersion: string
  userEmail: string | null
}

const LABEL: Record<FeedbackEmailModel["category"], string> = {
  bug: "Bug report",
  feedback: "Feedback",
  tool: "Tool request",
}

// Operator-facing, not user-facing: this lands in the inbox of whoever runs the
// instance, so it optimises for triage (what, who, where, which build) over
// brand voice. Every interpolated value is escaped - the message is free text
// typed by a user.
export function renderFeedbackEmail(model: FeedbackEmailModel): RenderedEmail {
  const label = LABEL[model.category]
  const heading =
    model.category === "tool" && model.toolName
      ? `${label}: ${model.toolName}`
      : label

  const meta: [string, string][] = [
    ["From", model.userEmail ?? "unknown"],
    ["Page", model.pagePath ?? "unknown"],
    ["Version", model.appVersion],
  ]

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
      <tr><td style="height:16px;"></td></tr>
      <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;white-space:pre-wrap;">${esc(model.message)}</td></tr>
      <tr><td style="height:24px;"></td></tr>
      <tr><td><table cellpadding="0" cellspacing="0">${metaRows}</table></td></tr>
    </table>
  </td></tr>
</table>`

  const text = [
    heading,
    "",
    model.message,
    "",
    ...meta.map(([key, value]) => `${key}: ${value}`),
  ].join("\n")

  return { subject: `[QuotaCanary] ${heading}`, html, text }
}
