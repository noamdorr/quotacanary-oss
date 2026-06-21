import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const heroSource = readFileSync(
  resolve(process.cwd(), "src/components/marketing/HeroEditorial.tsx"),
  "utf8"
)

const dialogSource = readFileSync(
  resolve(process.cwd(), "src/components/marketing/LaunchVideoDialog.tsx"),
  "utf8"
)

describe("launch video CTA", () => {
  it("places a secondary video CTA in the marketing hero", () => {
    expect(heroSource).toContain("LaunchVideoDialog")
    expect(dialogSource).toContain("See how it works (26s)")
    expect(dialogSource).toContain("PlayCircle")
  })

  it("uses the local launch video assets and tracks key Plausible events", () => {
    expect(dialogSource).toContain("/video/quotacanary-launch.mp4")
    expect(dialogSource).toContain("/video/quotacanary-launch-poster")
    expect(dialogSource).toContain("Video CTA Click")
    expect(dialogSource).toContain("Video Play")
    expect(dialogSource).toContain("Video Complete")
  })

  it("does not attach captions to the music-only launch video", () => {
    expect(dialogSource).not.toContain("<track")
    expect(dialogSource).not.toContain("quotacanary-launch-captions")
    expect(
      existsSync(
        resolve(process.cwd(), "public/video/quotacanary-launch-captions.vtt")
      )
    ).toBe(false)
  })
})
