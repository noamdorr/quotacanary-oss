import type { SendEmailInput, SendEmailResult } from "@/lib/email/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const sendEmail = vi.fn(
  async (_input: SendEmailInput): Promise<SendEmailResult> => ({ ok: true })
)

vi.mock("@/lib/email/client", () => ({
  sendEmail: (input: SendEmailInput) => sendEmail(input),
}))

type InsertPayload = Record<string, unknown>
type RpcCall = { fn: string; params: Record<string, unknown> }

function fakeSupabase(
  options: {
    rateLimit?: { allowed: boolean; reset_seconds: number }
    insertError?: unknown
    user?: { id: string; email?: string } | null
  } = {}
): {
  client: SupabaseClient
  inserts: Record<string, InsertPayload[]>
  rpcCalls: RpcCall[]
} {
  const {
    rateLimit = { allowed: true, reset_seconds: 3600 },
    insertError = null,
    user = { id: "user-1", email: "someone@example.com" },
  } = options
  const inserts: Record<string, InsertPayload[]> = {}
  const rpcCalls: RpcCall[] = []

  const client = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user } })),
    },
    from: vi.fn((table: string) => ({
      insert: vi.fn(async (payload: InsertPayload) => {
        inserts[table] = [...(inserts[table] ?? []), payload]
        return { error: insertError }
      }),
    })),
    rpc: vi.fn(async (fn: string, params: Record<string, unknown>) => {
      rpcCalls.push({ fn, params })
      return { data: [rateLimit], error: null }
    }),
  } as unknown as SupabaseClient

  return { client, inserts, rpcCalls }
}

async function importWith(db: { client: SupabaseClient }) {
  vi.doMock("@/lib/supabase/server", () => ({
    createClient: async () => db.client,
  }))
  return import("./feedback")
}

function form(fields: Record<string, string>): FormData {
  const formData = new FormData()
  for (const [key, value] of Object.entries(fields)) formData.set(key, value)
  return formData
}

