import { describe, expect, it } from "vitest"
import { loginErrorNotice, loginMessageNotice } from "./login-notice"

describe("loginErrorNotice", () => {
  it("maps the known confirmation_failed code to its copy", () => {
    expect(loginErrorNotice("confirmation_failed")).toContain(
      "Email confirmation failed"
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

describe("loginMessageNotice", () => {
  it("maps the known check_email code to its copy", () => {
    expect(loginMessageNotice("check_email")).toContain("Check your email")
  })

  it("renders nothing for unknown codes instead of echoing them", () => {
    expect(loginMessageNotice("You won a prize, visit evil.example")).toBeNull()
  })

  it("does not throw on malformed percent-encoding", () => {
    expect(() => loginMessageNotice("%")).not.toThrow()
    expect(loginMessageNotice("%")).toBeNull()
  })

  it("returns null when there is no message param", () => {
    expect(loginMessageNotice(undefined)).toBeNull()
  })
})
