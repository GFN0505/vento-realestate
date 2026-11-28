import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { chooseStatus, expect, FILES, PARCELS, parcelOf, test, toastOf } from '../support/land'

// J-LND-02: move a title stage forward with evidence. Parkview Block B has its survey plan and
// excision gazette granted and its C of O submitted, so granting the C of O makes it Titled.
// Plot 22, Folu Ayo has a C of O in progress.

const C_OF_O_PDF = join(FILES, 'c-of-o.pdf')

async function openParcel(page: Page, id: string, name: string) {
  await page.goto(`/land/${id}`)
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible()
}

/** Clicks a stage in the tracker; its button reads "C of O, Submitted … . Update". */
async function openStage(page: Page, stage: RegExp) {
  await page
    .getByRole('region', { name: 'Title stage' })
    .getByRole('button', { name: stage })
    .click()
  const sheet = page.getByRole('dialog', { name: 'Update title stage' })
  await expect(sheet).toBeVisible()
  return sheet
}

const C_OF_O = /^C of O/

function header(page: Page, name: string) {
  return page.locator('header').filter({ has: page.getByRole('heading', { name, level: 1 }) })
}

test('submitting a stage with a reference saves it, says so and shows the reference on the tracker', async ({
  land,
  signIn,
}) => {
  const page = await signIn('landLegal')
  const folu = parcelOf(land, PARCELS.folu)
  await openParcel(page, folu.id, 'Plot 22, Folu Ayo')
  const sheet = await openStage(page, C_OF_O)

  await chooseStatus(sheet, 'Submitted')
  await sheet.getByLabel('Reference').fill('LSLB/CO/2026/9001')
  await sheet.getByRole('button', { name: 'Save update' }).click()

  await expect(toastOf(page, 'C of O submitted')).toBeVisible()
  await expect(sheet).toBeHidden()
  const tracker = page.getByRole('region', { name: 'Title stage' })
  const step = tracker.getByRole('listitem').filter({ hasText: 'C of O' })
  await expect(step).toContainText('Submitted')
  await expect(step).toContainText('LSLB/CO/2026/9001')
})

test('marking a stage queried needs a note, and saves once it says what the registry asked for', async ({
  land,
  signIn,
}) => {
  const page = await signIn('landLegal')
  await openParcel(page, parcelOf(land, PARCELS.parkview).id, 'Parkview Block B')
  const sheet = await openStage(page, C_OF_O)

  await chooseStatus(sheet, 'Queried')
  await sheet.getByRole('button', { name: 'Save update' }).click()
  await expect(sheet.getByText('Say what the registry asked for.')).toBeVisible()
  await expect(sheet).toBeVisible()

  await sheet.getByLabel('What happened').fill('Registry wants the survey plan re-certified')
  await sheet.getByRole('button', { name: 'Save update' }).click()

  await expect(toastOf(page, 'C of O queried')).toBeVisible()
  const step = page
    .getByRole('region', { name: 'Title stage' })
    .getByRole('listitem')
    .filter({ hasText: 'C of O' })
  await expect(step).toContainText('Registry wants the survey plan re-certified')
})

test('marking a stage granted needs its document; attaching it saves, makes the parcel Titled and Undo puts it back', async ({
  land,
  signIn,
}) => {
  const page = await signIn('landLegal')
  await openParcel(page, parcelOf(land, PARCELS.parkview).id, 'Parkview Block B')
  await expect(
    header(page, 'Parkview Block B').getByText('Acquired', { exact: true }),
  ).toBeVisible()
  const sheet = await openStage(page, C_OF_O)

  await chooseStatus(sheet, 'Granted')
  await sheet.getByRole('button', { name: 'Save update' }).click()
  await expect(sheet.getByText('Attach the C of O to mark it granted.')).toBeVisible()
  await expect(sheet).toBeVisible()

  await sheet.getByLabel('Choose files', { exact: true }).setInputFiles(C_OF_O_PDF)
  await expect(sheet.getByText('Uploaded', { exact: true })).toBeVisible()
  await sheet.getByRole('button', { name: 'Save update' }).click()

  await expect(toastOf(page, 'C of O granted')).toBeVisible()
  await expect(header(page, 'Parkview Block B').getByText('Titled', { exact: true })).toBeVisible()
  const vault = page.getByRole('list', { name: 'Documents' })
  await expect(vault.getByRole('listitem').filter({ hasText: 'C of O' })).toContainText('v1')

  await page.getByRole('button', { name: 'Undo' }).click()

  await expect(toastOf(page, 'Update undone')).toBeVisible()
  await expect(
    header(page, 'Parkview Block B').getByText('Acquired', { exact: true }),
  ).toBeVisible()
  const step = page
    .getByRole('region', { name: 'Title stage' })
    .getByRole('listitem')
    .filter({ hasText: 'C of O' })
  await expect(step).toContainText('Submitted')
})

