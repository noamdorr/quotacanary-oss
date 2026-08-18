import type { Page } from "@playwright/test"
import { waitForMagicLink } from "./fixtures/mailpit"
import { MOCK_KEY_HEALTHY_AND_CRITICAL, MOCK_TOOL_NAME } from "./fixtures/seed"
import { expect, seedMockConnection, signIn, test } from "./fixtures/test"

// The funnel events (QUO-15) call window.plausible at the moment they fire.
// The hosted deployment injects that function via the Plausible snippet; here
// a stub planted before every document records the calls instead, so each
// event is asserted at its real trigger inside the real flow. A hard
// navigation resets the recorder, so every assertion reads the array in the
// document where the event fired.
declare global {
  interface Window {
    __plausible: [string, unknown?][]
  }
}

async function recordedEvents(page: Page): Promise<[string, unknown?][]> {
  return page.evaluate(() => window.__plausible ?? [])
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__plausible = []
    // Same shape the snippet exposes: (eventName, options?).
    ;(window as unknown as Record<string, unknown>).plausible = (
      name: string,
      options?: unknown
    ) => {
      window.__plausible.push(options ? [name, options] : [name])
    }
  })
})

test("the signup and onboarding funnel reports each step", async ({
  page,
  email,
}) => {
  // Signup Started fires only once the magic link is actually away.
  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByRole("button", { name: "Send magic link" }).click()
  await expect(page.getByText("A sign-in link is on its way to")).toBeVisible()
  expect(await recordedEvents(page)).toEqual([["Signup Started"]])

  // Following the emailed link lands the fresh account on onboarding, which
  // is the "signup completed" observation point.
  const link = await waitForMagicLink(email)
  await page.goto(link)
  await page.waitForURL(/\/dashboard/)
  await expect(
    page.getByRole("heading", { name: "Welcome to QuotaCanary" })
  ).toBeVisible()
  expect(await recordedEvents(page)).toContainEqual(["Signup Completed"])

  await page.getByRole("button", { name: "Get started" }).click()
  expect(await recordedEvents(page)).toContainEqual(["Onboarding Started"])

  await page.getByRole("button", { name: "Skip for now" }).click()
  await expect(page.getByText("No tools connected yet")).toBeVisible()
  expect(await recordedEvents(page)).toContainEqual(["Onboarding Completed"])
})

test("a successful connect reports the tool that connected", async ({
  page,
  email,
}) => {
  await signIn(page, email)
  await page.getByRole("button", { name: "Skip for now" }).click()

  await page.goto("/connect")
  await page.getByPlaceholder(/^Search \d+ tools/).fill(MOCK_TOOL_NAME)
  await page
    .locator(".qc-connect-card")
    .filter({ hasText: MOCK_TOOL_NAME })
    .getByRole("button", { name: "Connect tool" })
    .click()
  await page.getByLabel("API key").fill(MOCK_KEY_HEALTHY_AND_CRITICAL)
  await page.getByLabel("Connection name").fill("Funnel Mock")
  await page.getByRole("button", { name: "Connect & check balance" }).click()

  // router.push is a soft navigation, so the recorder survives into the
  // dashboard and still holds the event fired at the moment of success.
  await page.waitForURL(/\/dashboard\?connected=/)
  expect(await recordedEvents(page)).toContainEqual([
    "Connection Created",
    { props: { tool: "qc-e2e-mock" } },
  ])
})

test("requesting an unsupported tool is counted without its free-text name", async ({
  page,
  email,
}) => {
  await signIn(page, email)
  await page.getByRole("button", { name: "Skip for now" }).click()

  await page.goto("/connect")
  await page.getByRole("button", { name: "Request a tool" }).click()
  await page.getByLabel("Tool name").fill("Funnel Probe Tool")
  await page.getByRole("button", { name: "Submit request" }).click()
  await expect(page.getByText(/Got it/)).toBeVisible()

  expect(await recordedEvents(page)).toContainEqual(["Tool Requested"])
})

test("creating an alert destination is counted, a refused one is not", async ({
  page,
  email,
}) => {
  await signIn(page, email)
  await seedMockConnection(email)
  await page.goto("/settings")

  await page.getByLabel("Name", { exact: true }).fill("Insecure")
  await page.getByLabel("Webhook URL").fill("http://hooks.e2e.invalid/target")
  await page.getByRole("button", { name: "Add destination" }).click()
  await expect(page.getByText("Use a public HTTPS webhook URL.")).toBeVisible()
  expect(await recordedEvents(page)).not.toContainEqual([
    "Alert Destination Created",
  ])

  // The action reset the form, so both fields need filling again.
  await page.getByLabel("Name", { exact: true }).fill("Funnel Hook")
  await page.getByLabel("Webhook URL").fill("https://hooks.e2e.invalid/target")
  await page.getByRole("button", { name: "Add destination" }).click()
  await expect(page.getByText("Funnel Hook")).toBeVisible()
  expect(await recordedEvents(page)).toContainEqual([
    "Alert Destination Created",
  ])
})
