import { describe, expect, it } from "vitest"
import nextConfig from "../../next.config"

async function contentSecurityPolicy() {
  const routes = (await nextConfig.headers?.()) ?? []
  return (
    routes
      .flatMap((route) => route.headers)
      .find((header) => header.key === "Content-Security-Policy")?.value ?? ""
  )
}

describe("Content-Security-Policy", () => {
  it("restricts script execution to first-party code", async () => {
    expect(await contentSecurityPolicy()).toContain("script-src 'self'")
  })

  it("keeps the cheap injection-vector directives", async () => {
    const csp = await contentSecurityPolicy()

    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
  })
})
