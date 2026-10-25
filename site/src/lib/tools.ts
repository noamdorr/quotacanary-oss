import raw from "../data/tools.json"

// The public tool catalog, snapshotted from the hosted `tools` table by
// scripts/pull-tools.mjs. Mirrors src/lib/marketing/tool-directory.ts in the
// Next app so the directory keeps its order, labels and SEO lines.
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

export const CATEGORY_ORDER = ["email_verification", "email_finding", "data", "ai"] as const

const CATEGORY_LABELS: Record<string, string> = {
  email_verification: "Email verification",
  email_finding: "Email finding",
  data: "Web data",
  ai: "LLMs",
}

export function categoryLabel(category: string | null): string {
  if (!category) return "Other"
  return (
    CATEGORY_LABELS[category] ??
    category
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  )
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

function rank(category: string | null): number {
  const i = CATEGORY_ORDER.indexOf((category ?? "") as (typeof CATEGORY_ORDER)[number])
  return i === -1 ? CATEGORY_ORDER.length : i
}

// Stable directory order: by category (CATEGORY_ORDER), then name.
export const TOOLS: Tool[] = [...(raw as Tool[])].sort(
  (a, b) => rank(a.category) - rank(b.category) || a.name.localeCompare(b.name)
)

export function getTool(id: string): Tool | undefined {
  return TOOLS.find((tool) => tool.id === id)
}
