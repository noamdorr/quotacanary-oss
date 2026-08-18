import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8")
}

const button = source("src/components/ui/button.tsx")
const badge = source("src/components/ui/badge.tsx")
const tabs = source("src/components/ui/tabs.tsx")
const dialog = source("src/components/ui/dialog.tsx")
const drawer = source("src/components/dashboard/ConnectionDrawer.tsx")
const launchVideo = source("src/components/marketing/LaunchVideoDialog.tsx")
const css = source("src/app/globals.css")

describe("shared control interaction contract", () => {
  it("gives shared buttons safe targets and restrained press feedback", () => {
    expect(button).toContain("min-h-10")
    expect(button).toContain("data-size={size}")
    expect(button).toContain("active:not-disabled:scale-[0.96]")
    expect(button).toContain("motion-reduce:active:not-disabled:scale-100")
    expect(button).toContain(
      "transition-[color,background-color,border-color,box-shadow,scale]"
    )
    expect(button).not.toContain("transition-all")
  })

  it("keeps interactive badges and tabs targetable, focused, and interruptible", () => {
    expect(badge).toContain('slot: "badge"')
    expect(badge).toContain("[a]:min-h-10")
    expect(badge).toContain("[a]:active:scale-[0.96]")
    expect(badge).toContain("focus-visible:ring-[3px]")
    expect(badge).not.toContain("transition-all")

    expect(tabs).toContain("min-h-10")
    expect(tabs).toContain("active:not-disabled:scale-[0.96]")
    expect(tabs).toContain("active:not-disabled:bg-muted/50")
    expect(tabs).toContain("focus-visible:ring-[3px]")
    expect(tabs).not.toContain("transition-all")
  })

  it("uses exact dialog transitions and a shared compact close action", () => {
    expect(dialog).toContain("transition-[opacity,scale]")
    expect(dialog).toContain("motion-reduce:data-[starting-style]:scale-100")
    expect(dialog).toContain("function DialogClose")
    expect(dialog).not.toContain("transition-all")

    expect(drawer).toContain("<DialogClose")
    expect(launchVideo).toContain("<DialogClose")
  })

  it("extends touch targets and removes press motion for reduced-motion users", () => {
    expect(css).toContain("@media (pointer: coarse)")
    expect(css).toContain('[data-slot="button"]')
    expect(css).toContain('[data-slot="tabs-trigger"]')
    expect(css).toContain('[data-slot="badge"]:is(a)')
    expect(css).toContain(".btn:focus-visible")
    expect(css).toContain(".btn:active")
    expect(css).toContain("scale: 0.96")

    const reducedMotion = css.slice(
      css.indexOf("@media (prefers-reduced-motion: reduce)")
    )
    expect(reducedMotion).toContain(".btn:active")
    expect(reducedMotion).toContain("scale: 1")
  })
})
