import type { Tool } from "@/lib/types"

export const FEATURED_TOOL_IDS = [
  "hunter",
  "neverbounce",
  "openrouter",
  "scraperapi",
] as const

export type FeaturedTool = Pick<
  Tool,
  | "id"
  | "name"
  | "logo_url"
  | "key_instructions"
  | "default_low_threshold"
  | "default_alert_threshold"
  | "pools"
  | "credential_fields"
>

// Prefer the curated featured ids (in order); if any are missing from the
// active catalog, pad with the first other active tools up to four.
export function resolveFeaturedTools(active: FeaturedTool[]): FeaturedTool[] {
  const byId = new Map(active.map((t) => [t.id, t]))
  const picked: FeaturedTool[] = []
  for (const id of FEATURED_TOOL_IDS) {
    const t = byId.get(id)
    if (t) picked.push(t)
  }
  for (const t of active) {
    if (picked.length >= 4) break
    if (!picked.some((p) => p.id === t.id)) picked.push(t)
  }
  return picked.slice(0, 4)
}
