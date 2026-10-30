// The production server for the static Astro build in dist/.
//
// Astro prerenders every page; this file is what Railway runs. It owns the
// things a static host would otherwise have to be configured for:
// response headers (the Content-Security-Policy and friends that the Next
// app set from its proxy), the www -> apex redirect, the 404 page, and the
// Mac download redirects.
//
// Environment:
//   PORT                  Railway sets it; defaults to 4321 locally.
//   PLAUSIBLE_SCRIPT_SRC  The same variable the Astro build reads to emit the
//                         analytics <script>; its origin goes into the CSP
//                         here. Unset = no analytics and no third-party origin.
//   CANONICAL_HOST        Hostname to redirect to (default quotacanary.com).
//                         Set it empty to disable the redirect, e.g. on the
//                         Railway-provided *.up.railway.app URL.
import { createServer } from "node:http"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import sirv from "sirv"

const here = dirname(fileURLToPath(import.meta.url))
const dist = join(here, "dist")
const port = Number(process.env.PORT ?? 4321)
const canonicalHost =
  process.env.CANONICAL_HOST === undefined ? "quotacanary.com" : process.env.CANONICAL_HOST

// The Mac release archives are GitHub Release assets on the public mirror
// (QUO-350), too big to live in git. The app and the website only ever name
// quotacanary.com paths; this server turns them into the asset URL, so a
// hosting move needs no app release.
export const MAC_RELEASE_REPO = "noamdorr/quotacanary-oss"
const MAC_VERSION = /^\d+\.\d+\.\d+$/

export function latestMacVersion(feedText) {
  // The feed sign-update.sh wrote is the one place the site learns the
  // version; mac/VERSION stays the only hand-edited copy.
  try {
    const version = JSON.parse(feedText)?.version
    return typeof version === "string" && MAC_VERSION.test(version) ? version : null
  } catch {
    return null
  }
}

export function macDownloadLocation(pathname, latest) {
  // The button gets the disk image (drag to Applications, QUO-364); the
  // update feed keeps naming the zip, which is what the updater verifies.
  if (pathname === "/download/mac") return latest ? `/mac/QuotaCanary-${latest}.dmg` : null
  const match = /^\/mac\/QuotaCanary-(\d+\.\d+\.\d+)\.(zip|dmg)$/.exec(pathname)
  return match
    ? `https://github.com/${MAC_RELEASE_REPO}/releases/download/mac-v${match[1]}/QuotaCanary-${match[1]}.${match[2]}`
    : null
}

export function plausibleOrigin(scriptSrc = process.env.PLAUSIBLE_SCRIPT_SRC) {
  // A value that does not parse contributes nothing rather than throwing: a
  // typo in an env var must cost analytics, not the site.
  return scriptSrc?.startsWith("https://") && URL.canParse(scriptSrc)
    ? new URL(scriptSrc).origin
    : null
}

export function buildContentSecurityPolicy(origin = plausibleOrigin()) {
  // No inline scripts anywhere (astro.config.mjs keeps every <script> as a
  // same-origin file), so script-src needs neither nonces nor
  // 'unsafe-inline'. Inline styles stay allowed: Astro's and the design pass's
  // small style attributes are not worth a hash scheme.
  const scriptSrc = ["'self'", origin].filter(Boolean).join(" ")
  const connectSrc = ["'self'", origin].filter(Boolean).join(" ")
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "media-src 'self'",
    `connect-src ${connectSrc}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ")
}

export const SECURITY_HEADERS = {
  "Content-Security-Policy": buildContentSecurityPolicy(),
  // Both hosts are HTTPS-only in prod (Cloudflare + Railway); browsers ignore
  // HSTS over plain http, so local runs are unaffected.
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
}

const notFoundPage = (() => {
  try {
    return readFileSync(join(dist, "404.html"))
  } catch {
    return Buffer.from("Not found")
  }
})()

// Read once: dist/ never changes while a deploy runs.
const latestMac = (() => {
  try {
    return latestMacVersion(readFileSync(join(dist, "mac", "updates.json"), "utf8"))
  } catch {
    return null
  }
})()

const serve = sirv(dist, {
  // Production caches the file list at start (dist/ never changes while a
  // deploy runs). SITE_DEV=1 re-reads the disk per request so a rebuild under
  // a running local server swaps in cleanly instead of 404ing hashed assets.
  dev: process.env.SITE_DEV === "1",
  // Astro's hashed assets under /_astro/ are immutable; everything else
  // (pages, logos, fonts) gets a short cache so a deploy shows up promptly.
  maxAge: 3600,
  immutable: false,
  etag: true,
  extensions: ["html"],
  setHeaders(res, pathname) {
    if (pathname.startsWith("/_astro/")) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable")
    } else if (!/\.(png|jpe?g|webp|svg|ico|woff2?|mp4|js|css)$/i.test(pathname)) {
      // Pages (and the sitemap, robots) revalidate on every request via the
      // ETag, so a deploy or a copy fix is visible at once, not an hour later.
      res.setHeader("Cache-Control", "no-cache")
    }
  },
})

export function requestHandler(req, res) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(name, value)
  }

  const url = new URL(req.url ?? "/", "http://localhost")

  if (url.pathname === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain" })
    res.end("ok")
    return
  }

  // www (and any other alias Cloudflare points here) -> the apex, once.
  const host = (req.headers["x-forwarded-host"] ?? req.headers.host ?? "")
    .toString()
    .split(",")[0]
    .trim()
    .toLowerCase()
    .split(":")[0]
  if (canonicalHost && host && host !== canonicalHost && host.endsWith(canonicalHost)) {
    res.writeHead(301, { Location: `https://${canonicalHost}${url.pathname}${url.search}` })
    res.end()
    return
  }

  // Trailing slashes are not canonical (astro.config.mjs: trailingSlash never).
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    res.writeHead(301, { Location: `${url.pathname.replace(/\/+$/, "")}${url.search}` })
    res.end()
    return
  }

  // The Mac page folded into the homepage (QUO-213, 2026-10-16); shared links
  // still land on the download block. Only the page: /mac/updates.json and
  // the update archives under /mac/ are files the Mac app fetches.
  if (url.pathname === "/mac") {
    res.writeHead(301, { Location: `/#download` })
    res.end()
    return
  }

  // Versioned archives go to their release asset; /download/mac to the
  // latest. no-store so a new release is visible on the next click.
  const macLocation = macDownloadLocation(url.pathname, latestMac)
  if (macLocation) {
    res.writeHead(302, { Location: macLocation, "Cache-Control": "no-store" })
    res.end()
    return
  }

  // Retired API documentation; self-host instructions are linked from home.
  if (url.pathname === "/docs") {
    res.writeHead(301, { Location: "/" })
    res.end()
    return
  }

  serve(req, res, () => {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" })
    res.end(notFoundPage)
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createServer(requestHandler).listen(port, () => {
    console.log(`quotacanary-site listening on :${port}`)
  })
}
