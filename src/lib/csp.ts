// The Content-Security-Policy for both surfaces. It is built here and set on
// every response by the proxy (src/proxy.ts), the only place a per-request
// value can live: next.config.ts headers() is compiled into the build and
// cannot carry a nonce. Keep the policy in this one module so there is a single
// source of truth for what a browser may execute.

// The request header the proxy uses to hand the nonce to our own <script>
// tags (Plausible init, JSON-LD); Next reads the same nonce off the request's
// Content-Security-Policy header for its bootstrap and RSC-payload scripts.
export const NONCE_HEADER = "x-nonce"

// 128 bits, base64: what the CSP spec asks of a nonce.
export function createNonce(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString(
    "base64"
  )
}

export function buildContentSecurityPolicy(nonce: string): string {
  // Analytics is opt-in (see PlausibleAnalytics): the hosted deploy points this
  // at its Plausible instance, a self-host leaves it unset and gets a policy
  // with no third-party script origin at all. A relative value (a self-proxied
  // script) needs no entry - 'self' already covers it. A value that does not
  // parse contributes nothing rather than throwing: this runs on every
  // request, and a typo in an env var must cost analytics, not the site.
  const plausibleScriptSrc = process.env.PLAUSIBLE_SCRIPT_SRC
  const plausibleOrigin =
    plausibleScriptSrc?.startsWith("https://") &&
    URL.canParse(plausibleScriptSrc)
      ? new URL(plausibleScriptSrc).origin
      : null

  // React uses eval() in development for debugging features (readable stacks,
  // HMR) and never in production, so this stays out of the shipped policy.
  const devEval = process.env.NODE_ENV === "production" ? null : "'unsafe-eval'"

  // No 'unsafe-inline': an inline <script> only runs if it carries this
  // request's nonce, which an injected one cannot know. Browsers that support
  // nonces ignore 'unsafe-inline' anyway, so the fallback for those that do
  // not is "no inline scripts", not a weaker policy.
  const scriptSrc = ["'self'", `'nonce-${nonce}'`, devEval, plausibleOrigin]
    .filter(Boolean)
    .join(" ")

  return [
    `script-src ${scriptSrc}`,
    // No <object>/<embed> anywhere, and lock <base> so an injected tag cannot
    // repoint every relative script URL at an attacker.
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join("; ")
}
