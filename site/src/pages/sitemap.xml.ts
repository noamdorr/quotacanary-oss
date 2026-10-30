import type { APIRoute } from "astro"
import { SITE_URL } from "../lib/copy"
import { TOOLS } from "../lib/tools"

// The marketing sitemap, moved wholesale from the Next app's src/app/sitemap.ts
// (same URLs, same priorities). The app host is noindex and has none.
const PAGES: Array<{ path: string; changefreq: string; priority: number }> = [
  { path: "/", changefreq: "weekly", priority: 1 },
  { path: "/directory", changefreq: "weekly", priority: 0.8 },
  { path: "/security", changefreq: "monthly", priority: 0.6 },
  { path: "/privacy", changefreq: "yearly", priority: 0.2 },
  { path: "/terms", changefreq: "yearly", priority: 0.2 },
  ...TOOLS.map((tool) => ({
    path: `/directory/${tool.id}`,
    changefreq: "monthly",
    priority: 0.6,
  })),
]

// The site is a static build, so the build date is each page's lastmod.
const LASTMOD = new Date().toISOString().slice(0, 10)

export const GET: APIRoute = () => {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PAGES.map(
  (page) =>
    `  <url><loc>${SITE_URL}${page.path}</loc><lastmod>${LASTMOD}</lastmod><changefreq>${page.changefreq}</changefreq><priority>${page.priority}</priority></url>`
).join("\n")}
</urlset>
`
  return new Response(body, { headers: { "Content-Type": "application/xml" } })
}
