import { defineConfig, devices } from "@playwright/test"
import { APP_ORIGIN } from "./e2e/fixtures/stack"

// Browser smoke tests for the critical user journey. They need the local
// Supabase stack (`supabase start`) and a built app; see e2e/README.md.
//
// Next serves the self-host app on every hostname; APP_ONLY is a compatibility
// no-op. Routing checks cover same-origin behavior on named and IP hosts.
export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: APP_ORIGIN,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  webServer: {
    command: process.env.E2E_WEB_SERVER_CMD ?? "npm run start",
    url: APP_ORIGIN,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
})
