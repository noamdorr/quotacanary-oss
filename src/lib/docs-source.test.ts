import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  resolve(process.cwd(), "src/app/(public)/docs/page.tsx"),
  "utf8"
)

describe("public docs", () => {
  it("uses request headers to resolve the self-host origin at render time", () => {
    expect(source).toContain("await headers()")
    expect(source).toContain("resolveAppOrigin(")
    expect(source).not.toContain("const appUrl = APP_URL")
  })

  it("points token links at Settings integrations", () => {
    expect(source).toContain("/settings#integrations")
    expect(source).not.toContain("/developer")
  })

  it("does not claim the Mac app moves connections to a hosted account", () => {
    expect(source).not.toContain("Move to")
    expect(source).not.toContain("hosted poller")
    expect(source).not.toContain("the Mac app asks for")
  })

  it("documents the webhooks integration", () => {
    expect(source).toContain('"#webhooks"')
    expect(source).toContain('id="webhooks"')
    expect(source).toContain("quota.alert.")
    // QUO-289: the "stopped checking" event is part of the contract too.
    expect(source).toContain("quota.alert.stopped")
  })

  it("documents the signature contract rather than the retired no-signature note", () => {
    expect(source).toContain("quotacanary-signature")
    expect(source).toContain("HMAC-SHA256")
    expect(source).toContain("timingSafeEqual")
    // The old contract told readers the URL was the only secret. Shipping that
    // sentence alongside a signed delivery is worse than either alone.
    expect(source).not.toContain("There is no signature header")
  })

  it("documents replay protection and the rotation path", () => {
    expect(source).toContain("Replay protection")
    expect(source).toContain("Rotating a secret")
    expect(source).toContain("idempotency-key")
    // The tolerance the sender actually stamps against; see lib/alerts/signing.
    expect(source).toContain("300")
  })
})
