import raw from "../data/tools.json"
import { BUCKETS, TOOL_BUCKET } from "./buckets.mjs"
import { KEY_IN_URL } from "./key-in-url.mjs"

// The public tool catalog, snapshotted from the migrations' `tools` table by
// scripts/pull-tools.mjs, one record per tool the Mac app supports. Mirrors
// src/lib/marketing/tool-directory.ts in the Next app so the directory keeps its order, labels and SEO lines.
export type ToolPool = { credit_type: string; label: string; unit?: string }

export type Tool = {
  id: string
  name: string
  logo_url: string | null
  category: string | null
  description: string | null
  website_url: string | null
  api_docs_url: string | null
  key_instructions: string | null
  topup_url: string | null
  pools: ToolPool[] | null
}

// Directory buckets (site-only, see buckets.mjs), in chip order.
export const BUCKET_ORDER = BUCKETS.map((bucket) => bucket.id)

export function bucketOf(tool: Tool): string {
  return TOOL_BUCKET[tool.id] ?? ""
}

export function bucketLabel(bucket: string): string {
  return BUCKETS.find((b) => b.id === bucket)?.label ?? "Other"
}

export function keyInUrl(tool: Tool): boolean {
  return KEY_IN_URL.has(tool.id)
}

export function toolSubheading(name: string): string {
  return `Check your ${name} credit balance and burn rate`
}

const TOOL_SERVICE_SUBDOMAINS = new Set([
  "account",
  "api",
  "app",
  "billing",
  "console",
  "dashboard",
  "developer",
  "developers",
  "docs",
  "help",
  "portal",
  "support",
])

function rootWebsiteFromUrl(url: string | null): string | null {
  if (!url) return null
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const parts = parsed.hostname.split(".")
  if (parts.length > 2 && TOOL_SERVICE_SUBDOMAINS.has(parts[0])) {
    parsed.hostname = parts.slice(1).join(".")
  }
  parsed.pathname = "/"
  parsed.search = ""
  parsed.hash = ""
  return parsed.toString()
}

export function toolWebsiteUrl(tool: Tool): string | null {
  return (
    tool.website_url ??
    rootWebsiteFromUrl(tool.topup_url) ??
    rootWebsiteFromUrl(tool.api_docs_url)
  )
}

export function withUtm(
  url: string | null | undefined,
  params: { source?: string; medium?: string; campaign?: string } = {}
): string {
  if (!url) return url ?? ""
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return url
  }
  const { source = "quotacanary", medium = "directory", campaign } = params
  parsed.searchParams.set("utm_source", source)
  parsed.searchParams.set("utm_medium", medium)
  if (campaign) parsed.searchParams.set("utm_campaign", campaign)
  return parsed.toString()
}

function rank(tool: Tool): number {
  const i = BUCKET_ORDER.indexOf(bucketOf(tool))
  return i === -1 ? BUCKET_ORDER.length : i
}

// Stable directory order: by bucket (BUCKET_ORDER), then name.
export const TOOLS: Tool[] = [...(raw as Tool[])].sort(
  (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)
)

export function getTool(id: string): Tool | undefined {
  return TOOLS.find((tool) => tool.id === id)
}
