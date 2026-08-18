import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import {
  INITIAL_ROTATING_TOOL_INDEXES,
  ROTATING_TOOL_LOGOS,
  ROTATING_TOOL_SLOT_COUNT,
  makeLogoQueue,
  makeSlotQueue,
  preloadRotatingToolLogos,
} from "@/lib/marketing-rotating-tools"

describe("marketing rotating tool logos", () => {
  it("uses four visible logo slots", () => {
    expect(ROTATING_TOOL_SLOT_COUNT).toBe(4)
  })

  it("uses lightweight local WebP logo assets", () => {
    expect(ROTATING_TOOL_LOGOS.length).toBeGreaterThanOrEqual(50)

    for (const tool of ROTATING_TOOL_LOGOS) {
      expect(tool.logo).toMatch(/^\/logos\/rotating\/.+\.webp$/)

      const logoPath = resolve(process.cwd(), "public", tool.logo.slice(1))

      expect(existsSync(logoPath)).toBe(true)
      expect(statSync(logoPath).size).toBeLessThanOrEqual(4096)
    }
  })

  it("includes one optimized rotating asset for every catalog logo", () => {
    const localLogos = readdirSync(resolve(process.cwd(), "public/logos"))
      .filter((file) => file.endsWith(".png"))
      .map((file) => `/logos/rotating/${file.replace(/\.png$/, ".webp")}`)
      .sort()
    const rotatingLogos = ROTATING_TOOL_LOGOS.map((tool) => tool.logo).sort()
    const names = ROTATING_TOOL_LOGOS.map((tool) => tool.name)

    expect(rotatingLogos).toEqual(localLogos)
    expect(new Set(names).size).toBe(names.length)
  })

  it("starts with four spaced-out real logos", () => {
    expect(INITIAL_ROTATING_TOOL_INDEXES).toHaveLength(ROTATING_TOOL_SLOT_COUNT)
    expect(INITIAL_ROTATING_TOOL_INDEXES).not.toContain(-1)
    expect(new Set(INITIAL_ROTATING_TOOL_INDEXES).size).toBe(
      ROTATING_TOOL_SLOT_COUNT
    )
  })

  it("builds shuffled logo queues that avoid currently visible logos", () => {
    const visible = [0, 1, 2, 3]
    const queue = makeLogoQueue(visible, () => 0)

    expect(queue).toHaveLength(ROTATING_TOOL_LOGOS.length - visible.length)
    expect(new Set(queue).size).toBe(queue.length)

    for (const index of visible) {
      expect(queue).not.toContain(index)
    }
  })

  it("builds shuffled slot queues instead of marching left to right", () => {
    expect(makeSlotQueue(() => 0)).toEqual([1, 2, 3, 0])
  })

  it("preloads and decodes rotating logos before the animation advances", async () => {
    const decoded: string[] = []

    await preloadRotatingToolLogos(
      ["/logos/one.webp", "/logos/two.webp"],
      () => {
        const image = {
          src: "",
          decode: () => {
            decoded.push(image.src)
            return Promise.resolve()
          },
        }

        return image
      }
    )

    expect(decoded).toEqual(["/logos/one.webp", "/logos/two.webp"])
  })

  it("changes tools at a calm cadence with an opacity-led crossfade", () => {
    const component = readFileSync(
      resolve(process.cwd(), "src/components/marketing/RotatingToolLogos.tsx"),
      "utf8"
    )
    const css = readFileSync(
      resolve(process.cwd(), "src/app/globals.css"),
      "utf8"
    )

    expect(component).toContain("const ADVANCE_MS = 4500")
    expect(component).toContain("qc-rotating-tool-face--previous")
    expect(component).toContain("qc-rotating-tool-face--current")
    expect(component).toContain('closest("section")')
    expect(component).toContain('root.current?.matches(":hover")')
    expect(component).toContain("section?.contains(document.activeElement)")
    expect(component).toContain("void preloadRotatingToolLogos()")
    expect(component).toContain("if (reducedMotion)")
    expect(component).not.toContain("logosReady")
    expect(component).not.toContain("hoverPaused")
    expect(component).not.toContain("focusPaused")
    expect(css).toContain("@keyframes qc-tool-crossfade-in")
    expect(css).toContain("@keyframes qc-tool-crossfade-out")
    expect(css).not.toContain("@keyframes qc-logo-pop")
    expect(css).not.toContain("@keyframes qc-logo-name-pop")

    const reducedMotionBlock = css.slice(
      css.indexOf("@media (prefers-reduced-motion: reduce)")
    )

    expect(reducedMotionBlock).toContain(".qc-rotating-tool-face--previous")
    expect(reducedMotionBlock).toContain("opacity: 0 !important")
  })
})
