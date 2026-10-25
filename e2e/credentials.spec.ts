import { E2E_MOCK_TOOL_ID } from "../src/lib/adapters/e2e-mock"
import { expect, seedMockConnection, signIn, test } from "./fixtures/test"

// The rendered side of CredentialFields that node-side tests cannot reach:
// blur-driven validation, and label targets staying unique when several rekey
// forms are open on one page. Submitting keys is covered in connect.spec.ts.

test("@smoke onboarding reports a missing key only after the field is left", async ({
  page,
  email,
}) => {
  await signIn(page, email)
  await page.getByRole("button", { name: "Get started" }).click()
  await page.getByRole("button", { name: "Hunter", exact: true }).click()

  const key = page.getByRole("textbox", { name: "API key" })
  const error = page
    .getByRole("alert")
    .filter({ hasText: "API key is required." })
  await expect(key).not.toHaveAttribute("aria-invalid")
  await expect(error).toBeHidden()

  await key.focus()
  await key.blur()
  await expect(error).toBeVisible()
  await expect(key).toHaveAttribute("aria-invalid", "true")
  const errorId = await error.getAttribute("id")
  const describedBy = (await key.getAttribute("aria-describedby")) ?? ""
  expect(describedBy.split(" ")).toContain(errorId)

  // This test never submits these synthetic credentials to a vendor.
  await key.fill("not-a-vendor-key")
  await expect(error).toBeHidden()
  await expect(key).not.toHaveAttribute("aria-invalid")
})

test("@smoke two open rekey forms on the tools page keep their own labels", async ({
  page,
  email,
}) => {
  await signIn(page, email)
  await seedMockConnection(email, "First Mock")
  await seedMockConnection(email, "Second Mock")
  await page.goto(`/tools/${E2E_MOCK_TOOL_ID}`)

  const toggles = page.getByRole("button", { name: "Update key" })
  await expect(toggles).toHaveCount(2)
  await toggles.nth(0).click()
  await toggles.nth(1).click()

  const keys = page.getByRole("textbox", { name: "API key" })
  await expect(keys).toHaveCount(2)
  const ids = await keys.evaluateAll((inputs) => inputs.map((i) => i.id))
  expect(new Set(ids).size).toBe(2)
  for (const id of ids) {
    await expect(page.locator(`label[for="${id}"]`)).toHaveText("API key")
  }
})
