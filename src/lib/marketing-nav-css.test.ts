import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8")

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
})
