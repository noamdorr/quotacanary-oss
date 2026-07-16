import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// ---------------------------------------------------------------------------
// Module mocks (hoisted so they run before the route import resolves)
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }))
vi.mock("@/lib/actions/connections", () => ({ refreshConnectionWith: vi.fn() }))
vi.mock("@/lib/alerts/dispatch", () => ({ dispatchAlerts: vi.fn() }))

import { refreshConnectionWith } from "@/lib/actions/connections"
import { dispatchAlerts } from "@/lib/alerts/dispatch"
import { createAdminClient } from "@/lib/supabase/admin"
import { POST } from "./route"

const mockAdmin = vi.mocked(createAdminClient)
const mockRefresh = vi.mocked(refreshConnectionWith)
const mockDispatch = vi.mocked(dispatchAlerts)

const SECRET = "test-poll-secret"

// Minimal stand-in for the admin client: the route only selects connections
// and calls the prune RPC; alert work is mocked at dispatchAlerts.
function fakeSupabase() {
  // biome-ignore lint/suspicious/noExplicitAny: test double for the builder
  const query: any = {
    select: () => query,
    eq: () => query,
    // biome-ignore lint/suspicious/noThenProperty: Supabase builders are thenables.
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: [{ id: "c1" }], error: null }).then(resolve),
  }
  return {
    from: () => query,
    rpc: vi.fn(async () => ({ data: 0, error: null })),
  }
}

function pollRequest() {
  return new NextRequest("http://app.quotacanary.com/api/poll", {
    method: "POST",
    headers: { authorization: `Bearer ${SECRET}` },
  })
}

beforeEach(() => {
  vi.stubEnv("POLL_SECRET", SECRET)
  // biome-ignore lint/suspicious/noExplicitAny: test double
  mockAdmin.mockReturnValue(fakeSupabase() as any)
  // biome-ignore lint/suspicious/noExplicitAny: test double
  mockRefresh.mockResolvedValue({ ok: true } as any)
  mockDispatch.mockResolvedValue({ sent: 0, failedSends: 0, degraded: false })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe("POST /api/poll", () => {
  it("flags a degraded alert dispatch so a broken delivery loop is visible", async () => {
    mockDispatch.mockResolvedValue({ sent: 0, failedSends: 0, degraded: true })

    const res = await POST(pollRequest())
    const body = await res.json()

    // The counters alone cannot show this: a dispatch that delivered nothing
    // because it was broken looks identical to a quiet, healthy poll.
    expect(res.status).toBe(200)
    expect(body.alertsDegraded).toBe(true)
  })

  it("reports a healthy dispatch as not degraded", async () => {
    const res = await POST(pollRequest())
    const body = await res.json()

    expect(body).toMatchObject({ alertsSent: 0, alertsDegraded: false })
  })

  it("rejects a request without the poll secret", async () => {
    const res = await POST(
      new NextRequest("http://app.quotacanary.com/api/poll", { method: "POST" })
    )

    expect(res.status).toBe(401)
    expect(mockDispatch).not.toHaveBeenCalled()
  })
})
