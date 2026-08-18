import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

// The funnel events fire from JSX success paths, and this suite runs in node
// with no DOM, so the wiring is asserted against source the same way the tool
// intent flow is (tool-intent-source.test.ts). QUO-15.
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8")

const magicLinkForm = read("src/components/auth/MagicLinkForm.tsx")
const onboardingFlow = read("src/components/dashboard/OnboardingFlow.tsx")
const connectModal = read("src/components/connect/ConnectModal.tsx")
const requestToolDialog = read("src/components/connect/RequestToolDialog.tsx")
const alertDestinations = read("src/components/settings/AlertDestinations.tsx")

describe("acquisition funnel events fire at the right moments", () => {
  it("counts a signup start when the magic link actually sends", () => {
    expect(magicLinkForm).toContain(
      "trackPlausibleEvent(FUNNEL_EVENTS.SIGNUP_STARTED)"
    )
    // After the error return, so a rate-limited or failed send never counts.
    expect(magicLinkForm.indexOf("SIGNUP_STARTED")).toBeGreaterThan(
      magicLinkForm.indexOf("if (result?.error)")
    )
  })

  it("counts signup completion and the onboarding steps", () => {
    expect(onboardingFlow).toContain(
      "trackPlausibleEvent(FUNNEL_EVENTS.SIGNUP_COMPLETED)"
    )
    expect(onboardingFlow).toContain(
      "trackPlausibleEvent(FUNNEL_EVENTS.ONBOARDING_STARTED)"
    )
    expect(onboardingFlow).toContain(
      "trackPlausibleEvent(FUNNEL_EVENTS.ONBOARDING_COMPLETED)"
    )
  })

  it("counts a connection plus the activation moment in onboarding", () => {
    expect(onboardingFlow).toContain(
      "trackPlausibleEvent(FUNNEL_EVENTS.CONNECTION_CREATED, { tool: tool.id })"
    )
    expect(onboardingFlow).toContain(
      "trackPlausibleEvent(FUNNEL_EVENTS.FIRST_BALANCE)"
    )
  })

  it("counts a connection from the /connect modal too", () => {
    expect(connectModal).toContain(
      "trackPlausibleEvent(FUNNEL_EVENTS.CONNECTION_CREATED"
    )
  })

  it("instruments the existing tool-request path instead of replacing it", () => {
    // The DB write in requestTool() stays the capture of record; the event is
    // additive and carries no props (the tool name is free text).
    expect(requestToolDialog).toContain(
      "trackPlausibleEvent(FUNNEL_EVENTS.TOOL_REQUESTED)"
    )
    expect(requestToolDialog).not.toContain("TOOL_REQUESTED, {")
  })

  it("counts alert destination creation only on success", () => {
    expect(alertDestinations).toContain(
      "trackPlausibleEvent(FUNNEL_EVENTS.ALERT_DESTINATION_CREATED)"
    )
    expect(alertDestinations).toContain("if (result.ok)")
  })

  it("keeps secrets and emails out of event properties", () => {
    // The only prop anywhere in the funnel is the catalog tool id.
    for (const source of [
      magicLinkForm,
      onboardingFlow,
      connectModal,
      requestToolDialog,
      alertDestinations,
    ]) {
      const calls = source.match(/trackPlausibleEvent\([^)]*\{[^}]*\}/g) ?? []
      for (const call of calls) {
        expect(call).toContain("tool: tool.id")
      }
    }
  })
})
