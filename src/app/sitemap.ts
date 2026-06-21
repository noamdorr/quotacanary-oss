import { getActiveTools } from "@/lib/db/tools"
import type { MetadataRoute } from "next"

const SITE = "https://quotacanary.com"

// Match the directory's ISR so newly added tools enter the sitemap within ~1h
// without a redeploy.
export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const tools = await getActiveTools()
  return [
    { url: `${SITE}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/directory`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE}/terms`, changeFrequency: "yearly", priority: 0.2 },
    ...tools.map((t) => ({
      url: `${SITE}/directory/${t.id}`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ]
}
