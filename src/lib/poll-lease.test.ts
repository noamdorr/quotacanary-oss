import type { SupabaseClient } from "@supabase/supabase-js"
import { afterEach, describe, expect, it, vi } from "vitest"
import { claimPollLease } from "./poll-lease"

function database(reply: (name: string) => unknown = () => true) {
  const rpc = vi.fn((name: string, args: { p_owner_id: string }) => {
    const promise = Promise.resolve(reply(name)).then((data) => ({
      data,
      error: null,
    }))
    return Object.assign(promise, { abortSignal: () => promise })
  })
  return { rpc, client: { rpc } as unknown as SupabaseClient }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("poll lease lifecycle", () => {
  it("returns no lease when another owner holds the claim", async () => {
    const db = database(() => false)
    expect(await claimPollLease(db.client)).toBeNull()
    expect(db.rpc).toHaveBeenCalledTimes(1)
  })

  it("renews in the background and releases only its own random owner", async () => {
    vi.useFakeTimers()
    const db = database()
    const lease = await claimPollLease(db.client)
    expect(lease).not.toBeNull()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(db.rpc.mock.calls.map(([name]) => name)).toContain("renew_poll_run")
    await lease?.check()
    await lease?.release()
    const calls = db.rpc.mock.calls
    expect(new Set(calls.map(([, args]) => args.p_owner_id)).size).toBe(1)
    expect(calls.at(-1)?.[0]).toBe("release_poll_run")
    const count = calls.length
    await vi.advanceTimersByTimeAsync(60_000)
    expect(db.rpc).toHaveBeenCalledTimes(count)
  })

  it("never restarts work after a failed renewal, even if the DB recovers", async () => {
    vi.useFakeTimers()
    let healthy = true
    const db = database((name) => name !== "renew_poll_run" || healthy)
    const lease = await claimPollLease(db.client)
    healthy = false
    await vi.advanceTimersByTimeAsync(30_000)
    healthy = true
    await expect(lease?.check()).rejects.toThrow("Poll lease lost")
    await lease?.release()
  })

  it("fails closed on a malformed or failed claim response", async () => {
    const db = database(() => null)
    await expect(claimPollLease(db.client)).rejects.toThrow(
      "database operation failed"
    )
  })

  it("does not renew or start a new phase after its local safety deadline", async () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(0)
    const db = database()
    const lease = await claimPollLease(db.client)
    now.mockReturnValue(290_001)
    await expect(lease?.check()).rejects.toThrow("Poll lease lost")
    expect(db.rpc.mock.calls.map(([name]) => name)).toEqual(["claim_poll_run"])
    await lease?.release()
  })

  it("waits for an in-flight renewal before releasing", async () => {
    let finish: (value: boolean) => void = () => {}
    const pending = new Promise<boolean>((resolve) => {
      finish = resolve
    })
    const db = database((name) => (name === "renew_poll_run" ? pending : true))
    const lease = await claimPollLease(db.client)
    const check = lease?.check()
    const release = lease?.release()
    expect(db.rpc.mock.calls.map(([name]) => name)).not.toContain(
      "release_poll_run"
    )
    finish(true)
    await Promise.all([check, release])
    expect(db.rpc.mock.calls.at(-1)?.[0]).toBe("release_poll_run")
  })
})
