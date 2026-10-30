import { IP_ORIGIN } from "./fixtures/stack"
import { expect, signIn, test } from "./fixtures/test"

// The Content-Security-Policy carries a per-request nonce and no
// 'unsafe-inline', so an inline script only runs when Next stamped it with
// the nonce during a dynamic render. Static prerenders would silently break
// hydration under this policy, which is what these tests exist to catch.

const NONCE = /'nonce-([A-Za-z0-9+/]+={0,2})'/

// Every CSP violation the browser reports from the first byte on. Registered
// before navigation so nothing during load is missed. The collector lives on
// the document, so read it BEFORE each navigation: the next page starts from
// an empty list.
async function collectViolations(page: Parameters<typeof signIn>[0]) {
  await page.addInitScript(() => {
    const w = window as unknown as { __cspViolations: string[] }
    w.__cspViolations = []
    document.addEventListener("securitypolicyviolation", (e) => {
      w.__cspViolations.push(
        `${e.violatedDirective} ${e.blockedURI || "inline"}`
      )
    })
  })
  return () =>
    page.evaluate(
      () => (window as unknown as { __cspViolations: string[] }).__cspViolations
    )
}

async function hydrated(page: Parameters<typeof signIn>[0]) {
  await page.waitForFunction(() =>
    Boolean(
      (window as unknown as { next?: { version?: string } }).next?.version
    )
  )
  return page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll("script"))
    return {
      scripts: scripts.length,
      unnonced: scripts.filter((s) => !s.nonce).length,
    }
  })
}

test("@smoke the policy carries a fresh nonce per request and no unsafe-inline", async ({
  page,
}) => {
  const first = await page.goto(`${IP_ORIGIN}/docs`)
  const csp = first?.headers()["content-security-policy"] ?? ""
  expect(csp).toMatch(NONCE)
  expect(csp).not.toContain("'unsafe-inline'")
  expect(csp).toContain("object-src 'none'")

  const second = await page.goto(`${IP_ORIGIN}/docs`)
  const again = second?.headers()["content-security-policy"] ?? ""
  expect(NONCE.exec(again)?.[1]).not.toBe(NONCE.exec(csp)?.[1])
})

test("@smoke the public self-host docs hydrate under the nonce with zero violations", async ({
  page,
}) => {
  const violations = await collectViolations(page)
  await page.goto(`${IP_ORIGIN}/docs`)
  const home = await hydrated(page)
  expect(home.scripts).toBeGreaterThan(0)
  expect(home.unnonced).toBe(0)
  expect(await violations()).toEqual([])

  await page.goto(`${IP_ORIGIN}/security`)
  expect((await hydrated(page)).unnonced).toBe(0)
  expect(await violations()).toEqual([])
})

test("@smoke the app hydrates under the nonce with zero violations", async ({
  page,
  email,
}) => {
  const violations = await collectViolations(page)
  await page.goto("/login")
  expect((await hydrated(page)).unnonced).toBe(0)
  expect(await violations()).toEqual([])

  await signIn(page, email)
  await page.goto("/dashboard")
  expect((await hydrated(page)).unnonced).toBe(0)
  expect(await violations()).toEqual([])
})

test("an inline script without the nonce is blocked", async ({ page }) => {
  const violations = await collectViolations(page)
  await page.goto(`${IP_ORIGIN}/docs`)
  await hydrated(page)
  const ran = await page.evaluate(async () => {
    const w = window as unknown as { __injected?: number }
    const script = document.createElement("script")
    script.textContent = "window.__injected = 1"
    document.body.appendChild(script)
    await new Promise((r) => setTimeout(r, 300))
    return w.__injected ?? 0
  })
  expect(ran).toBe(0)
  expect(await violations()).toEqual(["script-src-elem inline"])
})
