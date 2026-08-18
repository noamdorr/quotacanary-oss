import type { Page } from "@playwright/test"
import { expect, seedMockConnection, signIn, test } from "./fixtures/test"

// The fixture connection carries two pools: 5000 primary and 120 secondary,
// against the mock tool's 900 low / 300 critical thresholds. That gives one
// healthy row and one critical row from a single connection, which is the
// property most worth pinning: the dashboard renders one row per POOL, and a
// regression to one row per connection would show a single row here.
//
// The dashboard renders BOTH layouts into the DOM and picks one with a CSS
// breakpoint, so every label matches twice. Assertions filter to the visible
// copy rather than guessing at document order.
function onScreen(page: Page, text: string) {
  return page.getByText(text).filter({ visible: true })
}

// Only the table rows carry this accessible name, so it counts pool rows without
// double-counting the hidden card layout.
function poolRows(page: Page) {
  return page.getByRole("button", { name: /Open .* details/ })
}

test("@smoke one connection with two pools renders two rows, one per pool", async ({
  page,
  email,
}) => {
  await signIn(page, email)
  await seedMockConnection(email, "Two Pool Fixture")
  await page.goto("/dashboard")

  await expect(poolRows(page)).toHaveCount(2)
  await expect(onScreen(page, "Primary Credits")).toBeVisible()
  await expect(onScreen(page, "Secondary Credits")).toBeVisible()
})

test("@smoke each pool reports its own status against the tool's thresholds", async ({
  page,
  email,
}) => {
  await signIn(page, email)
  await seedMockConnection(email, "Status Fixture")
  await page.goto("/dashboard")

  await expect(onScreen(page, "Healthy")).toBeVisible()
  await expect(onScreen(page, "Critical")).toBeVisible()
})

test("opening a row shows its detail drawer", async ({ page, email }) => {
  await signIn(page, email)
  await seedMockConnection(email, "Drawer Fixture")
  await page.goto("/dashboard")

  await poolRows(page).first().click()
  await expect(
    page.getByRole("button", { name: "Save thresholds" })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Remove connection" })
  ).toBeVisible()
})

test("filtering to healthy hides the critical pool", async ({
  page,
  email,
}) => {
  await signIn(page, email)
  await seedMockConnection(email, "Filter Fixture")
  await page.goto("/dashboard")

  await page.getByLabel("Filter by status").selectOption("healthy")
  await expect(poolRows(page)).toHaveCount(1)
  await expect(onScreen(page, "Primary Credits")).toBeVisible()
})
