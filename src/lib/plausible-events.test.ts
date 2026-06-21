import { afterEach, describe, expect, it, vi } from "vitest"

import { trackPlausibleEvent } from "@/lib/plausible-events"

describe("trackPlausibleEvent", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("does nothing when Plausible is not available", () => {
    expect(() => trackPlausibleEvent("Video Play")).not.toThrow()
  })

  it("sends the event to Plausible when the browser snippet is loaded", () => {
    const plausible = vi.fn()

    vi.stubGlobal("window", { plausible })

    trackPlausibleEvent("Video Complete")

    expect(plausible).toHaveBeenCalledWith("Video Complete")
  })
})
