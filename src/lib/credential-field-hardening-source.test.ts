import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

// Vitest runs in node here with no DOM, so the rekey and connect surfaces'
// credential-field wiring is pinned as a source contract the way onboarding's
// is (see onboarding-a11y-source.test.ts).
const connectionDrawer = readFileSync(
  resolve(process.cwd(), "src/components/dashboard/ConnectionDrawer.tsx"),
  "utf8"
)
const connectModal = readFileSync(
  resolve(process.cwd(), "src/components/connect/ConnectModal.tsx"),
  "utf8"
)
const toolsConnectionRow = readFileSync(
  resolve(process.cwd(), "src/components/tools/ConnectionRow.tsx"),
  "utf8"
)

describe("rekey and connect credential fields", () => {
  it("labels the dashboard rekey drawer's credential field instead of leaning on the placeholder", () => {
    expect(connectionDrawer).toContain(
      "<Label htmlFor={inputId}>{field.label}</Label>"
    )
    expect(connectionDrawer).toContain("id={inputId}")
    expect(connectionDrawer).toContain(
      "const inputId = `rekey-${credentialInputName(field)}`"
    )
    expect(connectionDrawer).toContain("placeholder={credentialPlaceholder(")
  })

  it("treats the dashboard rekey drawer's credential field as a secret rather than a login", () => {
    expect(connectionDrawer).toContain('autoComplete="off"')
    expect(connectionDrawer).toContain("data-1p-ignore")
    expect(connectionDrawer).toContain('data-lpignore="true"')
    expect(connectionDrawer).toContain('autoCapitalize="off"')
    expect(connectionDrawer).toContain('autoCorrect="off"')
    expect(connectionDrawer).toContain("spellCheck={false}")
  })

  it("treats the connect credential field as a secret rather than a login", () => {
    expect(connectModal).toContain('autoComplete="off"')
    expect(connectModal).toContain("data-1p-ignore")
    expect(connectModal).toContain('data-lpignore="true"')
    expect(connectModal).toContain('autoCapitalize="off"')
    expect(connectModal).toContain('autoCorrect="off"')
    expect(connectModal).toContain("spellCheck={false}")
  })

  it("labels the tools-page rekey form's credential field instead of leaning on the placeholder", () => {
    expect(toolsConnectionRow).toContain(
      '<Label htmlFor={inputId} className="text-xs">'
    )
    expect(toolsConnectionRow).toContain("id={inputId}")
    expect(toolsConnectionRow).toContain(
      "const inputId = `rekey-${connection.id}-${credentialInputName(field)}`"
    )
    expect(toolsConnectionRow).toContain("placeholder={credentialPlaceholder(")
  })

  it("treats the tools-page rekey form's credential field as a secret rather than a login", () => {
    expect(toolsConnectionRow).toContain('autoComplete="off"')
    expect(toolsConnectionRow).toContain("data-1p-ignore")
    expect(toolsConnectionRow).toContain('data-lpignore="true"')
    expect(toolsConnectionRow).toContain('autoCapitalize="off"')
    expect(toolsConnectionRow).toContain('autoCorrect="off"')
    expect(toolsConnectionRow).toContain("spellCheck={false}")
  })
})
