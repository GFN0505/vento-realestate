import { describe, expect, it } from 'vitest'
import {
  createParcelInput,
  removeVersionInput,
  setStagesInput,
  updateParcelInput,
  updateStageInput,
  uploadDocumentInput,
} from './schema'

const ID = '01900000-0000-7000-8000-0000000000a1'
const valid = {
  name: 'Plot 22, Folu Ayo',
  state: 'Lagos',
  lga: 'Ibeju-Lekki',
  size: { value: '4.2', unit: 'ha' },
  entityId: ID,
}

const messages = (r: { error?: { issues: { message: string }[] } }) =>
  r.error?.issues.map((i) => i.message) ?? []

describe('createParcelInput', () => {
  it('defaults to Under acquisition with no documents', () => {
    const parsed = createParcelInput.parse(valid)
    expect(parsed).toMatchObject({ status: 'under_acquisition', documents: [], area: null })
    expect(parsed.stages).toBeUndefined()
  })

  it('refuses an LGA that is not in the state, with the spec copy', () => {
    const r = createParcelInput.safeParse({ ...valid, lga: 'Abuja Municipal' })
    expect(messages(r)).toEqual(['Pick an LGA in Lagos.'])
    expect(r.error?.issues[0]?.path).toEqual(['lga'])
  })

  it('refuses a size that is not a number with its message, never a crash', () => {
    expect(
      messages(createParcelInput.safeParse({ ...valid, size: { value: '', unit: 'ha' } })),
    ).toEqual(['Enter a size like 4.2 or 600'])
    const plots = { value: '12', unit: 'plots', plotSizeSqm: '6,00' }
    expect(messages(createParcelInput.safeParse({ ...valid, size: plots }))).toEqual([
      'Enter a plot size in m², like 600 or 648',
    ])
  })

  it('stores the listed LGA for what people type', () => {
    expect(createParcelInput.parse({ ...valid, state: 'FCT', lga: 'amac' }).lga).toBe(
      'Abuja Municipal',
    )
  })

  it('refuses a size of zero, a size too large and an unknown unit', () => {
    expect(
      messages(createParcelInput.safeParse({ ...valid, size: { value: '0', unit: 'ha' } })),
    ).toEqual(['Enter a size above zero'])
    expect(
      messages(
        createParcelInput.safeParse({ ...valid, size: { value: '9999999999', unit: 'ha' } }),
      ),
    ).toEqual(['Enter a smaller size'])
    expect(
      createParcelInput.safeParse({ ...valid, size: { value: '1', unit: 'acres' } }).success,
    ).toBe(false)
  })

  it('refuses a size that rounds to nothing in m², as a field error', () => {
    const r = createParcelInput.safeParse({ ...valid, size: { value: '0.004', unit: 'sqm' } })
    expect(messages(r)).toEqual(['Enter a size of at least 0.01 m²'])
    expect(r.error?.issues[0]?.path).toEqual(['size', 'value'])
    expect(
      createParcelInput.safeParse({ ...valid, size: { value: '0.005', unit: 'sqm' } }).success,
    ).toBe(true)
  })

  it('keeps line breaks in notes but refuses other hidden characters', () => {
    expect(createParcelInput.parse({ ...valid, notes: 'Fenced\nBeacons set' }).notes).toBe(
      'Fenced\nBeacons set',
    )
    expect(
      messages(createParcelInput.safeParse({ ...valid, notes: 'Fenced\u202Etxt.exe' })),
    ).toEqual(['Remove hidden characters, like tabs'])
    const reason = (r: string) => removeVersionInput.safeParse({ versionId: ID, reason: r })
    expect(reason('Wrong parcel\nUploaded twice').success).toBe(true)
    expect(messages(reason('Wrong\tparcel'))).toEqual(['Remove hidden characters, like tabs'])
  })

  it('takes the cost as a decimal string, never a number', () => {
    expect(
      createParcelInput.parse({ ...valid, acquisitionCost: '840000000' }).acquisitionCost,
    ).toBe('840000000.00')
    expect(createParcelInput.safeParse({ ...valid, acquisitionCost: 840000000 }).success).toBe(
      false,
    )
  })

  it('needs a name for an other document and refuses one on a one-of-a-kind type', () => {
    const doc = { fileId: ID, type: 'other' }
    expect(messages(createParcelInput.safeParse({ ...valid, documents: [doc] }))).toEqual([
      'Name this document, e.g. Query letter',
    ])
    expect(
      messages(
        createParcelInput.safeParse({
          ...valid,
          documents: [{ fileId: ID, type: 'c_of_o', name: 'Mine' }],
        }),
      ),
    ).toEqual(['Only receipts, agreements, deeds and other documents take a name'])
  })

  it('refuses an organization in the input', () => {
    expect(createParcelInput.safeParse({ ...valid, organizationId: ID }).success).toBe(false)
  })
})

describe('updateParcelInput', () => {
  it('changes only what is sent, and clears a field sent as null', () => {
    const parsed = updateParcelInput.parse({ id: ID, expectedVersion: 2, seller: null })
    expect(parsed).toEqual({ id: ID, expectedVersion: 2, seller: null })
  })
})

describe('updateStageInput', () => {
  const stage = { id: ID, expectedVersion: 1, on: '2026-11-03' }

  it('needs What happened for queried and rejected', () => {
    expect(messages(updateStageInput.safeParse({ ...stage, status: 'queried' }))).toEqual([
      'Say what the registry asked for.',
    ])
    expect(messages(updateStageInput.safeParse({ ...stage, status: 'rejected' }))).toEqual([
      'Say why it was rejected.',
    ])
  })

  it('never offers not started', () => {
    expect(updateStageInput.safeParse({ ...stage, status: 'not_started' }).success).toBe(false)
  })

  it('takes up to five attachments', () => {
    const a = { fileId: ID, type: 'c_of_o' }
    expect(
      updateStageInput.safeParse({ ...stage, status: 'granted', attachments: Array(6).fill(a) })
        .success,
    ).toBe(false)
  })
})

describe('uploadDocumentInput and setStagesInput', () => {
  it('needs a name for a separate document', () => {
    const r = uploadDocumentInput.safeParse({
      parcelId: ID,
      fileId: ID,
      type: 'family_receipt',
      separate: true,
    })
    expect(messages(r)).toEqual(['Which one? e.g. Adeyemi family'])
  })

  it('keeps at least one stage, each once', () => {
    expect(
      messages(setStagesInput.safeParse({ parcelId: ID, expectedVersion: 1, types: [] })),
    ).toEqual(['Keep at least one title stage'])
    expect(
      setStagesInput.safeParse({ parcelId: ID, expectedVersion: 1, types: ['c_of_o', 'c_of_o'] })
        .success,
    ).toBe(false)
  })

  it('needs a reason to remove a version', () => {
    expect(messages(removeVersionInput.safeParse({ versionId: ID, reason: 'no' }))).toEqual([
      'Say why, e.g. wrong parcel',
    ])
  })
})
