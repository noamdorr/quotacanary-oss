import { serviceClient } from "./fixtures/stack"
import {
  expect,
  profileFor,
  seedMockConnection,
  signIn,
  test,
} from "./fixtures/test"

// A hostname in the reserved .invalid TLD: it passes the destination validator
// (public, HTTPS) but can never resolve, so a delivery attempt fails locally
// without this suite ever making an outbound request to a real host.
const UNREACHABLE_WEBHOOK = "https://hooks.e2e.invalid/target"

// Both destructive confirmations are portalled dialogs whose buttons repeat the
// row's label, so every confirm is scoped to the dialog rather than picked by
// position.
function dialog(page: import("@playwright/test").Page) {
  return page.locator('[data-slot="dialog-content"]')
}

async function addDestination(
  page: import("@playwright/test").Page,
  name: string
) {
  await page.getByLabel("Name", { exact: true }).fill(name)
  await page.getByLabel("Webhook URL").fill(UNREACHABLE_WEBHOOK)
  await page.getByRole("button", { name: "Add destination" }).click()
  await expect(page.getByText(name)).toBeVisible()
}

test.beforeEach(async ({ page, email }) => {
  await signIn(page, email)
  await seedMockConnection(email)
  await page.goto("/settings")
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible()
})

test("@smoke a webhook destination can be added and shows its one-time secret", async ({
  page,
}) => {
  await addDestination(page, "E2E Ops")
  await expect(
    page.getByText("Copy this signing secret now - you won't see it again")
  ).toBeVisible()
})

test("a non-HTTPS destination is refused", async ({ page }) => {
  await page.getByLabel("Name", { exact: true }).fill("Insecure")
  await page.getByLabel("Webhook URL").fill("http://hooks.e2e.invalid/target")
  await page.getByRole("button", { name: "Add destination" }).click()

  await expect(page.getByText("Use a public HTTPS webhook URL.")).toBeVisible()
})

test("@smoke destination rotation, toggling, and test health persist with scoped grants", async ({
  page,
  email,
}) => {
  await addDestination(page, "E2E Grants")
  const { id: userId } = await profileFor(email)
  async function destination() {
    const { data, error } = await serviceClient()
      .from("alert_destinations")
      .select(
        "is_enabled, encrypted_signing_secret, signing_secret_set_at, updated_at, last_attempt_at, last_sent_at, last_error, consecutive_failures"
      )
      .eq("user_id", userId)
      .single()
    if (error || !data)
      throw new Error("Could not read the fixture destination")
    return data
  }

  const original = await destination()
  await page.getByRole("button", { name: "Rotate secret" }).click()
  await expect
    .poll(async () => (await destination()).encrypted_signing_secret)
    .not.toBe(original.encrypted_signing_secret)
  const rotated = await destination()
  expect(rotated.signing_secret_set_at).not.toBe(original.signing_secret_set_at)
  expect(rotated.updated_at).not.toBe(original.updated_at)

  await page.getByRole("button", { name: "Disable", exact: true }).click()
  await expect.poll(async () => (await destination()).is_enabled).toBe(false)
  await page.getByRole("button", { name: "Enable", exact: true }).click()
  await expect.poll(async () => (await destination()).is_enabled).toBe(true)
  const beforeTest = await destination()

  // Expected DNS failure, with a real authenticated health write afterwards.
  // This must persist even when the probe itself does not succeed.
  await page.getByRole("button", { name: "Send test" }).click()
  await expect(page.getByText(/Test delivery failed/)).toBeVisible()
  const afterTest = await destination()
  expect(afterTest.last_attempt_at).not.toBeNull()
  expect(afterTest.last_error).toBe("Webhook request failed.")
  expect(afterTest.last_sent_at).toBeNull()
  expect(afterTest.consecutive_failures).toBe(beforeTest.consecutive_failures)
  expect(afterTest.updated_at).toBe(beforeTest.updated_at)
})

test("a destination can be removed after confirming", async ({ page }) => {
  await addDestination(page, "E2E Doomed")

  await page.getByRole("button", { name: "Remove", exact: true }).click()
  await expect(dialog(page).getByText("Remove E2E Doomed?")).toBeVisible()
  await dialog(page).getByRole("button", { name: "Remove" }).click()

  await expect(page.getByText("No webhook destinations yet.")).toBeVisible()
})

test("@smoke an API token can be created and revoked", async ({ page }) => {
  await page.getByLabel("Token name").fill("E2E Client")
  await page.getByRole("button", { name: "Create token" }).click()

  await expect(
    page.getByText("Copy this token now - you won't see it again")
  ).toBeVisible()
  await expect(page.getByText("E2E Client")).toBeVisible()

  await page.getByRole("button", { name: "Revoke", exact: true }).click()
  // The title uses typographic quotes (&ldquo;/&rdquo;), not ASCII ones.
  await expect(dialog(page).getByText("Revoke “E2E Client”?")).toBeVisible()
  await dialog(page).getByRole("button", { name: "Revoke" }).click()

  await expect(page.getByText("No active tokens yet.")).toBeVisible()
})

test("email notification preference persists", async ({ page, email }) => {
  // The mode buttons carry no pressed state, so the assertion is against the
  // stored preference rather than a visual class.
  await page.getByRole("button", { name: "Off" }).click()
  await expect
    .poll(async () => (await profileFor(email)).notify_mode)
    .toBe("off")
})

test("signing out from settings ends the session", async ({ page }) => {
  // Two "Sign out" buttons render here: the dashboard header's, then the
  // Account card's. The Account one is last in document order.
  await page.getByRole("button", { name: "Sign out" }).last().click()
  await page.waitForURL(/\/login/)

  await page.goto("/settings")
  await expect(page).toHaveURL(/\/login/)
})
