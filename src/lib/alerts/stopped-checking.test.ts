import { catalogAdapter } from "@/lib/adapters/catalog"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  STOPPED_CHECKING_THRESHOLD,
  type StoppedCheckingEvaluation,
  alertedThisIncident,
  isRejectedKeyError,
  stoppedCheckingBody,
  stoppedCheckingDue,
  stoppedCheckingTitle,
} from "./stopped-checking"

function evaluation(
  overrides: Partial<StoppedCheckingEvaluation> = {}
): StoppedCheckingEvaluation {
  return {
    connectionId: "c1",
    userId: "u1",
    toolName: "Apollo",
    connectionName: "Apollo main",
    alertEnabled: true,
    consecutiveFailures: 1,
    keyRejected: false,
    failureAlertedAt: null,
    ...overrides,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("isRejectedKeyError", () => {
  it("recognises the catalog adapter's rejected-key message", async () => {
    // The fast path keys off adapter copy, so pin it to the real producer: a
    // catalog entry answering 401 is the most common rejected key there is.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 401 }))
    )
    const adapter = catalogAdapter({
      id: "acme",
      name: "Acme",
      request: { method: "GET", url: "https://api.acme.test/balance" },
      auth: { in: "header", name: "Authorization", format: "Bearer {key}" },
      pools: [
        {
          creditType: "credits",
          label: "Credits",
          balance: "credits",
          unit: "credits",
        },
      ],
    })
    const result = await adapter.readBalance("dead-key")

    expect(result.ok).toBe(false)
    expect(!result.ok && isRejectedKeyError(result.error)).toBe(true)
  })

  it("recognises the hand-written adapters' variants", () => {
    expect(isRejectedKeyError("Apollo rejected this key.")).toBe(true)
    expect(isRejectedKeyError("Twilio rejected these credentials.")).toBe(true)
    expect(isRejectedKeyError("ContactOut rejected this token.")).toBe(true)
  })

  it("leaves transient and unknown failures to the threshold", () => {
    expect(isRejectedKeyError("Couldn't reach Apollo.")).toBe(false)
    expect(isRejectedKeyError("Apollo returned 503.")).toBe(false)
    expect(isRejectedKeyError("Couldn't read this connection's balance.")).toBe(
      false
    )
    expect(
      isRejectedKeyError("Firecrawl rejected the credit usage request.")
    ).toBe(false)
  })
})

describe("stoppedCheckingDue", () => {
  it("waits for the third failure in a row", () => {
    expect(STOPPED_CHECKING_THRESHOLD).toBe(3)
    expect(stoppedCheckingDue(evaluation({ consecutiveFailures: 1 }))).toBe(
      false
    )
    expect(stoppedCheckingDue(evaluation({ consecutiveFailures: 2 }))).toBe(
      false
    )
    expect(stoppedCheckingDue(evaluation({ consecutiveFailures: 3 }))).toBe(
      true
    )
    expect(stoppedCheckingDue(evaluation({ consecutiveFailures: 9 }))).toBe(
      true
    )
  })

  it("does not wait when the vendor rejected the key", () => {
    expect(
      stoppedCheckingDue(
        evaluation({ consecutiveFailures: 1, keyRejected: true })
      )
    ).toBe(true)
  })

  it("never fires for a connection with alerts off", () => {
    expect(
      stoppedCheckingDue(
        evaluation({
          alertEnabled: false,
          consecutiveFailures: 5,
          keyRejected: true,
        })
      )
    ).toBe(false)
  })
})

describe("alertedThisIncident", () => {
  it("is false until the incident's alert has been stamped", () => {
    expect(alertedThisIncident(null, "2026-10-18T09:00:00.000Z")).toBe(false)
  })

  it("is true for a stamp newer than the last good read", () => {
    expect(
      alertedThisIncident(
        "2026-10-18T10:00:00.000Z",
        "2026-10-18T09:00:00.000Z"
      )
    ).toBe(true)
  })

  it("is true for a connection that has never read successfully", () => {
    expect(alertedThisIncident("2026-10-18T10:00:00.000Z", null)).toBe(true)
  })

  it("treats a stamp older than the last good read as a past incident", () => {
    // A manual refresh can succeed between two incidents without the poller
    // ever seeing it, so the stamp alone cannot say which incident it is for.
    expect(
      alertedThisIncident(
        "2026-10-18T10:00:00.000Z",
        "2026-10-18T10:05:00.000Z"
      )
    ).toBe(false)
  })
})

describe("stopped-checking copy", () => {
  it("names the tool and the connection, and says why", () => {
    expect(stoppedCheckingTitle("Apollo")).toContain("Apollo")
    const rejected = stoppedCheckingBody(evaluation({ keyRejected: true }))
    expect(rejected).toContain("Apollo main")
    expect(rejected).toContain("rejected")
    const failing = stoppedCheckingBody(evaluation({ consecutiveFailures: 3 }))
    expect(failing).toContain("Apollo main")
    expect(failing).toContain("3 checks in a row")
  })

  it("uses no em dashes", () => {
    for (const text of [
      stoppedCheckingTitle("Apollo"),
      stoppedCheckingBody(evaluation({ keyRejected: true })),
      stoppedCheckingBody(evaluation({ consecutiveFailures: 3 })),
    ]) {
      expect(text).not.toContain("—")
    }
  })
})
