import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { buildSignatureHeader } from "./signing"

// The webhook docs publish a verify() a receiver is meant to copy into their
// own service. Asserting the page merely *contains* the word "timingSafeEqual"
// would not catch the failure that matters: the snippet drifting away from
// what the sender actually signs. So lift the snippet out of the page source,
// run it, and point it at a real header from buildSignatureHeader. If the two
// ever disagree, this test fails rather than every receiver in the wild.
const page = readFileSync(
  resolve(process.cwd(), "src/app/(public)/docs/page.tsx"),
  "utf8"
)

function publishedVerifier(): (
  rawBody: string,
  header: string | null,
  secret: string
) => boolean {
  const start = page.indexOf('const crypto = require("node:crypto")')
  expect(
    start,
    "the docs no longer publish a verify() snippet"
  ).toBeGreaterThan(-1)
  // The snippet lives in a JSX template literal, so it ends at the closing
  // backtick that terminates the <pre> block.
  const end = page.indexOf("`}</pre>", start)
  expect(end, "could not find the end of the docs snippet").toBeGreaterThan(
    start
  )
  const snippet = page.slice(start, end)

  // `require` is not available in this ESM test module, so hand the snippet the
  // real node:crypto directly. Everything else runs exactly as published.
  const factory = new Function(
    "crypto",
    `${snippet.replace('const crypto = require("node:crypto")', "")}
     return verify`
  )
  return factory(require("node:crypto"))
}

describe("the published webhook verification snippet", () => {
  const verify = publishedVerifier()
  const secret = "qcwh_contract_check"
  const body = JSON.stringify({ event: "quota.alert.low", id: "evt-1" })
  const now = () => Math.floor(Date.now() / 1000)
  const headerAt = (t: number) =>
    buildSignatureHeader({ secret, body, timestampSeconds: t })

  it("accepts a delivery signed the way the sender signs it", () => {
    expect(verify(body, headerAt(now()), secret)).toBe(true)
  })

  it("rejects a body altered in transit", () => {
    expect(verify(`${body} `, headerAt(now()), secret)).toBe(false)
  })

  it("rejects a signature forged with the wrong secret", () => {
    expect(verify(body, headerAt(now()), "qcwh_attacker")).toBe(false)
  })

  it("rejects a missing signature header", () => {
    expect(verify(body, null, secret)).toBe(false)
  })

  it("rejects a delivery replayed after the documented tolerance", () => {
    expect(verify(body, headerAt(now() - 301), secret)).toBe(false)
  })

  it("rejects an old signature re-stamped with a fresh timestamp", () => {
    const old = headerAt(now() - 3600).split("v1=")[1]
    expect(verify(body, `t=${now()},v1=${old}`, secret)).toBe(false)
  })
})
