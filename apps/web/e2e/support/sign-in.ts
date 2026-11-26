import { expect, type Page } from '@playwright/test'
import { totpCode } from './totp'

export async function enterPassword(page: Page, email: string, password: string) {
  await page.getByLabel('Work email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

/** Sign in with email, password and the current authenticator code; waits for the home page. */
export async function signInWithTotp(
  page: Page,
  member: { email: string; password: string; totpSecret: string },
) {
  await page.goto('/sign-in')
  await enterPassword(page, member.email, member.password)
  await expect(page.getByRole('heading', { name: 'Two-step check' })).toBeVisible()
  await page.getByLabel('6-digit code').fill(totpCode(member.totpSecret))
  await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()
}

/** Home's heading: "Good morning, Olumide" (afternoon, evening). */
export const HOME_GREETING = /^Good (morning|afternoon|evening), /

/** Runs a ⌘K command by name (the search bar on desktop, the search icon on phones). */
export async function runCommand(page: Page, name: string) {
  await page.getByRole('button', { name: /Search or run a command/ }).click()
  await page.getByRole('option', { name, exact: true }).click()
}
