import type { AlertLevel } from "@/lib/types"

export type AlertDestinationKind = "webhook" | "slack_webhook"
export type AlertDeliveryLevel = Exclude<AlertLevel, "none">

export type AlertDestinationEvent = {
  id: string
  level: AlertDeliveryLevel
  toolName: string
  connectionId: string
  connectionName: string
  title: string
  body: string
  pools: {
    label: string
    balance: number
    threshold: number
    unit: string | null
  }[]
  dashboardUrl: string
  topupUrl: string | null
  createdAt: string
}

export type AlertDestinationRow = {
  id: string
  user_id: string
  kind: AlertDestinationKind
  name: string
  encrypted_url: string
  min_level: AlertDeliveryLevel
  is_enabled?: boolean
}

export type DestinationSendResult = { ok: true } | { ok: false; error: string }

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\./,
  /^\[?::1\]?$/i,
]

export function isDestinationLevelAllowed(
  minLevel: AlertDeliveryLevel,
  eventLevel: AlertDeliveryLevel
): boolean {
  if (minLevel === "critical") return eventLevel === "critical"
  return true
}

export function validateDestinationUrl(
  raw: string
): { ok: true; url: string } | { ok: false; error: string } {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return { ok: false, error: "Enter a valid webhook URL." }
  }

  if (url.protocol !== "https:" || isPrivateHostname(url.hostname)) {
    return { ok: false, error: "Use a public HTTPS webhook URL." }
  }

  url.username = ""
  url.password = ""
  return { ok: true, url: url.toString() }
}

export function destinationUrlHint(raw: string): string {
  const url = new URL(raw)
  const path = url.pathname === "/" ? "" : url.pathname
  return `${url.host}${path}`.slice(0, 96)
}

export function renderDestinationPayload(
  kind: AlertDestinationKind,
  event: AlertDestinationEvent
): unknown {
  if (kind === "slack_webhook") return renderSlackPayload(event)
  return renderWebhookPayload(event)
}

export async function postAlertDestination(
  kind: AlertDestinationKind,
  url: string,
  event: AlertDestinationEvent
): Promise<DestinationSendResult> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "QuotaCanary/1.0",
      },
      body: JSON.stringify(renderDestinationPayload(kind, event)),
    })

    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    return { ok: true }
  } catch {
    return { ok: false, error: "Webhook request failed." }
  }
}

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(normalized))
}

function renderWebhookPayload(event: AlertDestinationEvent) {
  return {
    event: `quota.alert.${event.level}`,
    id: event.id,
    level: event.level,
    title: event.title,
    body: event.body,
    tool: { name: event.toolName },
    connection: {
      id: event.connectionId,
      name: event.connectionName,
    },
    pools: event.pools,
    dashboard_url: event.dashboardUrl,
    topup_url: event.topupUrl,
    created_at: event.createdAt,
  }
}

function renderSlackPayload(event: AlertDestinationEvent) {
  const poolText =
    event.pools.length > 0
      ? event.pools.map(formatPoolLine).join("\n")
      : "No matching pool details were available."

  return {
    text: `${event.title}: ${event.body}`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: event.title,
          emoji: false,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${event.body}\n${poolText}`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Open QuotaCanary",
              emoji: false,
            },
            url: event.dashboardUrl,
          },
        ],
      },
    ],
  }
}

function formatPoolLine(pool: AlertDestinationEvent["pools"][number]): string {
  const unit = pool.unit ? ` ${pool.unit}` : ""
  return `*${pool.label}:* ${pool.balance}${unit} left, threshold ${pool.threshold}${unit}`
}
