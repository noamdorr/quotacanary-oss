import { resolveAuthTab } from "@/lib/auth-tab"
import { describe, expect, it } from "vitest"

describe("resolveAuthTab", () => {
  it("opens the signup tab only when requested", () => {
    expect(resolveAuthTab("signup")).toBe("signup")
  })

  it("defaults invalid or missing tab values to login", () => {
    expect(resolveAuthTab()).toBe("login")
    expect(resolveAuthTab("login")).toBe("login")
    expect(resolveAuthTab("anything-else")).toBe("login")
  })
})
