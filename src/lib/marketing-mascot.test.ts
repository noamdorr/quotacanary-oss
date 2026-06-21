import { describe, expect, it } from "vitest"

import { MASCOT_LINES } from "@/lib/marketing-mascot"

describe("marketing mascot lines", () => {
  it("keeps the canary quips tied to the main homepage moments", () => {
    expect(MASCOT_LINES.hero).toBe("I sing before the credits die.")
    expect(MASCOT_LINES.auth).toBe("Sign in. I will keep watch.")
    expect(MASCOT_LINES.finalCta).toBe("You connect it. I panic early.")
  })
})
