import { describe, expect, it } from 'vitest'
import {
  defaultUploadParcel,
  defaultUploadType,
  type UploadDraft,
  uploadErrors,
  uploadName,
} from './upload-defaults'

const A = { id: 'a' }
const B = { id: 'b' }

describe('Upload document defaults', () => {
  it('starts on the remembered parcel while it is still in the list', () => {
    expect(defaultUploadParcel('b', [A, B])).toBe('b')
    expect(defaultUploadParcel('gone', [A, B])).toBe('')
  })

  it('starts on the only parcel when nothing is remembered', () => {
    expect(defaultUploadParcel(null, [A])).toBe('a')
    expect(defaultUploadParcel(null, [])).toBe('')
  })

  it("prefers the person's pick, then the file's name, then the current stage", () => {
    const base = { chosen: null, fileGuess: null, currentStage: null }
    expect(defaultUploadType({ ...base, chosen: 'other', fileGuess: 'c_of_o' })).toBe('other')
    expect(defaultUploadType({ ...base, fileGuess: 'survey_plan', currentStage: 'c_of_o' })).toBe(
      'survey_plan',
    )
    expect(defaultUploadType({ ...base, currentStage: 'governors_consent' })).toBe(
      'governors_consent',
    )
    expect(defaultUploadType(base)).toBe('')
  })
})

describe('Upload document checks', () => {
  const ready: UploadDraft = { parcelId: 'a', type: 'c_of_o', name: '', fileId: 'f' }

  it('accepts a parcel, a type and an uploaded file', () => {
    expect(uploadErrors(ready)).toEqual({})
  })

  it('says what is missing on each field', () => {
    expect(uploadErrors({ parcelId: '', type: '', name: '', fileId: null })).toEqual({
      parcelId: 'Choose the parcel this document is for',
      type: 'Choose what this document is',
      file: 'Take a photo or choose a file',
    })
    expect(uploadErrors({ ...ready, type: 'other', name: ' ' }).name).toBe(
      'Name this document, e.g. Query letter',
    )
  })

  it('sends a name only with types that take one', () => {
    expect(uploadName({ ...ready, name: 'Stray' })).toBeNull()
    expect(uploadName({ ...ready, type: 'family_receipt', name: ' Adeyemi family ' })).toBe(
      'Adeyemi family',
    )
  })
})
