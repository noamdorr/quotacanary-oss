import type { MetadataRoute } from "next"

// Let crawlers read the app's X-Robots-Tag noindex header. API routes need
// neither indexing nor crawling; the public sitemap belongs to the Astro site.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: "/api/" } }
}
