import type { NextConfig } from "next"

// The Content-Security-Policy is NOT here: it carries a per-request nonce, so
// it is built in src/lib/csp.ts and set by the proxy. headers() is compiled
// into the build and can only hold the static headers below.
//
// The one exception is the fixed no-script policy on the paths the proxy
// matcher skips (see ASSET_CSP): it holds no nonce, so a static rule is
// correct there.

// Mirrors the proxy matcher's exclusions in src/proxy.ts. Those paths never
// reach the proxy, so they would otherwise carry no CSP at all. (/_next/image
// is left out: Next sets its own stricter policy on it.) They are
// static files, never rendered as a page that runs Next's scripts, so
// everything but inline styles and same-origin images is denied; an SVG
// opened directly as a document can no longer run script.
const ASSET_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'"
const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // Allow local IP access to the self-host app's development HMR websocket.
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            // HTTPS deployments use HSTS;
            // browsers ignore HSTS over plain http, so dev is unaffected.
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Nothing embeds QuotaCanary in a frame; belt and braces.
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      {
        source: "/:path*.(svg|png|jpg|jpeg|gif|webp)",
        headers: [{ key: "Content-Security-Policy", value: ASSET_CSP }],
      },
      {
        source: "/_next/static/:path*",
        headers: [{ key: "Content-Security-Policy", value: ASSET_CSP }],
      },
      {
        source: "/favicon.ico",
        headers: [{ key: "Content-Security-Policy", value: ASSET_CSP }],
      },
    ]
  },
}

export default nextConfig
