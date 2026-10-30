import { IP_ORIGIN } from "./fixtures/stack"
import { expect, signIn, test } from "./fixtures/test"

// Hostname and IP deployments both keep authentication on the same origin.
test("@smoke an IP-hosted app redirects its root through dashboard to login", async ({
  page,
}) => {
  await page.goto(IP_ORIGIN)
  await expect(page).toHaveURL(`${IP_ORIGIN}/login?next=%2Fdashboard`)
})

test("@smoke an IP-hosted protected route stays on its own login origin", async ({
  page,
}) => {
  await page.goto(`${IP_ORIGIN}/settings`)
  await expect(page).toHaveURL(`${IP_ORIGIN}/login?next=%2Fsettings`)
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
