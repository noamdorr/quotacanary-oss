import { MARKETING_ORIGIN } from "./fixtures/stack"
import { expect, signIn, test } from "./fixtures/test"

// The host split is proxy-level and invisible to unit tests: `localhost` resolves
// to the app surface and `127.0.0.1` to the marketing surface, both against the
// same server. These are the cases a regression in resolveHost would break.

test("@smoke the marketing surface serves the public site", async ({
  page,
}) => {
  const response = await page.goto(MARKETING_ORIGIN)
  expect(response?.status()).toBe(200)
  await expect(page).toHaveTitle(/QuotaCanary/)
  await expect(page.locator("h1").first()).toBeVisible()
})

test("@smoke an app-only path on the marketing host does not serve the app", async ({
  page,
}) => {
  await page.goto(`${MARKETING_ORIGIN}/dashboard`)
  // An IP-literal host has no "app." sibling to redirect to, so the proxy sends
  // it to the marketing root rather than leaking an app route onto the public site.
  await expect(page).toHaveURL(`${MARKETING_ORIGIN}/`)
})

test("@smoke the app host serves the app and redirects its root to the dashboard", async ({
  page,
  email,
}) => {
  await signIn(page, email)
  await page.goto("/")
  await expect(page).toHaveURL(/\/dashboard/)
})

test("an already-authenticated user is bounced off the login page", async ({
  page,
  email,
}) => {
  await signIn(page, email)
  await page.goto("/login")
  await expect(page).toHaveURL(/\/dashboard/)
})

test("app routes are marked noindex so the app never gets crawled", async ({
  page,
}) => {
  const response = await page.goto("/login")
  expect(response?.headers()["x-robots-tag"]).toBe(
    "noindex, nofollow, noarchive"
  )
})
