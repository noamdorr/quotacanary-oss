import {
  MOCK_KEY_HEALTHY_AND_CRITICAL,
  MOCK_KEY_REJECTED,
  MOCK_TOOL_NAME,
} from "./fixtures/seed"
import { serviceClient } from "./fixtures/stack"
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

test("@smoke a multi-pool connection requires a selection and saves only the chosen pool", async ({
  page,
  email,
}) => {
  await signIn(page, email)
  await page.getByRole("button", { name: "Skip for now" }).click()
  await openMockToolModal(page)
  await page.getByLabel("API key").fill(MOCK_KEY_HEALTHY_AND_CRITICAL)
  const primary = page.getByRole("checkbox", { name: "Primary Credits" })
  const secondary = page.getByRole("checkbox", { name: "Secondary Credits" })
  const submit = page.getByRole("button", { name: "Connect & check balance" })
  await expect(primary).toBeChecked()
  await expect(secondary).toBeChecked()
  await primary.uncheck()
  await secondary.uncheck()
  await expect(submit).toBeDisabled()
  await expect(page.getByRole("alert")).toHaveText(
    "Choose at least one balance to track."
  )

  // Closing and reopening starts a fresh attempt with the intentional defaults.
  await page.keyboard.press("Escape")
  await openMockToolModal(page)
  await expect(primary).toBeChecked()
  await expect(secondary).toBeChecked()
  await page.getByLabel("API key").fill(MOCK_KEY_HEALTHY_AND_CRITICAL)
  await primary.uncheck()
  await secondary.uncheck()
  await secondary.check()
  await expect(page.getByRole("alert")).toBeHidden()
  await expect(submit).toBeEnabled()
  await submit.click()
  await page.waitForURL(/\/dashboard\?connected=/)

  const connectionId = new URL(page.url()).searchParams.get("connected")
  const { data, error } = await serviceClient()
    .from("connections")
    .select("watched_credit_types")
    .eq("id", connectionId)
    .single()
  expect(error).toBeNull()
  expect(data?.watched_credit_types).toEqual(["secondary"])
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

test("@smoke connection permissions preserve edits, key rotation, and manual refresh", async ({
  page,
  email,
}) => {
  const admin = serviceClient()
  await signIn(page, email)
  await page.getByRole("button", { name: "Skip for now" }).click()
  await openMockToolModal(page)
  await page.getByLabel("API key").fill(MOCK_KEY_HEALTHY_AND_CRITICAL)
  await page.getByLabel("Connection name").fill("Grant fixture")
  await page.getByRole("button", { name: "Connect & check balance" }).click()
  await page.waitForURL(/\/dashboard\?connected=/)
  const id = new URL(page.url()).searchParams.get("connected")
  if (!id) throw new Error("Missing new connection ID")
  async function connection() {
    const { data, error } = await admin
      .from("connections")
      .select(
        "name, encrypted_key, key_hint, alert_enabled, pool_thresholds, status, last_error, consecutive_failures"
      )
      .eq("id", id)
      .single()
    expect(error).toBeNull()
    if (!data) throw new Error("Missing connection row")
    return data
  }

  await page.goto("/tools/qc-e2e-mock")
  await page.getByRole("button", { name: "Grant fixture", exact: true }).click()
  await page.locator('input[name="name"]').fill("Renamed fixture")
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect
    .poll(async () => (await connection()).name)
    .toBe("Renamed fixture")

  await page.goto("/alerts")
  await page.getByRole("button", { name: "On", exact: true }).click()
  await expect.poll(async () => (await connection()).alert_enabled).toBe(false)
  await page.getByRole("button", { name: "Off", exact: true }).click()
  await expect.poll(async () => (await connection()).alert_enabled).toBe(true)

  await page.goto("/dashboard")
  await page
    .getByRole("button", { name: "Open Renamed fixture details" })
    .and(page.locator('[data-pool-row-key$=":primary"]'))
    .click()
  await page.getByRole("textbox", { name: "Warn below" }).fill("1500")
  await page.getByRole("button", { name: "Save thresholds" }).click()
  await expect
    .poll(async () => (await connection()).pool_thresholds)
    .toEqual({
      primary: { low: 1500, critical: 500 },
    })

  // Represent a corrupt stored key without calling any vendor. This forces the
  // shared helper's authenticated failure write, which the old audit missed.
  const { error } = await admin
    .from("connections")
    .update({ encrypted_key: "malformed-test-ciphertext" })
    .eq("id", id)
  expect(error).toBeNull()
  await page.getByRole("button", { name: "Refresh now" }).click()
  await expect
    .poll(async () => {
      const c = await connection()
      return {
        status: c.status,
        failures: c.consecutive_failures,
        error: c.last_error,
      }
    })
    .toEqual({
      status: "error",
      failures: 1,
      error: "Couldn't read this connection's balance.",
    })

  await page.getByRole("button", { name: "Update key", exact: true }).click()
  await page.getByLabel("API key", { exact: true }).fill(MOCK_KEY_REJECTED)
  await page.getByRole("button", { name: "Save new credentials" }).click()
  await expect(
    page.getByText("Mock tool rejected this key.", { exact: true })
  ).toBeVisible()
  expect((await connection()).encrypted_key).toBe("malformed-test-ciphertext")

  await page.getByLabel("API key", { exact: true }).fill("qc_e2e_9000_1500")
  await page.getByRole("button", { name: "Save new credentials" }).click()
  await expect(page.getByText("Key updated.", { exact: true })).toBeVisible()
  const rotated = await connection()
  expect(rotated.encrypted_key).not.toBe("malformed-test-ciphertext")
  expect(rotated.encrypted_key).not.toBe("qc_e2e_9000_1500")
  expect(rotated.key_hint).toBe("1500")
  expect(rotated.status).toBe("active")
  expect(rotated.last_error).toBeNull()

  await page.getByRole("button", { name: "Refresh now" }).click()
  await expect
    .poll(async () => (await connection()).consecutive_failures)
    .toBe(0)
  const { data: readings, error: readError } = await admin
    .from("balances")
    .select("credit_type, balance")
    .eq("connection_id", id)
    .order("recorded_at", { ascending: false })
    .limit(2)
  expect(readError).toBeNull()
  expect(readings).toEqual(
    expect.arrayContaining([
      { credit_type: "primary", balance: 9000 },
      { credit_type: "secondary", balance: 1500 },
    ])
  )
})
