import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  resolve(process.cwd(), "src/app/(marketing)/docs/page.tsx"),
  "utf8"
)

describe("public docs", () => {
  it("points token links at Settings integrations", () => {
    expect(source).toContain("/settings#integrations")
    expect(source).not.toContain("/developer")
  })

  it("documents the webhooks integration", () => {
    expect(source).toContain('"#webhooks"')
    expect(source).toContain('id="webhooks"')
    expect(source).toContain("quota.alert.")
  })
})
