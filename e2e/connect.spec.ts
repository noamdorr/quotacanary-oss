import {
  MOCK_KEY_HEALTHY_AND_CRITICAL,
  MOCK_KEY_REJECTED,
  MOCK_TOOL_NAME,
} from "./fixtures/seed"
import { expect, signIn, test } from "./fixtures/test"

// Connection creation end to end, against the fixture tool whose adapter answers
// from the key instead of a vendor. This is the only spec that exercises the real
// connectTool path, credential validation, and the create RPC.

async function openMockToolModal(page: import("@playwright/test").Page) {
  await page.goto("/connect")
  await expect(
    page.getByRole("heading", { name: "Connect a tool" })
  ).toBeVisible()

  await page.getByPlaceholder(/^Search \d+ tools/).fill(MOCK_TOOL_NAME)
  const card = page
    .locator(".qc-connect-card")
    .filter({ hasText: MOCK_TOOL_NAME })
  await card.getByRole("button", { name: "Connect tool" }).click()

  await expect(
    page.getByRole("heading", { name: `Connect ${MOCK_TOOL_NAME}` })
  ).toBeVisible()
}

test("@smoke connecting a tool reads its balance and lands on the dashboard", async ({
  page,
  email,
}) => {
  await signIn(page, email)
  await page.getByRole("button", { name: "Skip for now" }).click()
  await openMockToolModal(page)

  await page.getByLabel("API key").fill(MOCK_KEY_HEALTHY_AND_CRITICAL)
  await page.getByLabel("Connection name").fill("Mock via UI")

  // A multi-pool tool asks which balances to watch, all checked by default.
  await expect(page.getByText("Track which balances?")).toBeVisible()

  await page.getByRole("button", { name: "Connect & check balance" }).click()

  await page.waitForURL(/\/dashboard\?connected=/)
  await expect(page.getByText("Mock via UI connected")).toBeVisible()
})

test("a rejected key surfaces the adapter's error and creates nothing", async ({
  page,
  email,
}) => {
  await signIn(page, email)
  await page.getByRole("button", { name: "Skip for now" }).click()
  await openMockToolModal(page)

  await page.getByLabel("API key").fill(MOCK_KEY_REJECTED)
  await page.getByLabel("Connection name").fill("Should not exist")
  await page.getByRole("button", { name: "Connect & check balance" }).click()

  await expect(page.getByRole("alert")).toContainText(
    "Mock tool rejected this key."
  )
  await expect(page).toHaveURL(/\/connect/)

  await page.goto("/dashboard")
  await expect(page.getByText("Should not exist")).toBeHidden()
})

test("the catalog search says so when nothing matches", async ({
  page,
  email,
}) => {
  await signIn(page, email)
  await page.getByRole("button", { name: "Skip for now" }).click()
  await page.goto("/connect")

  await page.getByPlaceholder(/^Search \d+ tools/).fill("zzzz-no-such-tool")
  await expect(page.getByText(/No tools match/)).toBeVisible()
  await expect(page.getByRole("button", { name: "Clear search" })).toBeVisible()
})
