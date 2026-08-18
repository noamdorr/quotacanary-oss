import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8")
const navSource = readFileSync(
  resolve(process.cwd(), "src/components/marketing/MarketingNav.tsx"),
  "utf8"
)

function declarationsFor(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))

  expect(match, `${selector} rule should exist`).not.toBeNull()
  if (!match) {
    throw new Error(`${selector} rule should exist`)
  }

  return Object.fromEntries(
    match[1]
      .split(";")
      .map((declaration) => declaration.trim())
      .filter(Boolean)
      .map((declaration) => {
        const separator = declaration.indexOf(":")

        return [
          declaration.slice(0, separator).trim(),
          declaration.slice(separator + 1).trim(),
        ]
      })
  )
}

describe("marketing nav css", () => {
  it("keeps the Pricing hover label from being clipped", () => {
    const pricingGag = declarationsFor(".qc-nav .pricing-gag")
    const pricingSpans = declarationsFor(".qc-nav .pricing-gag span")
    const hoverLabel = declarationsFor(".qc-nav .pricing-gag .label-2")

    expect(pricingGag.display).toBe("inline-grid")
    expect(pricingGag["white-space"]).toBe("nowrap")
    expect(pricingSpans["grid-area"]).toBe("1 / 1")
    expect(hoverLabel.position).toBe("relative")
  })

  it("keeps both mobile-menu icons mounted with a legible state transition", () => {
    expect(navSource).toContain("qc-state-icon")
    expect(navSource).toContain("data-visible={!open}")
    expect(navSource).toContain("data-visible={open}")
    expect(navSource).toContain(
      'aria-label={open ? "Close menu" : "Open menu"}'
    )

    const hiddenState = declarationsFor(".qc-state-icon__glyph")
    const visibleState = declarationsFor(
      '.qc-state-icon__glyph[data-visible="true"]'
    )

    expect(hiddenState.opacity).toBe("0")
    expect(hiddenState.scale).toBe("0.25")
    expect(hiddenState.filter).toBe("blur(4px)")
    expect(hiddenState["transition-property"]).toBe("opacity, scale, filter")
    expect(hiddenState["transition-duration"]).toBe("0.3s")
    expect(visibleState.opacity).toBe("1")
    expect(visibleState.scale).toBe("1")
    expect(visibleState.filter).toBe("blur(0)")
  })
})
