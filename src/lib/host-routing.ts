export type HostSurface = "app" | "marketing"

// Decides which surface a hostname targets. The app lives on the `app.`
// subdomain; everything else (apex, www) is the marketing site. Local dev:
// bare `localhost` defaults to the app so existing workflows are unchanged;
// `marketing.localhost` lets a developer preview the public site.
export function resolveHost(hostname: string | null | undefined): HostSurface {
  // Self-host single-domain mode: serve the app surface on every host.
  if (process.env.APP_ONLY === "true") return "app"
  if (!hostname) return "marketing"
  const host = hostname.split(":")[0].toLowerCase()

  if (host === "localhost" || host === "app.localhost") return "app"
  if (host === "marketing.localhost") return "marketing"

  // Anchor the app subdomain to our own domains so a spoofed Host header
  // (e.g. app.evil.com) can't be classified as the app surface.
  if (
    host.startsWith("app.") &&
    (host.endsWith("quotacanary.com") || host.endsWith("localhost"))
  ) {
    return "app"
  }
  return "marketing"
}
