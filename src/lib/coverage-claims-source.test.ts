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
  "src/components/auth/AuthBrandPanel.tsx",
  "src/components/dashboard/OnboardingFlow.tsx",
  "src/app/layout.tsx",
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
})
