import type { Page } from "@playwright/test"
import { serviceClient } from "./fixtures/stack"
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

test("the drawer edits one Warn below number and says when saving moves an older red point", async ({
  page,
  email,
}) => {
  const admin = serviceClient()
  await signIn(page, email)
  const id = await seedMockConnection(email, "Red Point Fixture")
  // An override from the two-field editor that is not a third.
  const { error } = await admin
    .from("connections")
    .update({ pool_thresholds: { primary: { low: 800, critical: 200 } } })
    .eq("id", id)
  expect(error).toBeNull()
  async function poolThresholds() {
    const { data } = await admin
      .from("connections")
      .select("pool_thresholds")
      .eq("id", id)
      .single()
    return data?.pool_thresholds
  }
  await page.goto("/dashboard")

  await poolRows(page)
    .and(page.locator('[data-pool-row-key$=":primary"]'))
    .click()
  const warnBelow = page.getByRole("textbox", { name: "Warn below" })
  await expect(warnBelow).toHaveValue("800")
  await expect(page.getByRole("dialog").getByRole("textbox")).toHaveCount(1)
  // The stored red point is shown as it is, with what Save would do to it.
  const redPoint = page.locator("#warn-below-red-point")
  await expect(redPoint).toHaveText("Turns red at 200. Saving sets it to 266.")

  await warnBelow.fill("0")
  await expect(redPoint).toHaveText("Turns red at 200.")
  await page.getByRole("button", { name: "Save thresholds" }).click()
  await expect(page.getByRole("alert")).toContainText("above zero")
  expect(await poolThresholds()).toEqual({
    primary: { low: 800, critical: 200 },
  })

  await warnBelow.fill("1000")
  await expect(redPoint).toHaveText("Turns red at 200. Saving sets it to 333.")
  await page.getByRole("button", { name: "Save thresholds" }).click()
  await expect
    .poll(poolThresholds)
    .toEqual({ primary: { low: 1000, critical: 333 } })
  await expect(redPoint).toHaveText("Turns red at 333, a third of that.")

  // Blank removes the override, so the balance falls back to the tool default.
  await warnBelow.fill("")
  await expect(redPoint).toHaveText("Turns red at 333. Saving sets it to 300.")
  await page.getByRole("button", { name: "Save thresholds" }).click()
  await expect.poll(poolThresholds).toEqual({})
  await expect(redPoint).toHaveText("Turns red at 300.")
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

// The warning number used to be reachable only through the unlabelled row
// click. These pin the three labelled ways in: the table column, the card
// footer on a phone, and the confirmation after a first connection.
test("a row's Warn below number opens its drawer, by mouse and by keyboard", async ({
  page,
  email,
}) => {
  await signIn(page, email)
  await seedMockConnection(email, "Entry Fixture")
  await page.goto("/dashboard")

  await expect(page.getByText("Warn below", { exact: true })).toBeVisible()
  const row = page
    .locator('[data-pool-row-key$=":primary"]')
    .filter({ visible: true })
    .locator("..")
  await expect(row).toContainText("default")
  await expect(row).toContainText("red at 300")

  const action = page.getByRole("button", {
    name: "Warn below 900, red at 300, default. Change it for Entry Fixture, Primary Credits",
  })
  await expect(action).toHaveText("900")
  const drawer = page.getByRole("dialog", { name: "Entry Fixture" })
  await action.click()
  await expect(drawer).toBeVisible()
  await expect(drawer).toContainText("Primary Credits")
  await page.keyboard.press("Escape")
  await expect(drawer).toBeHidden()

  // One Tab on from the row's own button, so it is a real tab stop.
  await page
    .locator('[data-pool-row-key$=":primary"]')
    .filter({ visible: true })
    .focus()
  await page.keyboard.press("Tab")
  await expect(action).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(drawer).toBeVisible()
})

test("on a phone the card names the warning and opens the drawer", async ({
  page,
  email,
}) => {
  await signIn(page, email)
  await seedMockConnection(email, "Card Fixture")
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/dashboard")

  await expect(poolRows(page)).toHaveCount(0)
  const card = page
    .locator('[data-pool-row-key$=":primary"]')
    .filter({ visible: true })
  await expect(card).toContainText("Warn below 900 · default · red at 300")
  await card.click()
  await expect(page.getByRole("dialog", { name: "Card Fixture" })).toBeVisible()
})

test("the first connection's confirmation points at the warning number", async ({
  page,
  email,
}) => {
  await signIn(page, email)
  const id = await seedMockConnection(email, "First Fixture")
  await page.goto(`/dashboard?connected=${id}`)

  const confirmation = page
    .locator("section")
    .filter({ hasText: "First Fixture connected" })
  const hint = "Each balance warns you below its number."
  await expect(confirmation).toContainText(hint)

  // The card lists the new connection whatever the filters say, so its button
  // has to work while the table is hiding that balance.
  await page.getByLabel("Filter by status").selectOption("healthy")
  await expect(poolRows(page)).toHaveCount(1)
  await confirmation
    .getByRole("button", {
      name: /Change it for First Fixture, Secondary Credits$/,
    })
    .click()
  const drawer = page.getByRole("dialog", { name: "First Fixture" })
  await expect(drawer).toBeVisible()
  await expect(drawer).toContainText("Secondary Credits")
  await page.keyboard.press("Escape")

  // A second connection is confirmed without the first-run line.
  const second = await seedMockConnection(email, "Second Fixture")
  await page.goto(`/dashboard?connected=${second}`)
  const later = page
    .locator("section")
    .filter({ hasText: "Second Fixture connected" })
  await expect(
    later.getByRole("button", {
      name: /Change it for Second Fixture, Primary Credits$/,
    })
  ).toBeVisible()
  await expect(later).not.toContainText(hint)
})
