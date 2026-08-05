import { expect, type Page } from "@playwright/test"

// Signing the PWA in.
//
// The phone app authenticates with a bearer token it keeps itself, not a
// cookie, so there is no storage state to reuse the way the web suite does —
// each spec signs in through the real screen. That is closer to what a
// clinician does anyway.
//
// The cast matches lospor-api/e2e/credentials.ts; `npm run e2e:seed` in
// lospor-api creates them and resets their institutions between runs.

export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "E2e-Test-Pass!234"

export const ACCOUNTS = {
  admin:    process.env.E2E_EMAIL         ?? "e2e@lospor.test",
  hodA:     process.env.E2E_HOD_A_EMAIL   ?? "hod-a-e2e@lospor.test",
  memberA:  process.env.E2E_MEMBER_A_EMAIL ?? "member-a-e2e@lospor.test",
  hodB:     process.env.E2E_HOD_B_EMAIL   ?? "hod-b-e2e@lospor.test",
  memberB:  process.env.E2E_MEMBER_B_EMAIL ?? "member-b-e2e@lospor.test",
} as const

export const INSTITUTION_A_NAME = "E2E Test Hospital"
export const INSTITUTION_B_NAME = "E2E Second Hospital"
export const NO_INSTITUTION_NAME = "Без институция"

async function attemptSignIn(page: Page, email: string): Promise<void> {
  await page.goto("/")
  await page.getByPlaceholder("you@hospital.org").fill(email)
  await page.locator("input[type=password]").fill(E2E_PASSWORD)
  await page.getByText("Sign in", { exact: true }).click()
  await expect(page.getByText("New case", { exact: true })).toBeVisible()
}

/**
 * Reaching the dashboard is not the same as staying signed in.
 *
 * The dashboard loads the case list with the new token, and if that comes back
 * 401 the app logs the clinician straight back out and returns them to this
 * screen. Every later step then fails for a reason that has nothing to do with
 * what the spec is testing — the queue looks empty, the approve button does
 * nothing. So settle first, and if we have been thrown back, say so and try
 * once more rather than carrying on against a signed-out app.
 */
export async function signIn(page: Page, email: string): Promise<void> {
  await attemptSignIn(page, email)

  const signInField = page.getByPlaceholder("you@hospital.org")
  if (await signInField.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await attemptSignIn(page, email)
  }
  await expect(
    signInField,
    `signed in as ${email} but the app returned to the sign-in screen`,
  ).toHaveCount(0)
}

/**
 * React Native's Alert is a no-op on the web build, so confirmations and
 * notices come through window.confirm / window.alert. Playwright dismisses
 * those by default, which would silently answer "cancel" to every prompt —
 * a destructive action would appear to do nothing and the test would blame
 * the feature. Accept them for the whole page.
 */
export function acceptDialogs(page: Page): void {
  page.on("dialog", dialog => { void dialog.accept() })
}
