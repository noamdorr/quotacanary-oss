import type { NextConfig } from "next"

// Analytics is opt-in (see PlausibleAnalytics): the hosted deploy points this
// at its Plausible instance, a self-host leaves it unset and gets a policy
// with no third-party script origin at all. A relative value (a self-proxied
// script) needs no entry - 'self' already covers it.
const plausibleScriptSrc = process.env.PLAUSIBLE_SCRIPT_SRC
const plausibleOrigin = plausibleScriptSrc?.startsWith("https://")
  ? new URL(plausibleScriptSrc).origin
  : null

// React uses eval() in development for debugging features (readable stacks,
// HMR) and never in production, so this stays out of the shipped policy.
const devEval = process.env.NODE_ENV === "production" ? null : "'unsafe-eval'"

// 'unsafe-inline' is load-bearing, not lazy: Next streams the RSC payload and
// its bootstrap through inline <script> tags, and without a per-request nonce
// a bare 'self' blocks all of them and the app never hydrates. It still stops
// an injected <script src> from pulling code off an attacker's origin, which
// is the Plausible-compromise case this policy is here for. Upgrading to a
// nonce is QUO-65.
const scriptSrc = ["'self'", "'unsafe-inline'", devEval, plausibleOrigin]
  .filter(Boolean)
  .join(" ")

const contentSecurityPolicy = [
  `script-src ${scriptSrc}`,
  // No <object>/<embed> anywhere, and lock <base> so an injected tag cannot
  // repoint every relative script URL at an attacker.
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ")

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // Dev-only (ignored by `next build`): the marketing surface is previewed on
  // 127.0.0.1 (localhost routes to the app surface), and without this Next 16
  // rejects the HMR websocket from that origin, which stalls dev hydration -
  // the marketing page renders but no client component ever becomes
  // interactive.
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            // Both surfaces are HTTPS-only in prod (Cloudflare + Railway);
            // browsers ignore HSTS over plain http, so dev is unaffected.
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Nothing embeds QuotaCanary in a frame; belt and braces.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
        ],
      },
    ]
  },
}

export default nextConfig
