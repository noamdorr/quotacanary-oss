import { afterEach, describe, expect, it, vi } from "vitest"
import nextConfig from "../../next.config"
import { buildContentSecurityPolicy, createNonce } from "./csp"

describe("Content-Security-Policy", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("restricts script execution to first-party code carrying the request's nonce", () => {
    const csp = buildContentSecurityPolicy("abc123")

    expect(csp).toContain("script-src 'self' 'nonce-abc123'")
    expect(csp).not.toContain("'unsafe-inline'")
  })

  it("keeps the cheap injection-vector directives", () => {
    const csp = buildContentSecurityPolicy("abc123")

    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
  })

  it("allows the Plausible origin only when the hosted config points at one", () => {
    vi.stubEnv("PLAUSIBLE_SCRIPT_SRC", undefined)
    expect(buildContentSecurityPolicy("n")).not.toContain("https://")

    vi.stubEnv("PLAUSIBLE_SCRIPT_SRC", "/js/script.js")
    expect(buildContentSecurityPolicy("n")).not.toContain("/js/script.js")

    // A typo in the env var must not take every request down with a throw.
    vi.stubEnv("PLAUSIBLE_SCRIPT_SRC", "https://plausible example.com/js")
    expect(buildContentSecurityPolicy("n")).not.toContain("https://")

    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv(
      "PLAUSIBLE_SCRIPT_SRC",
      "https://plausible.example.com/js/script.js"
    )
    const csp = buildContentSecurityPolicy("n")
    expect(csp).toContain(
      "script-src 'self' 'nonce-n' https://plausible.example.com;"
    )
    expect(csp).not.toContain("/js/script.js")
  })

  it("permits eval only outside production", () => {
    vi.stubEnv("NODE_ENV", "production")
    expect(buildContentSecurityPolicy("n")).not.toContain("'unsafe-eval'")

    vi.stubEnv("NODE_ENV", "development")
    expect(buildContentSecurityPolicy("n")).toContain("'unsafe-eval'")
  })

  it("mints a fresh 128-bit base64 nonce per request", () => {
    const nonce = createNonce()

    expect(nonce).toMatch(/^[A-Za-z0-9+/]+={0,2}$/)
    expect(Buffer.from(nonce, "base64")).toHaveLength(16)
    expect(createNonce()).not.toBe(nonce)
  })

  it("is not also served from the static config on document routes, which cannot carry a nonce", async () => {
    const routes = (await nextConfig.headers?.()) ?? []
    const documentKeys = routes
      .filter((route) => route.source === "/(.*)")
      .flatMap((route) => route.headers.map((header) => header.key))

    expect(documentKeys).not.toContain("Content-Security-Policy")
    // The static headers stay where they were.
    expect(documentKeys).toContain("Strict-Transport-Security")
    expect(documentKeys).toContain("X-Content-Type-Options")
    expect(documentKeys).toContain("X-Frame-Options")
  })

  it("gives the paths the proxy matcher skips a fixed no-script policy", async () => {
    const routes = (await nextConfig.headers?.()) ?? []
    const assetRoutes = routes.filter((route) =>
      route.headers.some((header) => header.key === "Content-Security-Policy")
    )
    const policies = new Set(
      assetRoutes.flatMap((route) =>
        route.headers
          .filter((header) => header.key === "Content-Security-Policy")
          .map((header) => header.value)
      )
    )

    expect([...policies]).toHaveLength(1)
    const [policy] = [...policies]
    expect(policy).toContain("default-src 'none'")
    expect(policy).not.toContain("script-src")
    expect(policy).not.toContain("nonce")
    // One rule per exclusion in src/proxy.ts's matcher (Next covers /_next/image itself).
    expect(assetRoutes.map((route) => route.source).sort()).toEqual([
      "/:path*.(svg|png|jpg|jpeg|gif|webp)",
      "/_next/static/:path*",
      "/favicon.ico",
    ])
  })
})
