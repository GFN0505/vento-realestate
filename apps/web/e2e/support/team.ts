import { randomUUID } from 'node:crypto'
import { expect, type Locator, type Page } from '@playwright/test'

/** An address no other test shares; example.com is reserved, and e2e mail never leaves the disk. */
export const uniqueAddress = (label: string) => `${label}.${randomUUID().slice(0, 8)}@example.com`

export async function openTeam(page: Page, query = '') {
  await page.goto(`/settings/team${query}`)
  await expect(page.getByRole('heading', { name: 'Team', level: 1 })).toBeVisible()
}

/** The invite sheet, opened from the page's Invite people button. */
export async function openInviteSheet(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Invite people' }).first().click()
  const sheet = page.getByRole('dialog', { name: 'Invite people' })
  await expect(sheet).toBeVisible()
  return sheet
}

/** Pastes text into the Emails box the way a clipboard does (Excel columns keep their lines). */
export async function pasteEmails(sheet: Locator, text: string) {
  await sheet.getByLabel('Emails').evaluate((box, pasted) => {
    const data = new DataTransfer()
    data.setData('text', pasted)
    box.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    )
  }, text)
}

/** Picks the role for everyone in the invite sheet (or in a member sheet). */
export async function chooseRole(sheet: Locator, role: string) {
  await sheet.getByRole('combobox', { name: 'Role', exact: true }).click()
  await sheet
    .page()
    .getByRole('option', { name: new RegExp(`^${role}\\b`) })
    .click()
}

/** A person's row on desktop (table) or their card on a phone. */
export const personRow = (page: Page, text: string | RegExp): Locator =>
  page.getByRole('row').filter({ hasText: text })

export const rowMenu = (page: Page, who: string) =>
  page.getByRole('button', { name: `Actions for ${who}` })
