import { join } from 'node:path'
import {
  type BrowserContext,
  test as base,
  expect,
  type Locator,
  type Page,
} from '@playwright/test'
import { runFixture } from './fixtures'
import { signInAs } from './sign-in'

/*
 * Land & title e2e support. Every test gets its own organization (the `land` fixture: three
 * companies, the six golden-thread parcels with sample files in the bucket, and the people the
 * journeys need), so tests never depend on each other or on order.
 */

type Person = { email: string; name: string; totpSecret?: string }
type Parcel = { id: string; name: string; stages: Record<string, string> }

export type LandFixture = {
  organizationId: string
  organizationName: string
  password: string
  entities: Record<'victoria' | 'parkview' | 'lekki', { id: string; name: string }>
  members: Record<'owner' | 'landLegal' | 'sales' | 'finance' | 'limited', Person>
  /** Keyed by reference: P-0007 Admiralty Way plot … P-0021 Epe farmland. */
  parcels: Record<string, Parcel>
}

/** The golden-thread parcels by what they are used for in the specs. */
export const PARCELS = {
  admiralty: 'P-0007',
  victoriaTract: 'P-0009',
  folu: 'P-0012',
  parkview: 'P-0015',
  idu: 'P-0018',
  epe: 'P-0021',
} as const

export const FILES = join(import.meta.dirname, '..', 'fixtures', 'files')
export const SURVEY_PDF = join(FILES, 'survey-plan.pdf')
export const RECEIPT_PNG = join(FILES, 'family-receipt.png')

export const createLandFixture = () => runFixture<LandFixture>('land')

export function parcelOf(land: LandFixture, reference: (typeof PARCELS)[keyof typeof PARCELS]) {
  const parcel = land.parcels[reference]
  if (!parcel) throw new Error(`The land fixture has no ${reference}`)
  return parcel
}

type Role = keyof LandFixture['members']

type LandFixtures = {
  land: LandFixture
  /** A page signed in as that person, with the project's device settings (desktop or phone). */
  signIn: (role: Role) => Promise<Page>
  /** A second, independent browser session of the same signed-in person (another device). */
  secondSession: (page: Page) => Promise<Page>
}

export const test = base.extend<LandFixtures>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires the destructuring form.
  land: async ({}, use) => {
    await use(createLandFixture())
  },
  signIn: async ({ browser, land }, use, testInfo) => {
    const contexts: BrowserContext[] = []
    await use(async (role) => {
      const context = await browser.newContext({ ...testInfo.project.use })
      contexts.push(context)
      const page = await context.newPage()
      await signInAs(page, land.members[role], land.password)
      return page
    })
    await Promise.all(contexts.map((c) => c.close()))
  },
  secondSession: async ({ browser }, use, testInfo) => {
    const contexts: BrowserContext[] = []
    await use(async (page) => {
      const state = await page.context().storageState()
      const context = await browser.newContext({ ...testInfo.project.use, storageState: state })
      contexts.push(context)
      return context.newPage()
    })
    await Promise.all(contexts.map((c) => c.close()))
  },
})

/** A toast by its words, kept apart from the same words in the activity timeline. */
export function toastOf(page: Page, text: string | RegExp) {
  return page.getByRole('region', { name: /^Notifications/ }).getByText(text)
}

/** Picks a status chip in the stage sheet (the radio itself is visually hidden). */
export async function chooseStatus(sheet: Locator, label: string) {
  await sheet.getByRole('group', { name: 'Status' }).getByText(label, { exact: true }).click()
  await expect(sheet.getByLabel(label, { exact: true })).toBeChecked()
}

export { expect }
