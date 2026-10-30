import { MARKETING_URL, resolveAppOrigin } from "@/lib/site-links"
import { describe, expect, it } from "vitest"

describe("site links", () => {
  it("keeps policy links on the external marketing origin", () => {
    expect(MARKETING_URL).toBe(
      process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://quotacanary.com"
    )
  })

  it("uses the custom request origin when neither URL is configured", () => {
    expect(
      resolveAppOrigin({
        forwardedHost: "canary.example.com",
        host: "internal.local:8080",
        forwardedProto: "https",
      })
    ).toBe("https://canary.example.com")
  })

  it("prefers configured app then site origin over the request", () => {
    const request = {
      forwardedHost: "canary.example.com",
      forwardedProto: "https",
    }
    expect(
      resolveAppOrigin({
        ...request,
        appUrl: "https://app.example.net/",
        siteUrl: "https://site.example.net",
      })
    ).toBe("https://app.example.net")
    expect(
      resolveAppOrigin({ ...request, siteUrl: "https://site.example.net/" })
    ).toBe("https://site.example.net")
  })

  it("uses HTTP for a local request without a forwarded protocol", () => {
    expect(resolveAppOrigin({ host: "localhost:3000" })).toBe(
      "http://localhost:3000"
    )
  })
})
