import type { SupabaseClient } from "@supabase/supabase-js"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const revalidatePath = vi.fn()

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}))

type Filter = [string, unknown]
type Recorded = { table: string; verb: string; filters: Filter[] }

// Minimal thenable query builder that records the verb + filter chain per
// from() call, so tests can assert every mutation is scoped to the user.
function fakeDb(options: { errorOn?: string } = {}) {
  const recorded: Recorded[] = []
  function from(table: string) {
    const rec: Recorded = { table, verb: "", filters: [] }
    recorded.push(rec)
    const result = () => ({
      data: null,
      error:
        options.errorOn === `${rec.table}.${rec.verb}` ? { code: "x" } : null,
    })
    const builder = {
      select: () => {
        if (!rec.verb) rec.verb = "select"
        return builder
      },
      update: () => {
        rec.verb = "update"
        return builder
      },
      delete: () => {
        rec.verb = "delete"
        return builder
      },
      eq: (col: string, val: unknown) => {
        rec.filters.push([col, val])
        return builder
      },
      single: async () => result(),
      // biome-ignore lint/suspicious/noThenProperty: mimics Supabase's thenable query builder
      then: (resolve: (v: unknown) => void) => resolve(result()),
    }
    return builder
  }
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from,
  } as unknown as SupabaseClient
  return { client, recorded }
}

function filtersOf(recorded: Recorded[], table: string, verb: string) {
  return recorded.find((r) => r.table === table && r.verb === verb)?.filters
}

async function importActions(db: ReturnType<typeof fakeDb>) {
  vi.doMock("@/lib/supabase/server", () => ({
    createClient: async () => db.client,
  }))
  return import("./alerts")
}

function formData(entries: Record<string, string>) {
  const fd = new FormData()
  for (const [key, value] of Object.entries(entries)) fd.set(key, value)
  return fd
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe("toggleAlertDestination", () => {
  it("reports success and scopes the update to the signed-in user", async () => {
    const db = fakeDb()
    const { toggleAlertDestination } = await importActions(db)

    const result = await toggleAlertDestination(
      formData({ id: "dest-1", enabled: "true" })
    )

    expect(result).toEqual({ ok: true })
    expect(filtersOf(db.recorded, "alert_destinations", "update")).toEqual(
      expect.arrayContaining([
        ["id", "dest-1"],
        ["user_id", "user-1"],
      ])
    )
    expect(revalidatePath).toHaveBeenCalledWith("/settings")
  })

  it("surfaces a database failure instead of swallowing it", async () => {
    const db = fakeDb({ errorOn: "alert_destinations.update" })
    const { toggleAlertDestination } = await importActions(db)

    const result = await toggleAlertDestination(
      formData({ id: "dest-1", enabled: "false" })
    )

    expect(result).toEqual({
      ok: false,
      error: "Couldn't update the destination.",
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("rejects a missing id without touching the database", async () => {
    const db = fakeDb()
    const { toggleAlertDestination } = await importActions(db)

    const result = await toggleAlertDestination(formData({ enabled: "true" }))

    expect(result).toMatchObject({ ok: false })
    expect(db.recorded).toHaveLength(0)
  })
})

describe("deleteAlertDestination", () => {
  it("reports success and scopes the delete to the signed-in user", async () => {
    const db = fakeDb()
    const { deleteAlertDestination } = await importActions(db)

    const result = await deleteAlertDestination(formData({ id: "dest-1" }))

    expect(result).toEqual({ ok: true })
    expect(filtersOf(db.recorded, "alert_destinations", "delete")).toEqual(
      expect.arrayContaining([
        ["id", "dest-1"],
        ["user_id", "user-1"],
      ])
    )
    expect(revalidatePath).toHaveBeenCalledWith("/settings")
  })

  it("surfaces a database failure instead of swallowing it", async () => {
    const db = fakeDb({ errorOn: "alert_destinations.delete" })
    const { deleteAlertDestination } = await importActions(db)

    const result = await deleteAlertDestination(formData({ id: "dest-1" }))

    expect(result).toEqual({
      ok: false,
      error: "Couldn't remove the destination.",
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe("markAlertEventRead", () => {
  it("reports success and scopes the update to the signed-in user", async () => {
    const db = fakeDb()
    const { markAlertEventRead } = await importActions(db)

    const result = await markAlertEventRead(formData({ id: "event-1" }))

    expect(result).toEqual({ ok: true })
    expect(filtersOf(db.recorded, "alert_events", "update")).toEqual(
      expect.arrayContaining([
        ["id", "event-1"],
        ["user_id", "user-1"],
      ])
    )
    expect(revalidatePath).toHaveBeenCalledWith("/alerts")
  })

  it("surfaces a database failure instead of swallowing it", async () => {
    const db = fakeDb({ errorOn: "alert_events.update" })
    const { markAlertEventRead } = await importActions(db)

    const result = await markAlertEventRead(formData({ id: "event-1" }))

    expect(result).toEqual({
      ok: false,
      error: "Couldn't mark the alert read.",
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
