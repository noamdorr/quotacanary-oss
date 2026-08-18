import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const readSource = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8")

const directory = readSource("src/components/marketing/ToolsDirectory.tsx")
const directoryDetail = readSource(
  "src/app/(marketing)/directory/[id]/page.tsx"
)
const toolGrid = readSource("src/components/connect/ToolGrid.tsx")

describe("tool discovery polish", () => {
  it("gives directory tiles and filters explicit pointer and keyboard states", () => {
    expect(directory).toContain("aria-pressed={active}")
    expect(directory).toMatch(/hover:[^"\s]+/)
    expect(directory).toMatch(/focus-visible:ring-3/)
    expect(directory).toMatch(/active:scale-\[0\.96\]/)
    expect(directory).toMatch(/motion-reduce:active:scale-100/)
  })

  it("stabilizes changing directory and connection counts", () => {
    expect(directory).toMatch(/className="f-mono tabular-nums"/)
    expect(toolGrid).toMatch(/tabular-nums[^"\n]*[\s\S]*?connectedCount/)
  })

  it("uses concentric radii for the connect picker search surface", () => {
    expect(toolGrid).toContain("rounded-[calc(var(--radius)+0.75rem)]")
    expect(toolGrid).toContain("rounded-[var(--radius)]")
  })

  it("applies intentional wrapping to directory and connect copy", () => {
    expect(directory).toContain('className="f-display text-balance"')
    expect(directory).toContain('className="text-pretty"')
    expect(directoryDetail).toContain("text-balance")
    expect(directoryDetail).toContain("text-pretty")
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
