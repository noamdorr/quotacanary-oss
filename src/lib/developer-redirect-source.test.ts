import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  resolve(process.cwd(), "src/app/(dashboard)/developer/page.tsx"),
  "utf8"
)

describe("developer route", () => {
  it("redirects to the Settings integrations section", () => {
    expect(source).toContain('redirect("/settings#integrations")')
  })

  it("no longer queries api_tokens directly", () => {
    expect(source).not.toContain("api_tokens")
  })
})
