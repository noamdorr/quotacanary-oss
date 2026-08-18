import { describe, expect, it } from "vitest"

import {
  connectIntentPath,
  magicLinkRedirectUrl,
  sanitizeToolId,
} from "@/lib/tool-intent"

describe("sanitizeToolId", () => {
  it("accepts the slug shapes real catalog ids use", () => {
    expect(sanitizeToolId("neverbounce")).toBe("neverbounce")
    expect(sanitizeToolId("million-verifier")).toBe("million-verifier")
    expect(sanitizeToolId("email_hippo")).toBe("email_hippo")
    expect(sanitizeToolId("logo.dev")).toBe("logo.dev")
  })

  it("rejects anything that is not a bare slug", () => {
    // These are the shapes that would let a crafted `tool` param widen the
    // redirect we build from it: a second query param, a path escape, a
    // scheme, or whitespace padding.
    expect(sanitizeToolId("neverbounce&next=/evil")).toBeNull()
    expect(sanitizeToolId("../../admin")).toBeNull()
    expect(sanitizeToolId("//evil.com")).toBeNull()
    expect(sanitizeToolId("https://evil.com")).toBeNull()
    expect(sanitizeToolId("never bounce")).toBeNull()
    expect(sanitizeToolId("Neverbounce")).toBeNull()
    expect(sanitizeToolId("-leading")).toBeNull()
    expect(sanitizeToolId("a".repeat(65))).toBeNull()
  })

  it("treats absent, empty, and non-string input as no intent", () => {
    expect(sanitizeToolId(undefined)).toBeNull()
    expect(sanitizeToolId(null)).toBeNull()
    expect(sanitizeToolId("")).toBeNull()
    expect(sanitizeToolId(42)).toBeNull()
    expect(sanitizeToolId(new File([], "x"))).toBeNull()
  })
})

describe("connectIntentPath", () => {
  it("points at the connect page carrying the tool id", () => {
    expect(connectIntentPath("neverbounce")).toBe("/connect?tool=neverbounce")
  })

  it("stays a relative in-app path so /auth/confirm's guard accepts it", () => {
    const path = connectIntentPath("neverbounce")
    expect(path.startsWith("/")).toBe(true)
    expect(path.startsWith("//")).toBe(false)
    expect(path.startsWith("/\\")).toBe(false)
  })
})

describe("magicLinkRedirectUrl", () => {
  const site = "https://app.quotacanary.com"

  it("carries a valid tool id through as an encoded next param", () => {
    const url = magicLinkRedirectUrl(site, "neverbounce")

    expect(url).toBe(
      "https://app.quotacanary.com/auth/confirm?next=%2Fconnect%3Ftool%3Dneverbounce"
    )
    // The nested query must survive as one opaque value, or /auth/confirm
    // reads `tool` as its own param and drops it from the redirect.
    expect(new URL(url).searchParams.get("next")).toBe(
      "/connect?tool=neverbounce"
    )
  })

  it("falls back to the bare confirm URL when there is no intent", () => {
    expect(magicLinkRedirectUrl(site, null)).toBe(
      "https://app.quotacanary.com/auth/confirm"
    )
  })

  it("falls back to the bare confirm URL when the tool id is not a slug", () => {
    expect(magicLinkRedirectUrl(site, "neverbounce&next=/evil")).toBe(
      "https://app.quotacanary.com/auth/confirm"
    )
  })

  it("tolerates a site url with a trailing slash", () => {
    expect(magicLinkRedirectUrl(`${site}/`, null)).toBe(
      "https://app.quotacanary.com/auth/confirm"
    )
  })
})
