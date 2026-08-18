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
  it("labels every credential field instead of leaning on the placeholder", () => {
    expect(onboardingFlow).toContain(
      "<Label htmlFor={inputId}>{field.label}</Label>"
    )
    expect(onboardingFlow).toContain("id={inputId}")
    expect(onboardingFlow).toContain(
      "const inputId = `onboarding-${credentialInputName(field)}`"
    )
    // The placeholder survives as an example, but it is no longer the only
    // thing naming the field.
    expect(onboardingFlow).toContain("placeholder={credentialPlaceholder(")
  })

  it("hangs the key help text off every field programmatically", () => {
    expect(onboardingFlow).toContain(
      'const KEY_HELP_ID = "onboarding-key-help"'
    )
    expect(onboardingFlow).toContain("id={KEY_HELP_ID}")
    expect(onboardingFlow).toContain("aria-describedby={")
    expect(onboardingFlow).toContain(
      "selected.key_instructions ? KEY_HELP_ID : null"
    )
  })

  it("reports a missing credential on the field, once it has been touched", () => {
    expect(onboardingFlow).toContain("const errorId = `${inputId}-error`")
    expect(onboardingFlow).toContain("touched.includes(field.name)")
    expect(onboardingFlow).toContain("aria-invalid={missing || undefined}")
    expect(onboardingFlow).toContain("missing ? errorId : null")
    expect(onboardingFlow).toContain("{field.label} is required.")
    // The form-level failure from the server action announces itself too.
    expect(onboardingFlow).toContain('<p role="alert" className="mb-4')
  })

  it("treats credentials as secrets rather than logins", () => {
    expect(onboardingFlow).toContain('autoComplete="off"')
    expect(onboardingFlow).toContain("data-1p-ignore")
    expect(onboardingFlow).toContain('data-lpignore="true"')
    expect(onboardingFlow).toContain('autoCapitalize="off"')
    expect(onboardingFlow).toContain('autoCorrect="off"')
    expect(onboardingFlow).toContain("spellCheck={false}")
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
