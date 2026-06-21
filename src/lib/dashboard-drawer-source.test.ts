import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  resolve(process.cwd(), "src/components/dashboard/ConnectionDrawer.tsx"),
  "utf8"
)

describe("dashboard connection drawer", () => {
  it("surfaces management actions and connection errors", () => {
    expect(source).toContain("removeConnection")
    expect(source).toContain("updateKey")
    expect(source).toContain("last_error")
    expect(source).toContain("Update key")
    expect(source).toContain("Remove connection")
  })

  it("reports manual refresh failures instead of swallowing them", () => {
    expect(source).toContain("refreshConnection(c.id)")
    expect(source).toContain("setError(res.error)")
  })

  it("handles thrown server action failures from connection management", () => {
    expect(source).toContain("runClientAction")
    expect(source).toContain("removeConnection(c.id)")
  })
})
