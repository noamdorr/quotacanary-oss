import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const source = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8")

describe("shared app logo", () => {
  // QUO-171: every lockup leads with the approved Q/canary mark, and the
  // footer no longer borrows the mood illustration as its logo.
  it.each([
    "src/components/public/PublicNav.tsx",
    "src/app/(dashboard)/layout.tsx",
    "src/components/auth/MagicLinkForm.tsx",
    "src/components/public/PublicFooter.tsx",
  ])("%s uses the shared logo mark", (path) => {
    const file = source(path)
    expect(file).toContain("<LogoMark")
    expect(file).not.toContain("@/components/brand/Canary")
  })

  it("keeps the mark geometry identical to the exported favicon tile", () => {
    const tile = source("public/favicon.svg")
    const d = tile.match(/ d="([^"]+)"/)?.[1]
    expect(d).toBeTruthy()
    expect(source("src/components/brand/LogoMark.tsx")).toContain(`"${d}"`)
  })
})
