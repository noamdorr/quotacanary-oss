import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const dashboardPage = readFileSync(
  resolve(process.cwd(), "src/app/(dashboard)/dashboard/page.tsx"),
  "utf8"
)

const connectionRow = readFileSync(
  resolve(process.cwd(), "src/components/dashboard/ConnectionRow.tsx"),
  "utf8"
)

const connectionsTable = readFileSync(
  resolve(process.cwd(), "src/components/dashboard/ConnectionsTable.tsx"),
  "utf8"
)

describe("dashboard layout source", () => {
  it("uses a wide dashboard canvas for data-heavy rows", () => {
    expect(dashboardPage).toContain("max-w-[1520px]")
  })

  it("gives trend, balance, and updated table columns explicit breathing room", () => {
    expect(connectionRow).toContain("minmax(220px,1.05fr)")
    expect(connectionRow).toContain("minmax(170px,0.75fr)")
    expect(connectionRow).toContain("minmax(190px,0.85fr)")
    expect(connectionRow).toContain("140px")
  })

  it("allows the desktop table to keep its roomy grid before horizontal clipping", () => {
    expect(connectionsTable).toContain("overflow-x-auto")
    expect(connectionsTable).toContain("min-w-[1120px]")
  })

  it("keeps highlighted table rows rounded inside the table shell", () => {
    expect(connectionRow).toContain("before:inset-1")
    expect(connectionRow).toContain("before:rounded-lg")
    expect(connectionRow).not.toContain("ring-2 ring-inset")
  })
})
