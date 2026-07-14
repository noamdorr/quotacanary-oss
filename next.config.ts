import type { NextConfig } from "next"

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
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
    ]
  },
}

export default nextConfig
