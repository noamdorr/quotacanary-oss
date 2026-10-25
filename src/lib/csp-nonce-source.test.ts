import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8")

// The nonce only works if every link in the chain holds: the proxy sets the
// same value on the request (for Next's own inline scripts) and the response
// (for the browser), the root layout reads it per request, and every
// first-party <script> we render carries it. Pin the wiring; the unit test in
// security-headers.test.ts covers the policy text itself.
describe("CSP nonce wiring", () => {
  const proxy = read("src/proxy.ts")
  const layout = read("src/app/layout.tsx")
  const plausible = read("src/components/analytics/PlausibleAnalytics.tsx")
  const toolPage = read("src/app/(marketing)/directory/[id]/page.tsx")

  it("the proxy mints the nonce and sets the policy on both request and response", () => {
    expect(proxy).toContain("createNonce()")
    expect(proxy).toContain(
      'request.headers.set("content-security-policy", csp)'
    )
    expect(proxy).toContain("request.headers.set(NONCE_HEADER, nonce)")
    expect(proxy).toContain(
      'response.headers.set("Content-Security-Policy", csp)'
    )
  })

  it("the document policy has one source of truth: next.config only carries the fixed asset policy", () => {
    const config = read("next.config.ts")
    const cspHeaders = config.match(/key: "Content-Security-Policy",[^}]*}/g)

    expect(cspHeaders?.length).toBeGreaterThan(0)
    for (const header of cspHeaders ?? []) {
      expect(header).toContain("value: ASSET_CSP")
    }
    expect(proxy).toContain("buildContentSecurityPolicy")
  })

  it("the root layout reads the nonce per request and hands it to Plausible", () => {
    expect(layout).toContain('from "next/headers"')
    expect(layout).toContain("(await headers()).get(NONCE_HEADER)")
    expect(layout).toContain("<PlausibleAnalytics nonce={nonce} />")
  })

  it("both Plausible script tags carry the nonce", () => {
    expect(plausible.match(/nonce=\{nonce\}/g)).toHaveLength(2)
  })

  it("the directory JSON-LD carries the nonce", () => {
    expect(toolPage).toContain(
      '<script type="application/ld+json" nonce={nonce}>'
    )
  })

  it("the directory pages no longer claim a prerender the nonce rules out", () => {
    expect(toolPage).not.toContain("generateStaticParams")
    expect(toolPage).not.toContain("export const revalidate")
    expect(read("src/app/(marketing)/directory/page.tsx")).not.toContain(
      "export const revalidate"
    )
    // The hourly freshness moved to the data layer instead.
    expect(read("src/lib/db/tools.ts")).toContain("unstable_cache")
  })
})
