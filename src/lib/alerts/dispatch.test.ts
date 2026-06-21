import { encrypt } from "@/lib/crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { AlertEvaluation } from "./severity"

// Capture the model handed to the email renderer so we can assert which pools
// land in the email body. sendEmail is stubbed to always succeed.
const sendEmail = vi.fn(async (..._args: unknown[]) => ({ ok: true as const }))
const renderAlertEmail = vi.fn((_model: unknown) => ({
  subject: "s",
  html: "<p>h</p>",
  text: "h",
}))

vi.mock("@/lib/email/client", () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
}))
vi.mock("@/lib/email/render/alert", () => ({
  renderAlertEmail: (model: unknown) => renderAlertEmail(model),
}))

type InsertRecord = Record<string, unknown>

// Minimal fake of the chained query builder dispatchAlerts uses.
function fakeSupabase(
  userEmail: string,
  destinations: InsertRecord[] = []
): { client: SupabaseClient; inserts: Record<string, InsertRecord[]> } {
  const inserts: Record<string, InsertRecord[]> = {}
  const usersResult = {
    data: [{ id: "u1", email: userEmail, notify_mode: "low_and_critical" }],
  }
  let table = ""

  function builderFor(name: string) {
    table = name
    const builder = {
      select: vi.fn(() => builder),
      in: vi.fn(async () => {
        if (table === "users") return usersResult
        if (table === "alert_destinations") return { data: destinations }
        return { data: [] }
      }),
      eq: vi.fn(async () => {
        if (table === "alert_destinations") return { data: destinations }
        return { data: null }
      }),
      update: vi.fn(() => builder),
      insert: vi.fn((record: InsertRecord) => {
        inserts[table] = [...(inserts[table] ?? []), record]
        return builder
      }),
      single: vi.fn(async () => ({
        data: { id: "evt-1", created_at: "2026-06-10T10:00:00.000Z" },
      })),
    }
    return builder
  }

  const client = {
    from: vi.fn((name: string) => builderFor(name)),
  } as unknown as SupabaseClient

  return { client, inserts }
}

async function dispatch(evaluations: AlertEvaluation[], email = "a@b.com") {
  const { dispatchAlerts } = await import("./dispatch")
  return dispatchAlerts(fakeSupabase(email).client, evaluations)
}

function evaluation(balance: number, low: number): AlertEvaluation {
  return {
    connectionId: "c1",
    userId: "u1",
    toolName: "Acme",
    connectionName: "Acme main",
    topupUrl: null,
    alertEnabled: true,
    severity: "low",
    notifiedLevel: "none",
    pools: [
      { label: "Credits", balance, low, critical: null, unit: "credits" },
    ],
  }
}

describe("dispatchAlerts pool-body filter", () => {
  beforeEach(() => {
    vi.stubEnv("POSTMARK_SERVER_TOKEN", "tok")
  })
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it("includes a pool whose balance sits exactly on its threshold", async () => {
    // Balance === low threshold: severity.ts triggers (inclusive <=), so the
    // email body must list this pool, not arrive empty.
    const res = await dispatch([evaluation(50, 50)])

    expect(res.sent).toBe(1)
    expect(renderAlertEmail).toHaveBeenCalledOnce()
    const model = renderAlertEmail.mock.calls[0][0] as {
      pools: { label: string; balance: number; threshold: number }[]
    }
    expect(model.pools).toHaveLength(1)
    expect(model.pools[0]).toMatchObject({
      label: "Credits",
      balance: 50,
      threshold: 50,
    })
  })

  it("excludes a pool whose balance is strictly above its threshold", async () => {
    // Severity here is supplied as "low" (e.g. a sibling pool tripped the alert),
    // but this pool at 60 > 50 is healthy and must not appear in the body.
    const res = await dispatch([evaluation(60, 50)])

    expect(res.sent).toBe(1)
    const model = renderAlertEmail.mock.calls[0][0] as {
      pools: unknown[]
    }
    expect(model.pools).toHaveLength(0)
  })
})

describe("dispatchAlerts in-app events and destinations", () => {
  beforeEach(() => {
    vi.stubEnv("POSTMARK_SERVER_TOKEN", "tok")
    vi.stubEnv("ENCRYPTION_KEY", "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=")
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("ok", { status: 200 }))
    )
  })
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("creates an in-app alert event when a connection escalates", async () => {
    const db = fakeSupabase("a@b.com")
    const { dispatchAlerts } = await import("./dispatch")

    await dispatchAlerts(db.client, [evaluation(50, 50)])

    expect(db.inserts.alert_events).toHaveLength(1)
    expect(db.inserts.alert_events[0]).toMatchObject({
      user_id: "u1",
      connection_id: "c1",
      level: "low",
      tool_name: "Acme",
      connection_name: "Acme main",
    })
  })

  it("posts matching alert events to configured webhook destinations", async () => {
    const db = fakeSupabase("a@b.com", [
      {
        id: "dest-1",
        user_id: "u1",
        kind: "webhook",
        min_level: "low",
        encrypted_url: encrypt("https://example.com/hook"),
      },
    ])
    const { dispatchAlerts } = await import("./dispatch")

    await dispatchAlerts(db.client, [evaluation(50, 50)])

    expect(fetch).toHaveBeenCalledWith(
      "https://example.com/hook",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("quota.alert.low"),
      })
    )
  })
})