describe("submitFeedback", () => {
  beforeEach(() => {
    vi.resetModules()
    sendEmail.mockClear()
    sendEmail.mockResolvedValue({ ok: true as const })
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it("stores a bug report with its diagnostic context", async () => {
    const db = fakeSupabase()
    const { submitFeedback } = await importWith(db)

    const result = await submitFeedback(
      null,
      form({
        category: "bug",
        message: "The sparkline renders blank after a refresh.",
        pagePath: "/dashboard",
      })
    )

    expect(result.ok).toBe(true)
    expect(db.inserts.feedback_submissions).toHaveLength(1)
    expect(db.inserts.feedback_submissions[0]).toMatchObject({
      user_id: "user-1",
      category: "bug",
      message: "The sparkline renders blank after a refresh.",
      page_path: "/dashboard",
    })
    // Stamped server-side so a forged client value can't lie about the build.
    expect(db.inserts.feedback_submissions[0].app_version).toBeTruthy()
  })

  it("routes an unsupported-tool request to tool_requests, not feedback", async () => {
    // QUO-15 reads tool_requests as the demand signal. A second capture path
    // for the same thing would split that stream in two.
    const db = fakeSupabase()
    const { submitFeedback } = await importWith(db)

    const result = await submitFeedback(
      null,
      form({
        category: "tool",
        message: "Please support Clay.",
        toolName: "Clay",
        pagePath: "/connect",
      })
    )

    expect(result.ok).toBe(true)
    expect(db.inserts.tool_requests).toHaveLength(1)
    expect(db.inserts.tool_requests[0]).toMatchObject({
      user_id: "user-1",
      tool_name: "Clay",
      note: "Please support Clay.",
    })
    expect(db.inserts.feedback_submissions).toBeUndefined()
  })

  it("requires a tool name when the category is a tool request", async () => {
    const db = fakeSupabase()
    const { submitFeedback } = await importWith(db)

    const result = await submitFeedback(
      null,
      form({ category: "tool", message: "Please support it." })
    )

    expect(result).toEqual({
      ok: false,
      error: "Which tool? Add its name.",
    })
    expect(db.inserts.tool_requests).toBeUndefined()
  })

  it("rejects an unknown category instead of storing it", async () => {
    const db = fakeSupabase()
    const { submitFeedback } = await importWith(db)

    const result = await submitFeedback(
      null,
      form({ category: "spam", message: "hello" })
    )

    expect(result.ok).toBe(false)
    expect(db.inserts.feedback_submissions).toBeUndefined()
  })

  it("rejects an empty message", async () => {
    const db = fakeSupabase()
    const { submitFeedback } = await importWith(db)

    const result = await submitFeedback(
      null,
      form({ category: "bug", message: "   " })
    )

    expect(result).toEqual({ ok: false, error: "Tell us what happened." })
  })

  it("rejects a message over 4,000 characters", async () => {
    const db = fakeSupabase()
    const { submitFeedback } = await importWith(db)

    const result = await submitFeedback(
      null,
      form({ category: "bug", message: "a".repeat(4001) })
    )

    expect(result).toEqual({
      ok: false,
      error: "Message is too long (4,000 characters max).",
    })
  })

  it("consumes the rate limit before writing anything", async () => {
    const db = fakeSupabase({
      rateLimit: { allowed: false, reset_seconds: 900 },
    })
    const { submitFeedback } = await importWith(db)

    const result = await submitFeedback(
      null,
      form({ category: "feedback", message: "Nice tool." })
    )

    expect(result.ok).toBe(false)
    expect(db.rpcCalls.map((c) => c.fn)).toEqual([
      "consume_feedback_rate_limit",
    ])
    // Nothing stored and nothing emailed once the limit says no.
    expect(db.inserts.feedback_submissions).toBeUndefined()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("takes no caller-supplied limit", async () => {
    const db = fakeSupabase()
    const { submitFeedback } = await importWith(db)

    await submitFeedback(null, form({ category: "feedback", message: "Hi." }))

    // Not even an empty object: the limit and the subject are both fixed
    // inside the function, so there is nothing for a caller to set.
    expect(db.rpcCalls[0].params).toBeUndefined()
  })

  it("still succeeds when the notification email fails", async () => {
    // The row is the store of record; the email is best-effort. A Postmark
    // outage must not tell the user their feedback was lost when it was not.
    const db = fakeSupabase()
    sendEmail.mockResolvedValue({
      ok: false,
      error: "Postmark error 500",
      retryable: true,
    })
    const { submitFeedback } = await importWith(db)

    const result = await submitFeedback(
      null,
      form({ category: "bug", message: "Something broke." })
    )

    expect(result.ok).toBe(true)
    expect(db.inserts.feedback_submissions).toHaveLength(1)
  })

  it("fails when the row cannot be stored", async () => {
    const db = fakeSupabase({ insertError: { message: "boom" } })
    const { submitFeedback } = await importWith(db)

    const result = await submitFeedback(
      null,
      form({ category: "bug", message: "Something broke." })
    )

    expect(result.ok).toBe(false)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("truncates an oversized user agent rather than rejecting the report", async () => {
    const db = fakeSupabase()
    const { submitFeedback } = await importWith(db)

    await submitFeedback(
      null,
      form({
        category: "bug",
        message: "Broke.",
        userAgent: "a".repeat(1000),
      })
    )

    const stored = db.inserts.feedback_submissions[0].user_agent as string
    expect(stored.length).toBeLessThanOrEqual(400)
  })

  it("caps an oversized page path", async () => {
    // Client-supplied and stored in an unbounded text column.
    const db = fakeSupabase()
    const { submitFeedback } = await importWith(db)

    await submitFeedback(
      null,
      form({
        category: "bug",
        message: "Broke.",
        pagePath: `/${"a".repeat(500)}`,
      })
    )

    const stored = db.inserts.feedback_submissions[0].page_path as string
    expect(stored.length).toBeLessThanOrEqual(200)
  })
})
