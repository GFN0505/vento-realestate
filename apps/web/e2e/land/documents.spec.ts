import type { Page } from '@playwright/test'
import { expect, PARCELS, parcelOf, SURVEY_PDF, test, toastOf } from '../support/land'

// The document vault: versions, removal with a reason, signed downloads, uploads that survive a
// broken connection (decision 0025), and nothing saving while offline.

async function openParcel(page: Page, id: string, name: string) {
  await page.goto(`/land/${id}`)
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible()
}

/** The vault row of one document ("Survey plan", "Query letter"). */
const row = (page: Page, label: string) =>
  page.getByRole('list', { name: 'Documents' }).getByRole('listitem').filter({ hasText: label })

/** Opens the Upload document sheet: the header's button on desktop, the sticky bar on phones. */
async function openUpload(page: Page) {
  await page.getByRole('button', { name: 'Upload document' }).first().click()
  const sheet = page.getByRole('dialog', { name: 'Upload document' })
  await expect(sheet).toBeVisible()
  return sheet
}

test('uploading a file of a type already in the vault becomes the next version', async ({
  land,
  signIn,
}) => {
  const page = await signIn('landLegal')
  await openParcel(page, parcelOf(land, PARCELS.admiralty).id, 'Admiralty Way plot')
  await expect(row(page, 'Survey plan')).toContainText('v1')
  const sheet = await openUpload(page)

  await sheet.getByLabel('Choose file', { exact: true }).setInputFiles(SURVEY_PDF)

  // The file's name says survey plan, which is already here.
  await expect(sheet.getByLabel('Document type')).toHaveValue('survey_plan')
  await expect(sheet.getByText('Survey plan v1 is already here, so this becomes v2.')).toBeVisible()
  await sheet.getByRole('button', { name: 'Upload new version' }).click()

  await expect(toastOf(page, 'Survey plan v2 uploaded')).toBeVisible()
  await expect(sheet).toBeHidden()
  await expect(row(page, 'Survey plan')).toContainText('v2 · 1 earlier')
})

test('Upload new version on a row opens the sheet on that document', async ({ land, signIn }) => {
  const page = await signIn('landLegal')
  await openParcel(page, parcelOf(land, PARCELS.admiralty).id, 'Admiralty Way plot')

  await page.getByRole('button', { name: /Versions of Survey plan/ }).click()
  await expect(page.getByRole('list', { name: 'Versions of Survey plan' })).toBeVisible()
  await page.getByRole('button', { name: 'Upload new version' }).click()

  const sheet = page.getByRole('dialog', { name: 'Upload new version' })
  await expect(sheet.getByLabel('Document type')).toHaveValue('survey_plan')
  await expect(sheet.getByRole('button', { name: 'Upload new version' })).toBeVisible()
})

