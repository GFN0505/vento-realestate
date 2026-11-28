import { describe, expect, it } from 'vitest'
import {
  acceptFor,
  declaredKind,
  FILE_PART_SIZE,
  FILE_PURPOSES,
  fileProblem,
  formatFileSize,
  MIB,
  partBytes,
  partCount,
} from './purposes'
import { completeUploadInput, signPartsInput, startUploadInput } from './schema'

const FILE = '01900000-0000-7000-8000-0000000000f1'

describe('title_document purpose', () => {
  it('belongs to Land & title, needs land.create and takes up to 25 MiB of four kinds', () => {
    expect(FILE_PURPOSES.title_document).toMatchObject({
      feature: 'land',
      module: 'land',
      action: 'create',
      maxBytes: 25 * MIB,
      kinds: ['pdf', 'jpeg', 'png', 'heic'],
    })
    expect(FILE_PART_SIZE).toBe(5 * MIB)
  })
})

describe('fileProblem', () => {
  const pdf = { name: 'C of O.pdf', size: 3 * MIB, type: 'application/pdf' }

  it('accepts a PDF, JPG, PNG and a HEIC the browser reports with no type', () => {
    expect(fileProblem('title_document', pdf)).toBeNull()
    expect(fileProblem('title_document', { ...pdf, name: 'a.jpg', type: 'image/jpeg' })).toBeNull()
    expect(fileProblem('title_document', { ...pdf, name: 'a.png', type: 'image/png' })).toBeNull()
    expect(fileProblem('title_document', { ...pdf, name: 'IMG_0042.HEIC', type: '' })).toBeNull()
  })

  it('refuses another format with the spec copy', () => {
    expect(
      fileProblem('title_document', { ...pdf, name: 'plan.docx', type: 'application/msword' }),
    ).toEqual({ reason: 'file_type', message: 'Upload a PDF or a photo (JPG, PNG or HEIC).' })
    expect(
      fileProblem('title_document', { ...pdf, name: 'map.svg', type: 'image/svg+xml' }),
    ).toMatchObject({ reason: 'file_type' })
    expect(fileProblem('title_document', { ...pdf, name: 'setup.exe', type: '' })).toMatchObject({
      reason: 'file_type',
    })
  })

  it('refuses a file over 25 MB with its size', () => {
    expect(fileProblem('title_document', { ...pdf, size: 31 * MIB })).toEqual({
      reason: 'file_too_large',
      message: 'This file is 31 MB. Upload files up to 25 MB.',
    })
  })

  it('never rounds a file just over the limit down to it', () => {
    expect(formatFileSize(25 * MIB + 1, 25 * MIB)).toBe('25.1 MB')
    expect(formatFileSize(Math.round(4.24 * MIB))).toBe('4.2 MB')
  })
})

describe('declaredKind', () => {
  it('reads aliases browsers use and falls back to the extension only without a type', () => {
    expect(declaredKind('x.jpg', 'image/pjpeg')).toBe('jpeg')
    expect(declaredKind('x.heif', 'application/octet-stream')).toBe('heic')
    expect(declaredKind('x.pdf', 'text/html')).toBeNull()
  })
})

describe('partBytes', () => {
  it('gives every part 5 MiB except the last, which carries the rest', () => {
    expect([1, 2, 3].map((n) => partBytes(12 * MIB, n))).toEqual([5 * MIB, 5 * MIB, 2 * MIB])
    expect(partBytes(10 * MIB, 2)).toBe(5 * MIB)
    expect(partBytes(10, 1)).toBe(10)
  })
})

describe('partCount and acceptFor', () => {
  it('splits into 5 MiB parts, at least one', () => {
    expect(partCount(1)).toBe(1)
    expect(partCount(5 * MIB)).toBe(1)
    expect(partCount(5 * MIB + 1)).toBe(2)
    expect(partCount(25 * MIB)).toBe(5)
  })

  it('lists the extensions and types for the file picker', () => {
    expect(acceptFor('title_document')).toBe(
      '.pdf,.jpg,.jpeg,.png,.heic,.heif,application/pdf,image/jpeg,image/png,image/heic',
    )
  })
})

describe('startUploadInput', () => {
  const valid = { purpose: 'title_document', name: 'Survey plan.pdf', size: 1024, type: '' }

  it('cleans the name of path separators and control characters', () => {
    const parsed = startUploadInput.parse({ ...valid, name: '../evil\u0000\\name.pdf' })
    expect(parsed.name).toBe('.. evil name.pdf')
  })

  it('drops bidi overrides and zero-width characters, and turns C1 controls into spaces', () => {
    const name = (raw: string) => startUploadInput.parse({ ...valid, name: raw }).name
    expect(name('invoice\u202efdp.exe')).toBe('invoicefdp.exe')
    expect(name('\u2066a\u2067b\u2068c\u2069\u202a\u202b\u202c\u202d.pdf')).toBe('abc.pdf')
    expect(name('C\u200bof\u200c O\u200d\u200e\u200f\ufeff.pdf')).toBe('Cof O.pdf')
    expect(name('a\u0085b\u009fc\u0080.pdf')).toBe('a b c .pdf')
    expect(startUploadInput.safeParse({ ...valid, name: '\u202e\u200b\ufeff' }).success).toBe(false)
  })

  it('cuts a long name to 200 characters and keeps the extension', () => {
    const parsed = startUploadInput.parse({ ...valid, name: `${'a'.repeat(300)}.pdf` })
    expect(parsed.name).toHaveLength(200)
    expect(parsed.name.endsWith('.pdf')).toBe(true)
  })

  it('refuses an empty file, a blank name and an unknown purpose', () => {
    expect(startUploadInput.safeParse({ ...valid, size: 0 }).error?.issues[0]?.message).toBe(
      'This file is empty.',
    )
    expect(startUploadInput.safeParse({ ...valid, name: '  ' }).success).toBe(false)
    expect(startUploadInput.safeParse({ ...valid, purpose: 'avatar' }).success).toBe(false)
  })
})

describe('signPartsInput and completeUploadInput', () => {
  it('takes part numbers 1 to 5 for a 25 MiB limit, each once', () => {
    expect(signPartsInput.safeParse({ fileId: FILE, partNumbers: [1, 5] }).success).toBe(true)
    expect(signPartsInput.safeParse({ fileId: FILE, partNumbers: [6] }).success).toBe(false)
    expect(signPartsInput.safeParse({ fileId: FILE, partNumbers: [2, 2] }).success).toBe(false)
  })

  it('needs at least one part with its ETag', () => {
    expect(completeUploadInput.safeParse({ fileId: FILE, parts: [] }).success).toBe(false)
    expect(
      completeUploadInput.safeParse({ fileId: FILE, parts: [{ partNumber: 1, etag: '"abc"' }] })
        .success,
    ).toBe(true)
  })
})
