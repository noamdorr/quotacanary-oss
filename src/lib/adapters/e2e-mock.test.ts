import { afterEach, describe, expect, it, vi } from "vitest"
import { E2E_MOCK_TOOL_ID, e2eMockAdapter } from "./e2e-mock"
import { getAdapter } from "./registry"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("the e2e fixture adapter", () => {
  it("is unreachable unless E2E_MOCK_TOOL is set", () => {
    // stubEnv with undefined unsets the variable; assigning it directly would
    // store the STRING "undefined" and pass for the wrong reason.
    vi.stubEnv("E2E_MOCK_TOOL", undefined)
    expect(getAdapter(E2E_MOCK_TOOL_ID)).toBeUndefined()
  })

  it('stays unreachable for any value other than "true"', () => {
    vi.stubEnv("E2E_MOCK_TOOL", "1")
    expect(getAdapter(E2E_MOCK_TOOL_ID)).toBeUndefined()
  })

  it("resolves when the flag is on", () => {
    vi.stubEnv("E2E_MOCK_TOOL", "true")
    expect(getAdapter(E2E_MOCK_TOOL_ID)).toBe(e2eMockAdapter)
  })

  it("reads both pool balances out of the key", async () => {
    const result = await e2eMockAdapter.readBalance("qc_e2e_5000_120")
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "primary",
          label: "Primary Credits",
          balance: 5000,
          balanceLimit: null,
          unit: "credits",
        },
        {
          creditType: "secondary",
          label: "Secondary Credits",
          balance: 120,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects a key it cannot parse", async () => {
    expect(await e2eMockAdapter.readBalance("nope")).toEqual({
      ok: false,
      error: "Mock tool rejected this key.",
    })
  })
})
