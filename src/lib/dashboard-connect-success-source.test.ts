import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const modalSource = readFileSync(
  resolve(process.cwd(), "src/components/connect/ConnectModal.tsx"),
  "utf8"
)

const dashboardPageSource = readFileSync(
  resolve(process.cwd(), "src/app/(dashboard)/dashboard/page.tsx"),
  "utf8"
)

const successCardSource = readFileSync(
  resolve(process.cwd(), "src/components/dashboard/ConnectionSuccessCard.tsx"),
  "utf8"
)

const dashboardClientSource = readFileSync(
  resolve(process.cwd(), "src/components/dashboard/DashboardClient.tsx"),
  "utf8"
)

const onboardingSource = readFileSync(
  resolve(process.cwd(), "src/components/dashboard/OnboardingFlow.tsx"),
  "utf8"
)

const confettiSource = readFileSync(
  resolve(process.cwd(), "src/components/dashboard/FirstToolConfetti.tsx"),
  "utf8"
)

const cssSource = readFileSync(
  resolve(process.cwd(), "src/app/globals.css"),
  "utf8"
)

describe("post-connect dashboard confirmation flow", () => {
  it("keeps the new connection id when redirecting from connect to dashboard", () => {
    expect(modalSource).toContain("result.connectionId")
    expect(modalSource).toContain("connected=")
  })

  it("passes the connected query param into the dashboard client", () => {
    expect(dashboardPageSource).toContain("searchParams")
    expect(dashboardPageSource).toContain("recentConnectionId")
  })

  it("renders the post-connect confirmation as a soft green success block", () => {
    expect(successCardSource).toContain("bg-[var(--healthy-bg)]")
    expect(successCardSource).toContain("text-[var(--healthy-text)]")
    expect(successCardSource).not.toContain("No list-hunting required")
    expect(successCardSource).not.toContain("View row")
  })

  it("celebrates only the first connected tool", () => {
    expect(dashboardClientSource).toContain(
      "celebrate={connections.length === 1}"
    )
    expect(onboardingSource).toContain("<FirstToolConfetti />")
    expect(confettiSource).toContain("qc-confetti-piece")
    expect(cssSource).toContain("@keyframes qc-confetti-fall")
  })
})