test('granting a stage uses the document already in the vault, so no file is needed', async ({
  land,
  signIn,
}) => {
  const page = await signIn('landLegal')
  // Plot 22's excision gazette is granted with its document; moving it to submitted and back
  // must not ask for a file the vault already holds.
  await openParcel(page, parcelOf(land, PARCELS.folu).id, 'Plot 22, Folu Ayo')
  const sheet = await openStage(page, /^Excision gazette/)
  await chooseStatus(sheet, 'Submitted')
  await sheet.getByLabel('What happened').fill('Registry reopened the gazette for a correction')
  await sheet.getByRole('button', { name: 'Save update' }).click()
  await expect(toastOf(page, 'Excision gazette submitted')).toBeVisible()

  const again = await openStage(page, /^Excision gazette/)
  await chooseStatus(again, 'Granted')
  await expect(again.getByText(/Uses Excision gazette v1 from the vault/)).toBeVisible()
  await again.getByRole('button', { name: 'Save update' }).click()

  await expect(toastOf(page, 'Excision gazette granted')).toBeVisible()
})

test('when someone else updates the stage first, saving shows who, keeps what was typed and the next save goes through', async ({
  land,
  signIn,
  secondSession,
}) => {
  const first = await signIn('landLegal')
  const folu = parcelOf(land, PARCELS.folu)
  await openParcel(first, folu.id, 'Plot 22, Folu Ayo')
  const mine = await openStage(first, C_OF_O)
  await chooseStatus(mine, 'Submitted')
  await mine.getByLabel('Reference').fill('MINE/2026/1')

  // A second device saves the same stage while this sheet is still open.
  const other = await secondSession(first)
  await openParcel(other, folu.id, 'Plot 22, Folu Ayo')
  const theirs = await openStage(other, C_OF_O)
  await chooseStatus(theirs, 'Submitted')
  await theirs.getByLabel('Reference').fill('THEIRS/2026/2')
  await theirs.getByRole('button', { name: 'Save update' }).click()
  await expect(toastOf(other, 'C of O submitted')).toBeVisible()

  await mine.getByRole('button', { name: 'Save update' }).click()

  await expect(
    mine.getByText(
      'Ngozi Adeyemi updated this stage a moment ago. Check the latest, then save again.',
    ),
  ).toBeVisible()
  await expect(mine).toBeVisible()
  await expect(mine.getByLabel('Reference')).toHaveValue('MINE/2026/1')

  await mine.getByRole('button', { name: 'Save update' }).click()
  await expect(toastOf(first, 'C of O submitted')).toBeVisible()
  await expect(
    first
      .getByRole('region', { name: 'Title stage' })
      .getByRole('listitem')
      .filter({ hasText: 'C of O' }),
  ).toContainText('MINE/2026/1')
})

test('a Finance user sees the tracker but no stage can be opened', async ({ land, signIn }) => {
  const page = await signIn('finance')
  await openParcel(page, parcelOf(land, PARCELS.parkview).id, 'Parkview Block B')

  const tracker = page.getByRole('region', { name: 'Title stage' })
  await expect(tracker.getByRole('listitem').filter({ hasText: 'C of O' })).toBeVisible()
  await expect(tracker.getByRole('button')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Update / })).toHaveCount(0)
})
