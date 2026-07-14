import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const toolGrid = readFileSync(
  resolve(process.cwd(), "src/components/connect/ToolGrid.tsx"),
  "utf8"
)
const connectModal = readFileSync(
  resolve(process.cwd(), "src/components/connect/ConnectModal.tsx"),
  "utf8"
)
const onboardingFlow = readFileSync(
  resolve(process.cwd(), "src/components/dashboard/OnboardingFlow.tsx"),
  "utf8"
)
const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8")

describe("connect flow polish", () => {
  it("keeps the tool picker warm, scannable, and mascot-free", () => {
    expect(toolGrid).toContain("qc-connect-shell")
    expect(toolGrid).toContain("qc-connect-card")
    expect(toolGrid).toContain("qc-connect-card__logo")
    expect(toolGrid).toContain("qc-connect-card__status")
    expect(toolGrid).toContain("read-only checks")
    expect(toolGrid).not.toContain("Canary")
  })

  it("makes the credential modal reassuring without delaying the check", () => {
    expect(connectModal).toContain("qc-connect-modal")
    expect(connectModal).toContain("qc-connect-key-panel")
    expect(connectModal).toContain("Read-only balance check")
    expect(connectModal).toContain("qc-connect-listening")
    expect(connectModal).toContain("Listening for balance")
  })

  it("gives onboarding balance checks the listening treatment", () => {
    expect(onboardingFlow).toContain("qc-onboarding-listening")
    expect(onboardingFlow).toContain('Canary mood="alert"')
    expect(onboardingFlow).toContain("Listening for balance")
    expect(onboardingFlow).not.toContain("Checking balance")
    expect(css).toContain("@keyframes qc-onboarding-listen")
  })

  it("covers connect micro-interactions in reduced motion", () => {
    expect(css).toContain(".qc-connect-card")
    expect(css).toContain("@keyframes qc-connect-listen")

    const reducedMotionBlock = css.slice(
      css.indexOf("@media (prefers-reduced-motion: reduce)")
    )

    expect(reducedMotionBlock).toContain(".qc-connect-card")
    expect(reducedMotionBlock).toContain(".qc-connect-card__logo")
    expect(reducedMotionBlock).toContain(".qc-connect-listening-dot")
    expect(reducedMotionBlock).toContain(".qc-onboarding-listening__bird")
  })
})
