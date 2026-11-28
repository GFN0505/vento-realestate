import type { Page } from '@playwright/test'
import { expect, PARCELS, parcelOf, SURVEY_PDF, test, toastOf } from '../support/land'
import { HOME_GREETING } from '../support/sign-in'

// J-LND-02's other start: the Land & legal home (queue, Titles in progress, Title pipeline) and
// filing a photo from a phone in three taps.

async function openHome(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()
}

const queue = (page: Page) => page.getByRole('list', { name: 'Your queue' })

test('the Titles in progress tile counts the parcels with a stage under way and the stalled ones', async ({
  signIn,
}) => {
  const page = await signIn('landLegal')
  await openHome(page)

  // Plot 22 (C of O in progress), Parkview Block B (submitted), Idu family land (queried).
  const tile = page.getByRole('link', { name: /^Titles in progress\s*3\s*\./ })
  await expect(tile).toBeVisible()
  await expect(tile).toContainText('1 stalled over 90 days')
  await tile.click()
  await expect(page).toHaveURL(/\/land\?filter=in_progress/)
})

test('the queue lists the registry query, the overdue follow-up and the stalled stage, oldest first', async ({
  signIn,
}) => {
  const page = await signIn('landLegal')
  await openHome(page)

  const items = queue(page).getByRole('listitem')
  await expect(items).toHaveCount(3)
  // Oldest due first: stalled since 94 days ago, queried 25 days ago, follow-up due yesterday.
  await expect(items.nth(0)).toContainText('No movement on')
  await expect(items.nth(1)).toContainText("Answer the registry's query")
  await expect(items.nth(2)).toContainText('Follow up')
  await expect(items.filter({ hasText: "Answer the registry's query" })).toContainText(
    'Idu family land',
  )
  await expect(items.filter({ hasText: 'Follow up' })).toContainText('Parkview Block B')
  await expect(items.filter({ hasText: 'No movement on' })).toContainText('Idu family land')
  await expect(items.filter({ hasText: 'Follow up' })).toContainText('Late')
})

test('Update stage on a queue item opens the title stage sheet on that stage', async ({
  land,
  signIn,
}) => {
  const page = await signIn('landLegal')
  await openHome(page)

  await queue(page)
    .getByRole('listitem')
    .filter({ hasText: 'Follow up' })
    .getByRole('link', { name: /^Update stage/ })
    .click()

  await expect(page).toHaveURL(new RegExp(`/land/${parcelOf(land, PARCELS.parkview).id}`))
  const sheet = page.getByRole('dialog', { name: 'Update title stage' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByLabel('Stage')).toHaveValue('c_of_o')
})

test('answering a query takes its item off the queue', async ({ land, signIn }) => {
  const page = await signIn('landLegal')
  const idu = parcelOf(land, PARCELS.idu)
  await page.goto(`/land/${idu.id}?sheet=stage&stage=r_of_o`)
  const sheet = page.getByRole('dialog', { name: 'Update title stage' })
  await sheet.getByRole('group', { name: 'Status' }).getByText('Submitted', { exact: true }).click()
  await sheet.getByLabel('What happened').fill('Family consent letter sent')
  await sheet.getByRole('button', { name: 'Save update' }).click()
  await expect(toastOf(page, 'R of O submitted')).toBeVisible()

  await openHome(page)

  await expect(
    queue(page).getByRole('listitem').filter({ hasText: "Answer the registry's query" }),
  ).toHaveCount(0)
})

test('Sales has no Land & legal queue on Home', async ({ signIn }) => {
  const page = await signIn('sales')
  await openHome(page)

  await expect(page.getByRole('list', { name: 'Your queue' })).toHaveCount(0)
})

test('on a phone, filing a photo into the remembered parcel takes three taps', async ({
  land,
  signIn,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'the sticky Upload document bar is phone-only')
  const page = await signIn('landLegal')
  const folu = parcelOf(land, PARCELS.folu)
  // The parcel last filed into on this phone (kept per organization on the device).
  await page.evaluate(
    ({ key, parcelId }) => localStorage.setItem(key, JSON.stringify({ parcelId })),
    { key: `vento:land:upload-document:${land.organizationId}`, parcelId: folu.id },
  )
  await openHome(page)

  await page.getByRole('button', { name: 'Upload document' }).click() // tap 1
  const sheet = page.getByRole('dialog', { name: 'Upload document' })
  await expect(sheet.getByLabel('Parcel')).toHaveValue(folu.id)
  await sheet.getByLabel('Choose file', { exact: true }).setInputFiles(SURVEY_PDF) // tap 2
  // The file's name picks the type; nothing else to fill in.
  await expect(sheet.getByLabel('Document', { exact: true })).toHaveValue('survey_plan')
  await expect(sheet.getByText('Uploaded', { exact: true })).toBeVisible()
  await sheet.getByRole('button', { name: 'Upload document', exact: true }).click() // tap 3

  await expect(toastOf(page, 'Survey plan v2 uploaded')).toBeVisible()
  await expect(sheet).toBeHidden()
})

test('filing a document from Home with no parcel chosen asks which parcel', async ({
  signIn,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'the sticky Upload document bar is phone-only')
  const page = await signIn('landLegal')
  await openHome(page)

  await page.getByRole('button', { name: 'Upload document' }).click()
  const sheet = page.getByRole('dialog', { name: 'Upload document' })
  await sheet.getByRole('button', { name: 'Upload document', exact: true }).click()

  await expect(sheet.getByText('Choose the parcel this document is for')).toBeVisible()
  await expect(sheet.getByText('Take a photo or choose a file')).toBeVisible()
})
