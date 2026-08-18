import { expect, signIn, test } from "./fixtures/test"

test("@smoke a magic link signs a new user in and lands them on the app", async ({
  page,
  email,
}) => {
  await signIn(page, email)
  await expect(page).toHaveURL(/\/dashboard/)
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeHidden()
})

test("@smoke signing out returns to the login page", async ({
  page,
  email,
}) => {
  await signIn(page, email)

  await page
    .getByRole("banner")
    .getByRole("button", { name: "Sign out" })
    .click()
  await page.waitForURL(/\/login/)

  // The session is really gone, not just navigated away from.
  await page.goto("/dashboard")
  await expect(page).toHaveURL(/\/login/)
})

test("an unauthenticated app route redirects to login and remembers where it was headed", async ({
  page,
}) => {
  await page.goto("/settings")
  await expect(page).toHaveURL(/\/login\?next=%2Fsettings/)
})

test("a bad confirmation link explains itself instead of failing silently", async ({
  page,
}) => {
  await page.goto("/auth/confirm?token_hash=not-a-real-token&type=magiclink")
  await expect(page).toHaveURL(/\/login\?error=confirmation_failed/)
  await expect(
    page.getByText(
      "That link expired or was already used. Enter your email below for a new one."
    )
  ).toBeVisible()
})
