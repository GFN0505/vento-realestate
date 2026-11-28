import type { Page } from '@playwright/test'
import { expect, PARCELS, parcelOf, RECEIPT_PNG, SURVEY_PDF, test, toastOf } from '../support/land'

// J-LND-01 (the boundary is slice 3): register a parcel with what exists now, and who sees what.

const NEW_PARCEL = 'Ikoyi Road plot'

async function openAddParcel(page: Page) {
  await page.goto('/land')
  await page.getByRole('button', { name: 'Add parcel' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add parcel' })
  await expect(sheet).toBeVisible()
  return sheet
}

type Sheet = Awaited<ReturnType<typeof openAddParcel>>

async function fillEssentials(sheet: Sheet, name: string) {
  await sheet.getByLabel('Parcel name').fill(name)
  await sheet.getByLabel('State', { exact: true }).selectOption({ label: 'Lagos' })
  await sheet.getByLabel('LGA', { exact: true }).selectOption({ label: 'Eti-Osa' })
  await sheet.getByLabel('Area or town').fill('Ikoyi')
  await sheet.getByLabel('Size', { exact: true }).fill('2.5')
  await sheet.getByLabel('Company').selectOption({ label: 'Lekki Pearl Estates Ltd' })
}

test('adding a parcel with a PDF and a PNG guesses their types, grants the survey stage, files the documents under their stages and lists the parcel', async ({
  signIn,
}) => {
  const page = await signIn('landLegal')
  const sheet = await openAddParcel(page)
  await fillEssentials(sheet, NEW_PARCEL)

  await sheet.getByLabel('Choose files', { exact: true }).setInputFiles([SURVEY_PDF, RECEIPT_PNG])

  // The type is guessed from each file's name; the person can still change it.
  await expect(sheet.getByLabel('What is survey-plan.pdf?')).toHaveValue('survey_plan')
  await expect(sheet.getByLabel('What is family-receipt.png?')).toHaveValue('family_receipt')
  // Lagos starts with Survey plan, Excision gazette and C of O; the survey plan's file grants its stage.
  const stages = sheet.getByRole('list', { name: 'Title stages' })
  await expect(stages.getByRole('listitem')).toHaveCount(3)
  await expect(stages.getByRole('listitem').filter({ hasText: 'Survey plan' })).toContainText(
    'Granted',
  )
  await expect(stages.getByRole('listitem').filter({ hasText: 'C of O' })).toContainText(
    'Not started',
  )

  await sheet.getByRole('button', { name: 'Save parcel' }).click()

  await expect(toastOf(page, `${NEW_PARCEL} added`)).toBeVisible()
  await expect(page).toHaveURL(/\/land\/[0-9a-f-]{36}/)
  await expect(page.getByRole('heading', { name: NEW_PARCEL, level: 1 })).toBeVisible()
  // The documents sit in the vault, and the survey plan under its stage in the tracker.
  const vault = page.getByRole('list', { name: 'Documents' })
  await expect(vault.getByRole('listitem').filter({ hasText: 'Survey plan' })).toBeVisible()
  await expect(vault.getByRole('listitem').filter({ hasText: 'Family receipt' })).toBeVisible()
  const tracker = page.getByRole('region', { name: 'Title stage' })
  await expect(tracker.getByRole('listitem').filter({ hasText: 'Survey plan' })).toContainText(
    'Granted',
  )

  await page.goto('/land')
  await expect(page.getByRole('link', { name: NEW_PARCEL })).toBeVisible()
  await expect(page.getByText('7 parcels')).toBeVisible()
})

test('typing a name that is already used shows a hint with a link to that parcel, and does not block saving', async ({
  land,
  signIn,
}) => {
  const page = await signIn('landLegal')
  const sheet = await openAddParcel(page)

  await sheet.getByLabel('Parcel name').fill('Epe farmland')

  await expect(sheet.getByText("There's already a parcel called Epe farmland.")).toBeVisible()
  const epe = parcelOf(land, PARCELS.epe)
  await expect(sheet.getByRole('link', { name: 'Open it' })).toHaveAttribute(
    'href',
    new RegExp(epe.id),
  )
  await expect(sheet.getByRole('button', { name: 'Save parcel' })).toBeEnabled()
})

test('changing the state clears an LGA that is not in it, and saving asks for an LGA', async ({
  signIn,
}) => {
  const page = await signIn('landLegal')
  const sheet = await openAddParcel(page)
  await sheet.getByLabel('Parcel name').fill('Sagamu Road plot')
  await sheet.getByLabel('State', { exact: true }).selectOption({ label: 'Lagos' })
  await sheet.getByLabel('LGA', { exact: true }).selectOption({ label: 'Ikeja' })

  await sheet.getByLabel('State', { exact: true }).selectOption({ label: 'Ogun' })

  const lga = sheet.getByLabel('LGA', { exact: true })
  await expect(lga).toHaveValue('')
  await expect(lga.getByRole('option', { name: 'Ikeja' })).toHaveCount(0)
  await sheet.getByLabel('Size', { exact: true }).fill('1')
  await sheet.getByLabel('Company').selectOption({ label: 'Lekki Pearl Estates Ltd' })
  await sheet.getByRole('button', { name: 'Save parcel' }).click()
  await expect(sheet.getByRole('paragraph').filter({ hasText: 'Choose an LGA' })).toBeVisible()
  await expect(sheet).toBeVisible()
})

test('a member limited to one company sees only that company’s parcels and cannot open another company’s', async ({
  land,
  signIn,
}) => {
  const page = await signIn('limited')
  await page.goto('/land')

  await expect(page.getByRole('link', { name: 'Epe farmland' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Admiralty Way plot' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Parkview Block B' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Plot 22, Folu Ayo' })).toHaveCount(0)
  await expect(page.getByText('4 parcels')).toBeVisible()

  await page.goto(`/land/${parcelOf(land, PARCELS.parkview).id}`)
  await expect(
    page.getByText("We couldn't find that parcel. It may be in a company you can't see."),
  ).toBeVisible()
})

test('a member limited to one company can only add a parcel under it', async ({ signIn }) => {
  const page = await signIn('limited')
  const sheet = await openAddParcel(page)

  const company = sheet.getByLabel('Company')
  await expect(company.getByRole('option', { name: 'Victoria Gardens Dev. Ltd' })).toHaveCount(1)
  await expect(company.getByRole('option', { name: 'Parkview Residences SPV Ltd' })).toHaveCount(0)
  await expect(company.getByRole('option', { name: 'Lekki Pearl Estates Ltd' })).toHaveCount(0)
})

test('a Sales user sees where the title stands but no acquisition cost or seller, and cannot add or update', async ({
  land,
  signIn,
}) => {
  const page = await signIn('sales')
  const folu = parcelOf(land, PARCELS.folu)
  await page.goto(`/land/${folu.id}`)

  await expect(page.getByRole('heading', { name: 'Plot 22, Folu Ayo', level: 1 })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Title stage' })).toBeVisible()
  // The activity is where a cost could leak, so wait for it too (a tab on phones).
  const activityTab = page.getByRole('tab', { name: /^Activity/ })
  if (await activityTab.isVisible()) await activityTab.click()
  await expect(page.getByRole('list', { name: 'Activity' })).toBeVisible()
  await expect(page.getByText(/840,000,000/)).toHaveCount(0)
  await expect(page.getByText(/Bought for|Bought from|Adeyemi family/)).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Update / })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Upload document' })).toHaveCount(0)

  await page.goto('/land')
  await expect(page.getByRole('link', { name: 'Plot 22, Folu Ayo' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add parcel' })).toHaveCount(0)
})

test('Land & legal sees the acquisition cost and seller that Sales does not', async ({
  land,
  signIn,
}) => {
  const page = await signIn('landLegal')
  await page.goto(`/land/${parcelOf(land, PARCELS.folu).id}`)

  await expect(page.getByText(/Acquired 14 Mar 2025 for ₦840,000,000\.00/).first()).toBeVisible()
  await expect(page.getByText('Bought from Adeyemi family')).toBeVisible()
})
