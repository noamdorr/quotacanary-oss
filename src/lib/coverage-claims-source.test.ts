import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

// QUO-22: the marketing copy promised to watch anything billed by the credit,
// while the catalog is a finite adapter list and the FAQ already admitted to
// unsupported tools. These are the exact retired phrasings - this pins them so
// they cannot creep back. It catches repeats, not new inventions; the human
// pass lives in docs/copy-claims-checklist.md.
const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8")

// Every surface that makes a coverage claim, per the QUO-22 audit.
const COPY_SURFACES = [
  "src/components/marketing/SupportedTools.tsx",
  "src/components/marketing/copy.ts",
  "src/components/marketing/Faq.tsx",
  "src/components/marketing/FounderNote.tsx",
  "src/components/marketing/MacSection.tsx",
  "src/app/(marketing)/mac/page.tsx",
  "src/components/marketing/ToolsDirectory.tsx",
  "src/components/auth/AuthBrandPanel.tsx",
  "src/components/dashboard/OnboardingFlow.tsx",
  "src/app/layout.tsx",
  "src/app/(marketing)/page.tsx",
  "README.md",
]

const RETIRED_CLAIMS = [
  "If a tool bills you by the credit, the canary is watching it",
  "every tool that bills you by the credit",
  "whole API stack",
  "every balance you're burning through",
  "Every balance in your stack",
  "Watch every credit balance in your stack",
  "every credit balance in your outreach stack",
  "one page that watches\n          every balance",
]

describe("coverage claims", () => {
  for (const surface of COPY_SURFACES) {
    it(`${surface} makes no retired universal coverage claim`, () => {
      const source = read(surface)
      for (const claim of RETIRED_CLAIMS) {
        expect(source).not.toContain(claim)
      }
    })
  }

  it("tells an unsupported-tool visitor what to do next, on every public surface that lists tools", () => {
    for (const surface of [
      "src/components/marketing/SupportedTools.tsx",
      "src/components/marketing/ToolsDirectory.tsx",
      "src/components/marketing/Faq.tsx",
    ]) {
      expect(read(surface)).toContain("mailto:hey@quotacanary.com")
    }
  })

  it("points the homepage at the directory as the bounded list", () => {
    expect(read("src/components/marketing/SupportedTools.tsx")).toContain(
      "/directory"
    )
  })
})
