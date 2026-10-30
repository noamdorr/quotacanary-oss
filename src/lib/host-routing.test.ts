import { isProtectedAppPath } from "@/lib/host-routing"
import { describe, expect, it } from "vitest"

describe("isProtectedAppPath", () => {
  it("gates every (dashboard)-group route root", () => {
    for (const path of [
      "/dashboard",
      "/alerts",
      "/connect",
      "/developer",
      "/settings",
      "/tools",
    ]) {
      expect(isProtectedAppPath(path)).toBe(true)
    }
  })

  it("leaves /security open - the security model is public (QUO-20)", () => {
    expect(isProtectedAppPath("/security")).toBe(false)
  })

  it("gates nested protected paths (e.g. a tool detail page)", () => {
    expect(isProtectedAppPath("/tools/openai")).toBe(true)
    expect(isProtectedAppPath("/dashboard/anything")).toBe(true)
  })

  it("leaves the (auth) routes open to anonymous users", () => {
    expect(isProtectedAppPath("/login")).toBe(false)
  })

  it("leaves the app root and non-page routes ungated", () => {
    expect(isProtectedAppPath("/")).toBe(false)
    expect(isProtectedAppPath("/api/poll")).toBe(false)
    expect(isProtectedAppPath("/auth/confirm")).toBe(false)
    expect(isProtectedAppPath("/mcp")).toBe(false)
  })

  it("anchors on a full path segment, not a bare prefix", () => {
    expect(isProtectedAppPath("/settings-export")).toBe(false)
    expect(isProtectedAppPath("/toolsmith")).toBe(false)
    expect(isProtectedAppPath("/developer-portal")).toBe(false)
  })
})
