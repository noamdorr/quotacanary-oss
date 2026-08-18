import { describe, expect, it } from "vitest"
import { loginErrorNotice } from "./login-notice"

describe("loginErrorNotice", () => {
  it("maps the known confirmation_failed code to its copy", () => {
    expect(loginErrorNotice("confirmation_failed")).toContain(
      "expired or was already used"
    )
  })

  it("returns generic copy for unknown codes instead of echoing them", () => {
    const notice = loginErrorNotice("Your account was suspended, call +1-555")
    expect(notice).toBe("Something went wrong. Please try again.")
    expect(notice).not.toContain("suspended")
  })

  it("does not throw on malformed percent-encoding", () => {
    expect(() => loginErrorNotice("%")).not.toThrow()
    expect(loginErrorNotice("%E0%A4%A")).toBe(
      "Something went wrong. Please try again."
    )
  })

  it("returns null when there is no error param", () => {
    expect(loginErrorNotice(undefined)).toBeNull()
    expect(loginErrorNotice("")).toBeNull()
  })
})
