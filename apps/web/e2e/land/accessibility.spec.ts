import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, PARCELS, parcelOf, test } from '../support/land'
import { HOME_GREETING } from '../support/sign-in'

// Serious and critical axe violations fail the build on Land & title, in both themes. The phone
// project is 375 px wide and the desktop project 1280 px, so each runs both widths.

async function settle(page: Page) {
  // Colours are checked mid-fade otherwise.
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))),
  )
}

async function expectNoSeriousViolations(page: Page) {
  await settle(page)
  const { violations } = await new AxeBuilder({ page }).analyze()
  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(
    serious.map(
      (v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
    ),
  ).toEqual([])
}

type Screen = { name: string; open: (page: Page, ids: { parkview: string }) => Promise<void> }

const SCREENS: Screen[] = [
  {
    name: 'the parcels list',
    open: async (page) => {
      await page.goto('/land')
      await expect(page.getByRole('link', { name: 'Epe farmland' })).toBeVisible()
    },
  },
  {
    name: 'a parcel with its tracker and vault',
    open: async (page, { parkview }) => {
      await page.goto(`/land/${parkview}`)
      await expect(page.getByRole('heading', { name: 'Parkview Block B', level: 1 })).toBeVisible()
      await expect(page.getByRole('list', { name: 'Documents' })).toBeVisible()
    },
  },
  {
    name: 'the title stage sheet',
    open: async (page, { parkview }) => {
      await page.goto(`/land/${parkview}?sheet=stage&stage=c_of_o`)
      await expect(page.getByRole('dialog', { name: 'Update title stage' })).toBeVisible()
    },
  },
  {
    name: 'the title stage sheet with a problem showing',
    open: async (page, { parkview }) => {
      await page.goto(`/land/${parkview}?sheet=stage&stage=c_of_o`)
      const sheet = page.getByRole('dialog', { name: 'Update title stage' })
      await sheet
        .getByRole('group', { name: 'Status' })
        .getByText('Granted', { exact: true })
        .click()
      await sheet.getByRole('button', { name: 'Save update' }).click()
      await expect(sheet.getByText('Attach the C of O to mark it granted.')).toBeVisible()
    },
  },
  {
    name: 'the add parcel sheet',
    open: async (page) => {
      await page.goto('/land?sheet=add')
      await expect(page.getByRole('dialog', { name: 'Add parcel' })).toBeVisible()
    },
  },
  {
    name: 'Home for Land & legal',
    open: async (page) => {
      await page.goto('/')
      await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()
      await expect(page.getByRole('list', { name: 'Your queue' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Title pipeline' })).toBeVisible()
    },
  },
]

for (const theme of ['light', 'dark'] as const) {
  for (const screen of SCREENS) {
    test(`${screen.name} has no serious accessibility violations in ${theme} mode`, async ({
      land,
      signIn,
    }) => {
      const page = await signIn('landLegal')
      if (theme === 'dark') {
        await page.addInitScript(() => localStorage.setItem('vento-theme', 'dark'))
      }
      await screen.open(page, { parkview: parcelOf(land, PARCELS.parkview).id })
      await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*dark)/)

      await expectNoSeriousViolations(page)
    })
  }
}
