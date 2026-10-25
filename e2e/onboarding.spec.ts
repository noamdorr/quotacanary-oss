import { expect, signIn, test } from "./fixtures/test"

// A brand-new account has no connections, so /dashboard renders OnboardingFlow
// instead of the dashboard. Creating a connection is covered in connect.spec.ts:
// onboarding's tool chips are a curated featured list that the fixture tool is
// deliberately not part of, and every real tool there needs a live vendor key.

test("@smoke a brand-new account is met by onboarding, not an empty dashboard", async ({
  page,
  email,
}) => {
  await signIn(page, email)

  await expect(
    page.getByRole("heading", { name: "Welcome to QuotaCanary" })
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "Get started" })).toBeVisible()
})

test("onboarding offers a tool to connect and a way into the full catalog", async ({
  page,
  email,
}) => {
  await signIn(page, email)
  await page.getByRole("button", { name: "Get started" }).click()

  await expect(
    page.getByRole("heading", { name: "Connect your first tool" })
  ).toBeVisible()

  const catalogLink = page.getByRole("link", { name: /See all \d+ tools/ })
  await expect(catalogLink).toBeVisible()
  await catalogLink.click()
  await expect(page).toHaveURL(/\/connect/)
})

test("skipping onboarding leaves the dashboard in its empty state", async ({
  page,
  email,
}) => {
  await signIn(page, email)
  await page.getByRole("button", { name: "Skip for now" }).click()

  await expect(page.getByText("No tools connected yet")).toBeVisible()
  await expect(page.getByRole("link", { name: "Connect a tool" })).toBeVisible()
})

test("@smoke onboarding requires a watched balance and resets defaults when switching tools", async ({
  page,
  email,
}) => {
  await signIn(page, email)
  await page.getByRole("button", { name: "Get started" }).click()
  await page.getByRole("button", { name: "Hunter", exact: true }).click()
  // This test never submits these synthetic credentials to a vendor.
  await page.getByLabel("API key").fill("not-a-vendor-key")
  const pools = page.getByRole("group", { name: "Track which balances?" })
  const checkboxes = pools.getByRole("checkbox")
  const submit = page.getByRole("button", { name: "Connect & check balance" })
  expect(await checkboxes.count()).toBeGreaterThan(1)
  for (const checkbox of await checkboxes.all()) {
    await expect(checkbox).toBeChecked()
    await checkbox.uncheck()
  }
  await expect(submit).toBeDisabled()
  await expect(pools.getByRole("alert")).toHaveText(
    "Choose at least one balance to track."
  )
  await checkboxes.first().check()
  await expect(submit).toBeEnabled()
  await expect(pools.getByRole("alert")).toBeHidden()

  await page.getByRole("button", { name: "NeverBounce", exact: true }).click()
  await expect(pools).toBeHidden()
  await page.getByLabel("API key").fill("not-a-vendor-key")
  await expect(submit).toBeEnabled()
  await page.getByRole("button", { name: "Hunter", exact: true }).click()
  for (const checkbox of await checkboxes.all()) {
    await expect(checkbox).toBeChecked()
  }
})
