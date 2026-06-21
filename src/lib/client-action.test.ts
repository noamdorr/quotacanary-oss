import { describe, expect, it } from "vitest"
import { runClientAction } from "./client-action"

describe("runClientAction", () => {
  it("returns action results unchanged", async () => {
    await expect(
      runClientAction(() => Promise.resolve({ ok: true as const }))
    ).resolves.toEqual({ ok: true })
  })

  it("turns stale server action lookup errors into recoverable results", async () => {
    const error = new Error(
      'Server Action "abc123" was not found on the server.'
    )

    await expect(runClientAction(() => Promise.reject(error))).resolves.toEqual(
      {
        ok: false,
        error:
          "This dashboard is out of date. Refresh the page, then try again.",
      }
    )
  })
})
