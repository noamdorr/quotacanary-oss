import type { Page } from "@playwright/test"
import { E2E_MOCK_TOOL_ID } from "../src/lib/adapters/e2e-mock"
import {
  MOCK_KEY_HEALTHY_AND_CRITICAL,
  MOCK_KEY_REJECTED,
  MOCK_TOOL_NAME,
} from "./fixtures/seed"
import { expect, signIn, test } from "./fixtures/test"

// A connect attempt that is still in flight must own its surface until it
// settles, or its late result lands on whatever the user moved on to. These
// specs hold the connectTool server-action request open to make "late" happen
// on demand, and record each attempt's createRequestId to check the identity
// policy: a retry keeps it, a new tool or a reopened modal mints a new one.

type Interceptor = {
  requestIds: string[]
  // Holds the next action request until the returned function is called.
  holdNext: () => () => void
}

// Onboarding only offers real featured tools, so `toMock` rewrites the request
// onto the fixture tool before it leaves the browser. Nothing reaches a vendor.
async function interceptConnect(
  page: Page,
  toMock?: { key: string }
): Promise<Interceptor> {
  const requestIds: string[] = []
  let gate: Promise<void> | null = null
  await page.route("**/*", async (route) => {
    const request = route.request()
    const body = request.postData() ?? ""
    if (
      request.method() !== "POST" ||
      !request.headers()["next-action"] ||
      !body.includes('name="_1_createRequestId"')
    )
      return route.continue()

    const id = /name="_1_createRequestId"\r\n\r\n([^\r]*)/.exec(body)?.[1]
    if (id) requestIds.push(id)
    const held = gate
    gate = null
    if (held) await held
    if (!toMock) return route.continue()
    // The fixture tool has two pools, so it also needs a watched one, or the
    // action stops at the pool check before the adapter ever answers.
    const boundary = body.slice(0, body.indexOf("\r\n"))
    const lastPart = `${boundary}\r\nContent-Disposition: form-data; name="0"`
    await route.continue({
      postData: body
        .replace(/(name="_1_toolId"\r\n\r\n)[^\r]*/, `$1${E2E_MOCK_TOOL_ID}`)
        .replace(/(name="_1_apiKey"\r\n\r\n)[^\r]*/, `$1${toMock.key}`)
        .replace(
          lastPart,
          `${boundary}\r\nContent-Disposition: form-data; name="_1_watchedCreditTypes"\r\n\r\nprimary\r\n${lastPart}`
        ),
    })
  })
  return {
    requestIds,
    holdNext: () => {
      let release = () => {}
      gate = new Promise<void>((resolve) => {
        release = resolve
      })
      return release
    },
  }
}

test("@smoke onboarding keeps a late result on the tool that produced it", async ({
  page,
  email,
}) => {
  await signIn(page, email)
  await page.getByRole("button", { name: "Get started" }).click()
  const connect = await interceptConnect(page, { key: MOCK_KEY_REJECTED })

  const first = page.getByRole("button", { name: "OpenRouter", exact: true })
  const other = page.getByRole("button", { name: "NeverBounce", exact: true })
  const submit = page.getByRole("button", { name: "Connect & check balance" })
  await first.click()
  await page.getByRole("textbox", { name: "API key" }).fill("not-a-vendor-key")

  const release = connect.holdNext()
  await submit.click()
  await expect.poll(() => connect.requestIds.length).toBe(1)
  await expect(page.getByText("Listening for OpenRouter's")).toBeVisible()
  // Picking another tool mid-flight is what let the first result land on it.
  await expect(other).toBeDisabled()

  release()
  await expect(page.getByText("Mock tool rejected this key.")).toBeVisible()
  await expect(first).toHaveAttribute("aria-pressed", "true")

  // A retry after a failure is the same attempt, so it keeps the request id.
  await submit.click()
  await expect.poll(() => connect.requestIds.length).toBe(2)
  await expect(submit).toBeEnabled()
  expect(connect.requestIds[1]).toBe(connect.requestIds[0])

  // Choosing another tool is a new attempt with a new id.
  await other.click()
  await page.getByRole("textbox", { name: "API key" }).fill("not-a-vendor-key")
  await submit.click()
  await expect.poll(() => connect.requestIds.length).toBe(3)
  expect(connect.requestIds[2]).not.toBe(connect.requestIds[0])
})

test("@smoke the connect modal stays open until its attempt settles", async ({
  page,
  email,
}) => {
  await signIn(page, email)
  await page.getByRole("button", { name: "Skip for now" }).click()
  await page.goto("/connect")
  await page.getByPlaceholder(/^Search \d+ tools/).fill(MOCK_TOOL_NAME)
  const openModal = () =>
    page
      .locator(".qc-connect-card")
      .filter({ hasText: MOCK_TOOL_NAME })
      .getByRole("button", { name: "Connect tool" })
      .click()
  const connect = await interceptConnect(page)
  const dialog = page.getByRole("dialog")
  const key = page.getByLabel("API key")
  const submit = page.getByRole("button", { name: "Connect & check balance" })

  await openModal()
  await key.fill(MOCK_KEY_REJECTED)
  await submit.click()
  await expect(page.getByText("Mock tool rejected this key.")).toBeVisible()

  // A retry inside the same open modal is the same attempt. React resets an
  // action form after each submit, so the key has to go back in.
  await key.fill(MOCK_KEY_REJECTED)
  await submit.click()
  await expect.poll(() => connect.requestIds.length).toBe(2)
  expect(connect.requestIds[1]).toBe(connect.requestIds[0])

  // Closing and reopening once the attempt settled is a new attempt.
  await expect(submit).toBeEnabled()
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
  await openModal()
  await key.fill(MOCK_KEY_HEALTHY_AND_CRITICAL)
  const release = connect.holdNext()
  await submit.click()
  await expect.poll(() => connect.requestIds.length).toBe(3)
  expect(connect.requestIds[2]).not.toBe(connect.requestIds[0])

  // Closing mid-flight used to let this attempt's success close a reopened
  // modal and navigate out from under it.
  await page.keyboard.press("Escape")
  await expect(dialog).toBeVisible()

  release()
  await page.waitForURL(/\/dashboard\?connected=/)
})
