import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

// QUO-20: the security model is a public self-host page, because people
// evaluate it BEFORE they have an account to log into. Vitest runs in node with
// no DOM here, so the page's placement and the links into it are pinned as a
// source contract (see credential-field-hardening-source.test.ts).
const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8")

const securityPage = read("src/app/(public)/security/page.tsx")
const footer = read("src/components/public/PublicFooter.tsx")

const CREDENTIAL_SURFACES = [
  "src/components/connect/ConnectModal.tsx",
  "src/components/dashboard/OnboardingFlow.tsx",
  "src/components/dashboard/ConnectionDrawer.tsx",
  "src/components/tools/ConnectionRow.tsx",
]

describe("public security page", () => {
  it("lives in the (public) route group, not behind the dashboard's auth gate", () => {
    expect(
      existsSync(resolve(process.cwd(), "src/app/(public)/security/page.tsx"))
    ).toBe(true)
    expect(
      existsSync(
        resolve(process.cwd(), "src/app/(dashboard)/security/page.tsx")
      )
    ).toBe(false)
  })

  it("is reachable from the public footer", () => {
    expect(footer).toContain('{ label: "Security", href: "/security" }')
  })

  it("covers the claims the page is supposed to answer", () => {
    for (const claim of [
      "AES-256-GCM",
      "never stored",
      "row-level security",
      "read-only",
      "The honest limit",
      "How long we keep things",
      "Deleting things",
      "Reporting a vulnerability",
    ]) {
      expect(securityPage).toContain(claim)
    }
  })

  it("keeps the retention numbers in step with prune_balances (90 days, newest 50)", () => {
    const prune = read("supabase/migrations/038_prune_balances.sql")
    expect(prune).toContain("retention_days integer default 90")
    expect(prune).toContain("keep_per_pool integer default 50")
    expect(securityPage).toContain("pruned after 90 days")
    expect(securityPage).toContain("most recent 50 readings")
  })

  it("does not claim the smallest possible scope every time", () => {
    // Many vendors only issue one all-or-nothing key, so the old FAQ line
    // ("Read-only on the smallest possible scope, every time") overclaimed.
    expect(securityPage).not.toContain("smallest possible scope")
  })
})

describe("security link at every credential entry point", () => {
  for (const surface of CREDENTIAL_SURFACES) {
    it(`${surface} links out to the security page`, () => {
      const source = read(surface)
      expect(source).toContain('href="/security"')
      expect(source).toContain("How we handle your key")
    })
  }
})
