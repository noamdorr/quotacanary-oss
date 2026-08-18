import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const dashboardPage = readFileSync(
  resolve(process.cwd(), "src/app/(dashboard)/dashboard/page.tsx"),
  "utf8"
)

const dashboardLayout = readFileSync(
  resolve(process.cwd(), "src/app/(dashboard)/layout.tsx"),
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

const dashboardClient = readFileSync(
  resolve(process.cwd(), "src/components/dashboard/DashboardClient.tsx"),
  "utf8"
)

const viewControls = readFileSync(
  resolve(process.cwd(), "src/components/dashboard/ViewControls.tsx"),
  "utf8"
)

const compactGutterRoutes = [
  "src/app/(dashboard)/dashboard/page.tsx",
  "src/app/(dashboard)/connect/page.tsx",
  "src/app/(dashboard)/alerts/page.tsx",
  "src/app/(dashboard)/settings/page.tsx",
  "src/app/(dashboard)/tools/[toolId]/page.tsx",
  "src/app/(dashboard)/loading.tsx",
  "src/app/(dashboard)/error.tsx",
]

describe("dashboard layout source", () => {
  it("uses a wide dashboard canvas for data-heavy rows", () => {
    expect(dashboardPage).toContain("max-w-[1520px]")
  })

  it("contains wide dashboard content inside the app shell", () => {
    expect(dashboardLayout).toContain("min-w-0 flex-1")
    expect(dashboardPage).toContain("min-w-0")
  })

  it("keeps the data columns readable without forcing page-level overflow", () => {
    expect(connectionRow).toContain("minmax(180px,1.15fr)")
    expect(connectionRow).toContain("minmax(120px,0.75fr)")
    expect(connectionRow).toContain("minmax(160px,0.9fr)")
    expect(connectionRow).toContain("112px")
  })

  it("keeps horizontal clipping inside the table at intermediate widths", () => {
    expect(connectionsTable).toContain("overflow-x-auto")
    expect(connectionsTable).toContain("min-w-[900px]")
  })

  it("uses cards until the complete table and its view switcher fit", () => {
    expect(dashboardClient).toContain("hidden xl:block")
    expect(dashboardClient).toContain("xl:hidden")
    expect(viewControls).toContain("xl:flex")
  })

  it("keeps sorting actionable when tablet layouts fall back to cards", () => {
    expect(viewControls).toContain('aria-label="Sort by"')
    expect(viewControls).toContain("xl:hidden")
    expect(viewControls).toContain("onSort(sortKey)")
    expect(dashboardClient).toContain("sortKey={sortKey}")
    expect(dashboardClient).toContain("sortDir={sortDir}")
    expect(dashboardClient).toContain("onSort={toggleSort}")
  })

  it.each(compactGutterRoutes)(
    "%s keeps compact mobile gutters and the established wider breakpoint",
    (path) => {
      const source = readFileSync(resolve(process.cwd(), path), "utf8")
      expect(source).toContain("p-4 sm:p-8")
    }
  )

  it("keeps the authenticated header compact on mobile", () => {
    expect(dashboardLayout).toContain("px-4 sm:px-6")
  })

  it("keeps highlighted table rows rounded inside the table shell", () => {
    expect(connectionRow).toContain("before:inset-1")
    expect(connectionRow).toContain("before:rounded-lg")
    expect(connectionRow).not.toContain("ring-2 ring-inset")
  })
})
