import "server-only"

import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"

const RENEW_INTERVAL_MS = 30_000
// Migration 066 fixes expiry at five minutes. Stop earlier locally, leaving
// headroom for RPC latency; monotonic time also survives wall-clock corrections.
const SAFE_LEASE_MS = 290_000
const RPC_TIMEOUT_MS = 5_000

export type PollLease = {
  check: () => Promise<void>
  release: () => Promise<void>
}

export async function claimPollLease(
  supabase: SupabaseClient
): Promise<PollLease | null> {
  const owner = randomUUID()
  async function rpc(name: string) {
    const { data, error } = await supabase
      .rpc(name, { p_owner_id: owner })
      .abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS))
    if (error || typeof data !== "boolean") {
      throw new Error("Poll lease database operation failed")
    }
    return data
  }

  const started = performance.now()
  if (!(await rpc("claim_poll_run"))) return null
  let deadline = started + SAFE_LEASE_MS
  let lost = false
  let stopped = false
  let renewing: Promise<void> | null = null

  function renew(): Promise<void> {
    if (renewing) return renewing
    renewing = (async () => {
      if (lost || stopped || performance.now() >= deadline) {
        lost = true
        throw new Error("Poll lease lost")
      }
      const began = performance.now()
      try {
        if (!(await rpc("renew_poll_run"))) throw new Error("Poll lease lost")
        deadline = began + SAFE_LEASE_MS
      } catch (error) {
        lost = true
        throw error
      }
    })().finally(() => {
      renewing = null
    })
    return renewing
  }

  const timer = setInterval(() => {
    if (!lost) void renew().catch(() => {})
  }, RENEW_INTERVAL_MS)
  timer.unref()

  return {
    // Each new phase/batch rechecks the database owner, even if the periodic
    // heartbeat has not fired. A failed or ambiguous renewal fails closed.
    check: renew,
    async release() {
      stopped = true
      clearInterval(timer)
      await renewing?.catch(() => {})
      try {
        await rpc("release_poll_run")
      } catch {
        // Expiry is the crash/release-failure recovery path. Never erase a
        // successor: release is conditional on this invocation's owner UUID.
        console.error("[poll] lease release failed; waiting for expiry")
      }
    },
  }
}
