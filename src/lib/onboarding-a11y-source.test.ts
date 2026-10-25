import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

// Vitest runs in node here with no DOM, so the onboarding panel's accessibility
// wiring is pinned as a source contract the way the connect flow's is. The
// rendered behavior is verified in a browser at mobile and desktop widths.
const onboardingFlow = readFileSync(
  resolve(process.cwd(), "src/components/dashboard/OnboardingFlow.tsx"),
  "utf8"
)
const dashboardPage = readFileSync(
  resolve(process.cwd(), "src/app/(dashboard)/dashboard/page.tsx"),
  "utf8"
)

describe("onboarding credential accessibility", () => {
  // The credential fields' own wiring lives in CredentialFields and is tested
  // there (src/components/connect/CredentialFields.test.ts).
  it("announces the form-level failure from the server action", () => {
    expect(onboardingFlow).toContain('<p role="alert" className="mb-4')
  })

  it("keeps the step indicator and the actions inside a narrow viewport", () => {
    expect(onboardingFlow).toContain(
      '<ol className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1">'
    )
    expect(onboardingFlow).toContain(
      'aria-current={i === idx ? "step" : undefined}'
    )
    // Connector rules are decoration; they sit out the narrow widths.
    expect(onboardingFlow).toContain(
      'className="hidden h-px w-5 bg-border sm:block"'
    )
    expect(onboardingFlow).toContain(
      'className="rounded-xl border border-border bg-card p-5 sm:p-8"'
    )
    expect(dashboardPage).toContain(
      '<main className="min-w-0 flex-1 p-4 sm:p-8">'
    )

    // Every primary action sits in a wrapping row, so the secondary text
    // button drops below it instead of overflowing. One per step.
    const actionRows = onboardingFlow.match(
      /flex flex-wrap items-center gap-x-4 gap-y-3/g
    )
    expect(actionRows).toHaveLength(3)
    expect(onboardingFlow).not.toContain('className="ml-3 text-sm')
  })

  it("keeps focus visible on the controls that are not shared primitives", () => {
    const secondaryActions = onboardingFlow.match(
      /rounded text-sm text-muted-foreground underline outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring\/50/g
    )
    expect(secondaryActions).toHaveLength(3)
    // The tool picker is a custom toggle: focusable ring plus pressed state.
    expect(onboardingFlow).toContain(
      "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    )
    expect(onboardingFlow).toContain("aria-pressed={selected?.id === t.id}")
  })
})
