import {
  APP_LOGIN_URL,
  APP_SIGNUP_URL,
  MARKETING_URL,
} from "@/components/marketing/constants"
import { describe, expect, it } from "vitest"

describe("marketing constants", () => {
  it("has a signup URL that opens the signup tab on the shared auth page", () => {
    expect(APP_SIGNUP_URL).toBe(`${APP_LOGIN_URL}?tab=signup`)
  })

  it("MARKETING_URL defaults to the marketing origin (not the app origin)", () => {
    expect(MARKETING_URL).toBe(
      process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://quotacanary.com"
    )
    // Guard the actual failure mode: it must never point at the app origin,
    // which would 404 /docs. Checks the value (not the file) so APP_URL's own
    // "app." origin in the same module doesn't trip it.
    expect(MARKETING_URL).not.toContain("app.")
  })
})
