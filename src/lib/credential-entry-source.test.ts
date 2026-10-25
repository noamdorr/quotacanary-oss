import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

// The rendered behavior of credential fields (labels, identifiers, help and
// error wiring, secret-input protections) is tested in
// src/components/connect/CredentialFields.test.ts. This pins only that every
// form taking a vendor key goes through that module instead of rebuilding it.
const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8")

const forms = {
  onboarding: read("src/components/dashboard/OnboardingFlow.tsx"),
  connect: read("src/components/connect/ConnectModal.tsx"),
  drawerRekey: read("src/components/dashboard/ConnectionDrawer.tsx"),
  toolsRekey: read("src/components/tools/ConnectionRow.tsx"),
}

describe("credential entry", () => {
  it.each(Object.entries(forms))(
    "%s renders its credential fields through CredentialFields",
    (_, source) => {
      expect(source).toContain("<CredentialFields")
      expect(source).not.toContain("data-1p-ignore")
      expect(source).not.toContain("credentialInputName(")
    }
  )

  it("validates onboarding fields on blur and hangs the key help off them", () => {
    expect(forms.onboarding).toContain("validateOnBlur")
    expect(forms.onboarding).toContain(
      "helpId={selectedRequirement ? KEY_HELP_ID : undefined}"
    )
    expect(forms.onboarding).toContain("id={KEY_HELP_ID}")
  })
})
