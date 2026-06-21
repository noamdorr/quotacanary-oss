import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  resolve(process.cwd(), "src/lib/actions/api-tokens.ts"),
  "utf8"
)

describe("api token actions", () => {
  it("revalidates the Settings page where the token UI now lives", () => {
    expect(source).toContain('revalidatePath("/settings")')
    expect(source).not.toContain('revalidatePath("/developer")')
  })
})
