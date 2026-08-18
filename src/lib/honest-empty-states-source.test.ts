import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

// QUO-13. Authenticated pages used to destructure only `data` from their
// Supabase reads and coalesce the rest away (`?? []`, `?? default`), so a
// failed query rendered a confident empty state: "no webhooks", "no tokens",
// and worst of all the alert inbox's "A quiet bird is good news." These
// assertions keep every read on the rule - destructure `error`, then either
// throw it (the query gates the whole page) or render a scoped, retryable
// QueryError (the query backs one section).
function source(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8")
}

// Every authenticated read, and how its failure must surface.
const SCOPED_ERROR_SECTIONS = [
  {
    path: "src/app/(dashboard)/connect/page.tsx",
    binding: "error: toolsError",
    what: "the tool catalog",
  },
  {
    path: "src/app/(dashboard)/connect/page.tsx",
    binding: "error: connectionsError",
    what: "the tool catalog",
  },
  {
    path: "src/app/(dashboard)/settings/page.tsx",
    binding: "error: profileError",
    what: "your email notification setting",
  },
  {
    path: "src/app/(dashboard)/settings/page.tsx",
    binding: "error: destinationsError",
    what: "your webhook destinations",
  },
  {
    path: "src/app/(dashboard)/settings/page.tsx",
    binding: "error: tokensError",
    what: "your API tokens",
  },
  {
    path: "src/app/(dashboard)/alerts/page.tsx",
    binding: "error: eventsError",
    what: "your alert inbox",
  },
]

// Reads that gate what the whole page renders have no honest scoped form.
const THROWING_READS = [
  {
    path: "src/app/(dashboard)/dashboard/page.tsx",
    throws: "if (profileError) throw profileError",
  },
  {
    path: "src/app/(dashboard)/dashboard/page.tsx",
    throws: "if (toolsError) throw toolsError",
  },
]

describe("honest query-error states", () => {
  for (const { path, binding, what } of SCOPED_ERROR_SECTIONS) {
    it(`${path} surfaces ${what} failures in a retryable panel`, () => {
      const text = source(path)
      expect(text).toContain(binding)
      expect(text).toContain(`<QueryError what="${what}" />`)
    })
  }

  for (const { path, throws } of THROWING_READS) {
    it(`${path} throws rather than coalescing: ${throws}`, () => {
      expect(source(path)).toContain(throws)
    })
  }

  it("the tool page keeps a broken lookup from masquerading as a 404", () => {
    const text = source("src/app/(dashboard)/tools/[toolId]/page.tsx")
    // PGRST116 is `.single()` finding no row, which is a genuine notFound().
    expect(text).toContain('toolError.code !== "PGRST116"')
    expect(text).toContain("throw toolError")
    expect(text).toContain("notFound()")
  })

  it("QueryError offers a retry that re-runs the server render", () => {
    const text = source("src/components/ui/query-error.tsx")
    expect(text).toContain('role="alert"')
    expect(text).toContain("router.refresh()")
    expect(text).toContain("Try again")
  })

  it("the dashboard group keeps its shell around a thrown query error", () => {
    const text = source("src/app/(dashboard)/error.tsx")
    expect(text).toContain('"use client"')
    expect(text).toContain("reset")
    expect(text).toContain("Try again")
  })
})

describe("honest zero-result states", () => {
  it("ToolGrid separates an empty catalog from a search that matched nothing", () => {
    const text = source("src/components/connect/ToolGrid.tsx")
    expect(text).toContain("filtered.length === 0")
    expect(text).toContain("tools.length === 0")
    expect(text).toContain("The tool catalog is empty")
    expect(text).toContain("No tools match")
  })

  it("ToolGrid offers a reset that clears the search box", () => {
    const text = source("src/components/connect/ToolGrid.tsx")
    expect(text).toContain("Clear search")
    expect(text).toContain('onClick={() => setQuery("")}')
  })

  it("DashboardClient separates a filtered-empty view from no readings yet", () => {
    const text = source("src/components/dashboard/DashboardClient.tsx")
    expect(text).toContain("visible.length === 0")
    expect(text).toContain("filtersActive")
    expect(text).toContain("No balances match these filters")
    expect(text).toContain("No balances to show yet")
  })

  it("DashboardClient's reset clears both the tag and the status filter", () => {
    const text = source("src/components/dashboard/DashboardClient.tsx")
    expect(text).toContain("Clear filters")
    expect(text).toContain('setActiveTag("All")')
    expect(text).toContain('setStatusFilter("all")')
  })
})
