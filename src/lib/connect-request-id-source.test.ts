import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const connectModal = readFileSync(
  resolve(process.cwd(), "src/components/connect/ConnectModal.tsx"),
  "utf8"
)
const onboardingFlow = readFileSync(
  resolve(process.cwd(), "src/components/dashboard/OnboardingFlow.tsx"),
  "utf8"
)

describe("connection creation request IDs", () => {
  it("keeps one modal request ID while the modal stays open", () => {
    expect(connectModal).toContain("useState(() => crypto.randomUUID())")
    expect(connectModal).toContain("setCreateRequestId(crypto.randomUUID())")
    expect(connectModal).toContain('name="createRequestId"')
    expect(connectModal).toContain("value={createRequestId}")
  })

  it("creates an onboarding request ID per selected tool and submits it", () => {
    expect(onboardingFlow).toContain("useState(() => crypto.randomUUID())")
    expect(onboardingFlow).toContain(
      'fd.set("createRequestId", createRequestId)'
    )
    expect(onboardingFlow).toContain("setCreateRequestId(crypto.randomUUID())")
  })
})
