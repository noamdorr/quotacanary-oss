import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8")
}

describe("settings state icons", () => {
  it("keeps copy and confirmation icons mounted with a static label cue", () => {
    const copyButton = source("src/components/settings/CopyButton.tsx")

    expect(copyButton).toContain("qc-state-icon")
    expect(copyButton).toContain("data-visible={!copied}")
    expect(copyButton).toContain("data-visible={copied}")
    expect(copyButton).toContain('{copied ? "Copied" : "Copy"}')
  })

  it("keeps destination enabled-state icons mounted with static state cues", () => {
    const destinations = source("src/components/settings/AlertDestinations.tsx")

    expect(destinations).toContain("qc-state-icon")
    expect(destinations).toContain("data-visible={!destination.is_enabled}")
    expect(destinations).toContain("data-visible={destination.is_enabled}")
    expect(destinations).toContain(
      'aria-label={destination.is_enabled ? "Disable" : "Enable"}'
    )
  })
})
