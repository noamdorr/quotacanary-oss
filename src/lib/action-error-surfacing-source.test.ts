import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

// The 2026-07-05 audit flagged silent action failures: several components
// fired server actions and dropped the result, so RLS/validation errors were
// invisible. These wiring assertions keep every mutation caller on the
// runClientAction + rendered-error pattern (ConnectionDrawer is the model).
function componentSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8")
}

const ERROR_SURFACING_COMPONENTS = [
  "src/components/settings/AlertDestinations.tsx",
  "src/components/settings/NotificationPrefs.tsx",
  "src/components/alerts/AlertRow.tsx",
  "src/components/alerts/MarkReadButton.tsx",
  "src/components/tools/ConnectionRow.tsx",
]

describe("action error surfacing", () => {
  for (const path of ERROR_SURFACING_COMPONENTS) {
    it(`${path} runs actions through runClientAction and renders failures`, () => {
      const source = componentSource(path)
      expect(source).toContain("runClientAction")
      expect(source).toContain('role="alert"')
    })
  }

  it("AlertEventList delegates mark-read to the client button that renders errors", () => {
    const source = componentSource("src/components/alerts/AlertEventList.tsx")
    expect(source).toContain("MarkReadButton")
    expect(source).not.toContain("markAlertEventRead")
  })

  it("AlertDestinations confirms before removing a destination", () => {
    const source = componentSource(
      "src/components/settings/AlertDestinations.tsx"
    )
    expect(source).toContain("confirmRemove")
    expect(source).toContain("This can't be undone.")
  })
})
