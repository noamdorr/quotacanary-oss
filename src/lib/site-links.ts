// External product and policy pages live on the Astro site.
export const MARKETING_URL =
  process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://quotacanary.com"

// API docs are also available before setup. Prefer a configured origin, then
// use the public host/protocol of this request so examples never point a
// remote visitor at their own localhost.
export function resolveAppOrigin({
  appUrl,
  siteUrl,
  forwardedHost,
  host,
  forwardedProto,
}: {
  appUrl?: string
  siteUrl?: string
  forwardedHost?: string | null
  host?: string | null
  forwardedProto?: string | null
}): string {
  for (const configured of [appUrl, siteUrl]) {
    if (!configured?.trim()) continue
    try {
      const url = new URL(configured)
      if (
        ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        url.pathname === "/" &&
        !url.search &&
        !url.hash
      )
        return url.origin
    } catch {
      /* Try the next configured value or the request origin. */
    }
  }

  const publicHost = (forwardedHost ?? host)?.split(",")[0].trim()
  if (!publicHost) throw new Error("Cannot determine the app origin")
  const protocol =
    forwardedProto?.split(",")[0].trim() ||
    (/^(localhost|127\.0\.0\.1|\[::1\])(?::|$)/i.test(publicHost)
      ? "http"
      : "https")
  if (protocol !== "http" && protocol !== "https")
    throw new Error("Invalid public protocol")
  const url = new URL(`${protocol}://${publicHost}`)
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Invalid public host")
  }
  return url.origin
}
