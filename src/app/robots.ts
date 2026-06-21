import { resolveHost } from "@/lib/host-routing"
import type { MetadataRoute } from "next"
import { headers } from "next/headers"

// One file serves /robots.txt on both hosts (the proxy splits marketing vs app
// by hostname, but the route tree is shared). The app host stays crawlable so
// search engines can see its X-Robots-Tag noindex header; the sitemap lives only
// on the marketing apex.
export default async function robots(): Promise<MetadataRoute.Robots> {
  const requestHeaders = await headers()
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host")

  if (resolveHost(host) === "app") {
    return {
      rules: {
        userAgent: "*",
        allow: "/",
        disallow: "/api/",
      },
    }
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/alerts",
        "/settings",
        "/security",
        "/connect",
        "/login",
        "/update-password",
        "/tools",
        "/auth/",
        "/api/",
      ],
    },
    sitemap: "https://quotacanary.com/sitemap.xml",
  }
}
