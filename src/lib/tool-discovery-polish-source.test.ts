import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const readSource = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8")

const toolGrid = readSource("src/components/connect/ToolGrid.tsx")

describe("tool discovery polish", () => {
  it("stabilizes changing connection counts", () => {
    expect(toolGrid).toMatch(/tabular-nums[^"\n]*[\s\S]*?connectedCount/)
  })

  it("uses concentric radii for the connect picker search surface", () => {
    expect(toolGrid).toContain("rounded-[calc(var(--radius)+0.75rem)]")
    expect(toolGrid).toContain("rounded-[var(--radius)]")
  })

  it("applies intentional wrapping to connect copy", () => {
    expect(toolGrid).toContain("text-pretty")
  })

  it("wraps crowded connect-card contents without shrinking tool logos", () => {
    expect(toolGrid).toContain("qc-connect-card__logo flex h-12 w-12 shrink-0")
    expect(toolGrid).toContain(
      "flex flex-wrap items-start justify-between gap-3"
    )
    expect(toolGrid).toContain("mt-auto flex w-full flex-wrap gap-2")
    expect(toolGrid).toContain('className="min-w-[5.5rem] flex-1"')
  })
})
