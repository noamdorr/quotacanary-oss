import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  resolve(process.cwd(), "src/components/marketing/BurnRateDemo.tsx"),
  "utf8"
)

describe("marketing burn rate demo", () => {
  it("does not render title copy above the tool rows", () => {
    expect(source).not.toContain("What dies first?")
  })
})