test('removing a version needs a reason, hides it from the vault, and Undo brings it back', async ({
  land,
  signIn,
}) => {
  const page = await signIn('landLegal')
  await openParcel(page, parcelOf(land, PARCELS.idu).id, 'Idu family land')
  await expect(row(page, 'Query letter')).toBeVisible()

  await page.getByRole('button', { name: /Versions of Query letter/ }).click()
  await page.getByRole('button', { name: 'Remove Query letter v1' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Remove Query letter v1?' })
  await dialog.getByRole('button', { name: 'Remove version' }).click()
  await expect(dialog.getByText('Say why, e.g. wrong parcel')).toBeVisible()

  await dialog.getByLabel('Why are you removing it?').fill('Wrong parcel')
  await dialog.getByRole('button', { name: 'Remove version' }).click()

  await expect(toastOf(page, 'Query letter v1 removed')).toBeVisible()
  await expect(row(page, 'Query letter')).toHaveCount(0)

  await page.getByRole('button', { name: 'Undo' }).click()

  await expect(toastOf(page, 'Query letter v1 is back')).toBeVisible()
  await expect(row(page, 'Query letter')).toBeVisible()
})

test('removing the only evidence behind a granted stage is refused and the document stays', async ({
  land,
  signIn,
}) => {
  const page = await signIn('landLegal')
  await openParcel(page, parcelOf(land, PARCELS.admiralty).id, 'Admiralty Way plot')

  await page.getByRole('button', { name: /Versions of Survey plan/ }).click()
  await page.getByRole('button', { name: 'Remove Survey plan v1' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Remove Survey plan v1?' })
  await dialog.getByLabel('Why are you removing it?').fill('Uploaded by mistake')
  await dialog.getByRole('button', { name: 'Remove version' }).click()

  await expect(dialog.getByRole('alert')).not.toBeEmpty()
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(row(page, 'Survey plan')).toBeVisible()
})

test('Download hands over a file the bucket serves with a 200', async ({ land, signIn }) => {
  const page = await signIn('landLegal')
  await openParcel(page, parcelOf(land, PARCELS.admiralty).id, 'Admiralty Way plot')

  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download Survey plan v1' }).click()
  const download = await downloading

  expect(await download.failure()).toBeNull()
  expect(download.suggestedFilename()).toMatch(/\.pdf$/)
  const fromBucket = await page.request.get(download.url())
  expect(fromBucket.status()).toBe(200)
  expect(fromBucket.headers()['content-disposition']).toMatch(/^attachment/)
})

test('a part that fails while the connection is cut shows Upload paused and the upload resumes when it is back', async ({
  land,
  signIn,
}) => {
  const page = await signIn('landLegal')
  await openParcel(page, parcelOf(land, PARCELS.admiralty).id, 'Admiralty Way plot')
  const sheet = await openUpload(page)

  // 11 MB is three 5 MiB parts. Part 2 fails and the health probe fails with it, until released.
  let cut = true
  let cutParts = 0
  await page.route('**/health', (route) =>
    cut ? route.abort('connectionreset') : route.continue(),
  )
  await page.route(
    (url) => url.searchParams.get('partNumber') === '2',
    (route) => {
      if (!cut) return route.continue()
      cutParts += 1
      return route.abort('connectionreset')
    },
  )
  const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(11 * 1024 * 1024, 32)])
  await sheet
    .getByLabel('Choose file', { exact: true })
    .setInputFiles({ name: 'survey-plan-scan.pdf', mimeType: 'application/pdf', buffer: big })

  await expect(sheet.getByRole('list', { name: 'Files' }).getByText(/^Upload paused/)).toBeVisible()
  await expect(sheet.getByRole('button', { name: /^(Upload new version|Waiting)/ })).toBeDisabled()

  expect(cutParts).toBeGreaterThan(0)
  cut = false

  await expect(sheet.getByText('Uploaded', { exact: true })).toBeVisible({ timeout: 30_000 })
  await sheet.getByRole('button', { name: 'Upload new version' }).click()
  await expect(toastOf(page, 'Survey plan v2 uploaded')).toBeVisible()
})

test('going offline disables Save with a reason, and coming back online enables it again', async ({
  land,
  signIn,
}) => {
  const page = await signIn('landLegal')
  await openParcel(page, parcelOf(land, PARCELS.admiralty).id, 'Admiralty Way plot')
  const sheet = await openUpload(page)
  await sheet.getByLabel('Choose file', { exact: true }).setInputFiles(SURVEY_PDF)
  await expect(sheet.getByText('Uploaded', { exact: true })).toBeVisible()
  const save = sheet.getByRole('button', { name: 'Upload new version' })
  await expect(save).toBeEnabled()

  await page.context().setOffline(true)

  await expect(save).toBeDisabled()
  await expect(
    sheet.getByText("You're offline. Your changes are kept; save when you're back online."),
  ).toBeVisible()

  await page.context().setOffline(false)

  await expect(save).toBeEnabled()
})
