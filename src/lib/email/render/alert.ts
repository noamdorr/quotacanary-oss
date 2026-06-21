export type AlertEmailPool = {
  label: string
  balance: number
  threshold: number
  unit: string | null
}

export type AlertEmailModel = {
  toolName: string
  severity: "low" | "critical"
  pools: AlertEmailPool[]
  dashboardUrl: string
  topupUrl?: string | null
  etaText?: string | null
}

export type RenderedEmail = { subject: string; html: string; text: string }

function fmt(n: number): string {
  return n.toLocaleString("en-US")
}

export function renderAlertEmail(model: AlertEmailModel): RenderedEmail {
  const subject =
    model.severity === "critical"
      ? `${model.toolName} is almost out of credits`
      : `Heads up: ${model.toolName} is running low`

  const lead =
    model.severity === "critical"
      ? `${model.toolName} is about to run dry.`
      : `${model.toolName} is getting low.`

  const poolRowsHtml = model.pools
    .map((p) => {
      const unit = p.unit ? ` ${p.unit}` : ""
      return `<tr><td style="padding:4px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;">${p.label}: <span style="font-family:monospace;font-weight:bold;">${fmt(p.balance)}${unit}</span> left <span style="color:#8a8a8a;">(threshold ${fmt(p.threshold)})</span></td></tr>`
    })
    .join("")

  const etaHtml = model.etaText
    ? `<tr><td style="padding:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;">${model.etaText}</td></tr>`
    : ""

  const topupHtml = model.topupUrl
    ? `<tr><td style="height:16px;"></td></tr><tr><td><a href="${model.topupUrl}" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;">Get more from ${model.toolName}</a></td></tr>`
    : ""

  const html = `<table width="100%" cellpadding="0" cellspacing="0" style="background:#FFFDF5;padding:32px 0;">
  <tr><td align="center">
    <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #f0ead6;border-radius:12px;padding:32px;">
      <tr><td style="font-family:Georgia,serif;font-size:22px;color:#1a1a1a;font-weight:bold;">QuotaCanary 🐤</td></tr>
      <tr><td style="height:16px;"></td></tr>
      <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#1a1a1a;line-height:1.5;">${lead}</td></tr>
      <tr><td style="height:16px;"></td></tr>
      <tr><td><table cellpadding="0" cellspacing="0">${poolRowsHtml}${etaHtml}</table></td></tr>
      <tr><td style="height:24px;"></td></tr>
      <tr><td><a href="${model.dashboardUrl}" style="background:#FFC400;color:#1a1a1a;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:8px;display:inline-block;font-family:Arial,Helvetica,sans-serif;">Open dashboard</a></td></tr>
      ${topupHtml}
    </table>
  </td></tr>
</table>`

  const poolRowsText = model.pools
    .map((p) => {
      const unit = p.unit ? ` ${p.unit}` : ""
      return `- ${p.label}: ${fmt(p.balance)}${unit} left (threshold ${fmt(p.threshold)})`
    })
    .join("\n")

  const text = [
    lead,
    "",
    poolRowsText,
    model.etaText ? `\n${model.etaText}` : "",
    "",
    `Open dashboard: ${model.dashboardUrl}`,
    model.topupUrl ? `Get more: ${model.topupUrl}` : "",
  ]
    .filter((line) => line !== "")
    .join("\n")

  return { subject, html, text }
}
