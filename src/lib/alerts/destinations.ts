import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
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

// Hostnames that must never be reachable as a webhook target.
const BLOCKED_HOSTNAMES = [
  /^localhost$/i,
  /\.localhost$/i,
  /^metadata$/i,
  /^metadata\.google\.internal$/i,
  /\.internal$/i,
]

// True when an IP literal points at loopback, private (RFC1918), link-local
// (incl. the 169.254.169.254 cloud-metadata endpoint), CGNAT, or other
// non-public space. IPv4 numeric/hex forms are normalized to dotted decimal by
// the URL parser before they reach here.
export function isBlockedIp(ip: string): boolean {
  const version = isIP(ip)
  if (version === 4) return isBlockedIpv4(ip)
  if (version === 6) return isBlockedIpv6(ip)
  return true
}

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number)
  if (
    parts.length !== 4 ||
    parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)
  ) {
    return true
  }
  const [a, b, c] = parts
  if (a === 0) return true // "this" network
  if (a === 10) return true // RFC1918
  if (a === 127) return true // loopback
  if (a === 169 && b === 254) return true // link-local (incl. 169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true // RFC1918
  if (a === 192 && b === 168) return true // RFC1918
  if (a === 192 && b === 0 && c === 0) return true // IETF protocol (192.0.0.192)
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT (100.100.100.200)
  if (a === 168 && b === 63 && c === 129) return true // Azure metadata
  if (a >= 224) return true // multicast + reserved + broadcast
  return false
}

function isBlockedIpv6(ip: string): boolean {
  const v = ip.toLowerCase()
  if (v === "::" || v === "::1") return true // unspecified, loopback
  const mapped = v.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (mapped) return isBlockedIpv4(mapped[1])
  if (/^fe[89ab]/.test(v)) return true // fe80::/10 link-local
  if (/^f[cd]/.test(v)) return true // fc00::/7 unique-local
  return false
}

function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase()
  return BLOCKED_HOSTNAMES.some((pattern) => pattern.test(h))
}

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

  const host = url.hostname.replace(/^\[|\]$/g, "")
  const blocked = isIP(host) ? isBlockedIp(host) : isBlockedHostname(host)
  if (url.protocol !== "https:" || blocked) {
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
  // Re-validate at dispatch, not just at save: the stored URL is decrypted here
  // and the request is about to leave the server.
  const valid = validateDestinationUrl(url)
  if (!valid.ok) return { ok: false, error: "Webhook target is not allowed." }

  // Resolve the hostname and refuse if it points at internal/metadata space.
  // Catches a public hostname pointed at a private IP (e.g. an A record for
  // 169.254.169.254). A DNS-rebinding attacker can still vary the answer between
  // this lookup and fetch's own resolution; fully closing that needs IP pinning.
  const host = new URL(valid.url).hostname.replace(/^\[|\]$/g, "")
  if (!isIP(host)) {
    try {
      const addresses = await lookup(host, { all: true })
      if (addresses.some((entry) => isBlockedIp(entry.address))) {
        return { ok: false, error: "Webhook host is not allowed." }
      }
    } catch {
      return { ok: false, error: "Webhook request failed." }
    }
  }

  try {
    const res = await fetch(valid.url, {
      method: "POST",
      redirect: "manual",
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
