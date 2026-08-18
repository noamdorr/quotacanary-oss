import { type Page, test as base, expect } from "@playwright/test"
import { E2E_MOCK_TOOL_ID } from "../../src/lib/adapters/e2e-mock"
import { waitForMagicLink } from "./mailpit"
import { deleteUserByEmail, ensureMockTool, uniqueEmail } from "./seed"
import { serviceClient } from "./stack"

type Fixtures = {
  // A fresh, never-signed-in address. The account it creates is deleted on
  // teardown, which cascades away its connections and balances.
  email: string
}

export const test = base.extend<Fixtures>({
  email: async ({}, use, testInfo) => {
    await ensureMockTool()
    const address = uniqueEmail(testInfo.title)
    await use(address)
    await deleteUserByEmail(address)
  },
})

export { expect }

// The real sign-in journey: request a link in the UI, read the message the local
// stack actually delivered, follow it. GoTrue's verify endpoint redirects on to
// /auth/confirm, which exchanges the code and lands the user on the dashboard.
export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByRole("button", { name: "Send magic link" }).click()
  await expect(page.getByText("A sign-in link is on its way to")).toBeVisible()

  const link = await waitForMagicLink(email)
  await page.goto(link)
  await page.waitForURL(/\/(dashboard|connect)/)
}

// The stored profile row, for assertions about effects the UI does not surface
// with a readable state (the notification mode buttons, for one).
export async function profileFor(
  email: string
): Promise<{ id: string; notify_mode: string; onboarded_at: string | null }> {
  const { data, error } = await serviceClient()
    .from("users")
    .select("id, notify_mode, onboarded_at")
    .eq("email", email)
    .single()
  if (error || !data) {
    throw new Error(`No profile row for ${email}: ${error?.message}`)
  }
  return data as {
    id: string
    notify_mode: string
    onboarded_at: string | null
  }
}

// Seeds an already-connected, already-onboarded account so specs about the
// dashboard, alerts, and settings do not each re-drive the connect flow. The
// connect flow itself is covered through the UI in connect.spec.ts.
export async function seedMockConnection(
  email: string,
  name = "Seeded Mock"
): Promise<string> {
  const admin = serviceClient()
  const { id: userId } = await profileFor(email)

  await admin
    .from("users")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("id", userId)

  const { data: connection, error } = await admin
    .from("connections")
    .insert({
      user_id: userId,
      tool_id: E2E_MOCK_TOOL_ID,
      connection_type: "api",
      // Never decrypted: no spec triggers a refresh, and the mock adapter is
      // exercised for real through the connect flow instead.
      encrypted_key: "e2e-fixture-not-a-real-ciphertext",
      key_hint: "0120",
      name,
      tags: [],
      status: "active",
      alert_enabled: true,
      watched_credit_types: ["primary", "secondary"],
    })
    .select("id")
    .single()
  if (error || !connection) {
    throw new Error(`Could not seed a connection: ${error?.message}`)
  }

  const { error: balanceError } = await admin.from("balances").insert([
    {
      connection_id: connection.id,
      credit_type: "primary",
      label: "Primary Credits",
      balance: 5000,
      unit: "credits",
    },
    {
      connection_id: connection.id,
      credit_type: "secondary",
      label: "Secondary Credits",
      balance: 120,
      unit: "credits",
    },
  ])
  if (balanceError) {
    throw new Error(`Could not seed balances: ${balanceError.message}`)
  }

  return connection.id as string
}
