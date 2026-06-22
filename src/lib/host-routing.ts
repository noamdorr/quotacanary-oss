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

// Every route in the (dashboard) group requires an authenticated user. Next's
// route groups are invisible in the URL, so the middleware can't infer
// protection from one path prefix - enumerate the protected roots here so the
// auth boundary is enforced in one place (defense in depth alongside each
// page's own getUser() guard). `(\/|$)` anchors on a full path segment, so
// `/settings` matches but `/settings-export` does not.
const PROTECTED_APP_PATHS =
  /^\/(dashboard|alerts|connect|developer|security|settings|tools)(\/|$)/

export function isProtectedAppPath(pathname: string): boolean {
  return PROTECTED_APP_PATHS.test(pathname)
}

// App-surface paths that do NOT require a logged-in user (so they're absent
// from isProtectedAppPath) but still belong to the app subdomain: the auth
// pages, the email-confirm callback, the REST API, and the MCP endpoint.
const APP_PUBLIC_PATHS = /^\/(login|update-password|auth|api|mcp)(\/|$)/

// Whether a path belongs to the app surface at all, so the marketing host can
// bounce it to the app subdomain. Built on top of isProtectedAppPath so a new
// protected route can never be gated by the auth check yet forgotten in the
// marketing redirect - which is exactly how /developer slipped out of this
// bounce before.
export function isAppOnlyPath(pathname: string): boolean {
  return isProtectedAppPath(pathname) || APP_PUBLIC_PATHS.test(pathname)
}
