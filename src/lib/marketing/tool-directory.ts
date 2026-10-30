import type { Tool } from "@/lib/types"

// Labels and search shared by the self-host connection picker.
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

export function toolMatchesQuery(
  tool: Pick<Tool, "name" | "category">,
  query: string
): boolean {
  const normalizedQuery = query.trim().toLowerCase().replace(/[_-]+/g, " ")
  if (!normalizedQuery) return true

  const searchable = [
    tool.name,
    tool.category ?? "",
    categoryLabel(tool.category),
  ]
    .join(" ")
    .toLowerCase()
    .replace(/[_-]+/g, " ")

  return searchable.includes(normalizedQuery)
}
