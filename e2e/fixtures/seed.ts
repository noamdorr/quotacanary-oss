import {
  E2E_MOCK_POOLS,
  E2E_MOCK_TOOL_ID,
} from "../../src/lib/adapters/e2e-mock"
import { serviceClient } from "./stack"

// A key the mock adapter parses into two pools: 5000 primary (healthy against
// the 900/300 thresholds below) and 120 secondary (critical). One connection
// therefore renders two dashboard rows in two different states.
export const MOCK_KEY_HEALTHY_AND_CRITICAL = "qc_e2e_5000_120"
export const MOCK_KEY_REJECTED = "not-a-mock-key"
export const MOCK_TOOL_NAME = "QC E2E Mock"

// Inserted by the suite rather than by seed.sql, so the fake tool exists only in
// a database a test just reset. Paired with E2E_MOCK_TOOL=true on the app, which
// is what makes its adapter resolvable at all.
export async function ensureMockTool(): Promise<void> {
  const { error } = await serviceClient().from("tools").upsert({
    id: E2E_MOCK_TOOL_ID,
    name: MOCK_TOOL_NAME,
    category: "email_verification",
    integration_type: "api",
    default_low_threshold: 900,
    default_alert_threshold: 300,
    pools: E2E_MOCK_POOLS,
    is_active: true,
  })
  if (error) throw new Error(`Could not seed the mock tool: ${error.message}`)
}

// Each test gets its own user, so specs never contend over one account's
// connections and can run in parallel.
export function uniqueEmail(label: string): string {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-")
  return `e2e-${slug}-${process.pid}-${Date.now()}@quotacanary.test`
}

export async function deleteUserByEmail(email: string): Promise<void> {
  const admin = serviceClient()
  // listUsers has no email filter, so page through until the address turns up.
  // A test stack holds a handful of users, not a directory.
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    })
    if (error || !data.users.length) return
    const match = data.users.find((u) => u.email === email)
    if (match) {
      // public.users cascades from auth.users, and connections cascade from
      // public.users, so this one delete removes the whole fixture.
      await admin.auth.admin.deleteUser(match.id)
      return
    }
    if (data.users.length < 200) return
  }
}
