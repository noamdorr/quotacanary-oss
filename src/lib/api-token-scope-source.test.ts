import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const source = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8")

// QUO-187: the token form offers a scope choice. Read stays the default;
// write is opt-in and the list shows which tokens carry it.
describe("token scope choice", () => {
  const form = source("src/components/settings/ApiTokens.tsx")
  const settings = source("src/app/(dashboard)/settings/page.tsx")

  it("submits the choice as the scope field the action reads", () => {
    expect(form).toContain('name="scope"')
    expect(form).toContain('value="read"')
    expect(form).toContain('value="write"')
  })

  it("defaults to read, never to write", () => {
    const read = form.indexOf('value="read"')
    const write = form.indexOf('value="write"')
    const checked = form.indexOf("defaultChecked")
    expect(checked).toBeGreaterThan(-1)
    expect(Math.abs(checked - read)).toBeLessThan(Math.abs(checked - write))
    expect(form.match(/defaultChecked/g)).toHaveLength(1)
  })

  it("shows each active token's scope in the list", () => {
    expect(form).toContain('includes("write")')
    expect(settings).toMatch(/select\(\s*"id, name, token_hint, scopes,/)
  })

  it("no longer describes every token as read-only", () => {
    expect(settings).not.toContain("Read-only personal access tokens")
  })
})
