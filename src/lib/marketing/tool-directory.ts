import type { Tool } from "@/lib/types"

// Display order + labels for the directory's categories. Unknown categories
// fall back to a title-cased version and sort last.
export const CATEGORY_ORDER = [
  "email_verification",
  "email_finding",
  "data",
  "ai",
] as const

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

// SEO subheading shown under the tool name on /directory/[id].
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

export function toolWebsiteUrl(
  tool: Pick<Tool, "website_url" | "topup_url" | "api_docs_url">
): string | null {
  return (
    tool.website_url ??
    rootWebsiteFromUrl(tool.topup_url) ??
    rootWebsiteFromUrl(tool.api_docs_url)
  )
}

// Stable directory order: by category (CATEGORY_ORDER), then name.
export function sortToolsForDirectory(tools: Tool[]): Tool[] {
  const rank = (c: string | null) => {
    const i = CATEGORY_ORDER.indexOf(
      (c ?? "") as (typeof CATEGORY_ORDER)[number]
    )
    return i === -1 ? CATEGORY_ORDER.length : i
  }
  return [...tools].sort(
    (a, b) =>
      rank(a.category) - rank(b.category) || a.name.localeCompare(b.name)
  )
}
