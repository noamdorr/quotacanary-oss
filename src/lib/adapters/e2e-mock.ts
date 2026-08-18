import type { AdapterResult, ToolAdapter } from "./types"

// The browser smoke suite has to create a real connection, and creating one runs
// a live balance read (see connectTool). Every other adapter calls a vendor over
// the network, which no deterministic test can do, so this adapter answers from
// the key itself: "qc_e2e_<primary>_<secondary>" reads back exactly those two
// balances. Two pools, because the dashboard renders one row per POOL and a
// single-pool fixture would not catch a regression back to one row per connection.
//
// It is registered only when E2E_MOCK_TOOL is "true" (see getAdapter), so in
// production the tool id resolves to nothing and the connect flow rejects it
// with the same "isn't supported yet" error as any other unknown tool.
export const E2E_MOCK_TOOL_ID = "qc-e2e-mock"

export const E2E_MOCK_POOLS = [
  { credit_type: "primary", label: "Primary Credits", unit: "credits" },
  { credit_type: "secondary", label: "Secondary Credits", unit: "credits" },
]

const KEY_PATTERN = /^qc_e2e_(\d+)_(\d+)$/

export const e2eMockAdapter: ToolAdapter = {
  toolId: E2E_MOCK_TOOL_ID,
  async readBalance(apiKey: string): Promise<AdapterResult> {
    const match = KEY_PATTERN.exec(apiKey.trim())
    // A key that does not parse is the fixture's "bad credentials" case, so the
    // suite can exercise the rejection path without a vendor round trip.
    if (!match) return { ok: false, error: "Mock tool rejected this key." }

    const [, primary, secondary] = match
    return {
      ok: true,
      balances: [
        {
          creditType: "primary",
          label: "Primary Credits",
          balance: Number(primary),
          balanceLimit: null,
          unit: "credits",
        },
        {
          creditType: "secondary",
          label: "Secondary Credits",
          balance: Number(secondary),
          balanceLimit: null,
          unit: "credits",
        },
      ],
    }
  },
}
