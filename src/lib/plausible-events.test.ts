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

  it("forwards props in Plausible's options shape when given", () => {
    const plausible = vi.fn()

    vi.stubGlobal("window", { plausible })

    trackPlausibleEvent("Connection Created", { tool: "openai" })

    expect(plausible).toHaveBeenCalledWith("Connection Created", {
      props: { tool: "openai" },
    })
  })
})
