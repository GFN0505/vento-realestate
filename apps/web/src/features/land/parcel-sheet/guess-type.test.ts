import { describe, expect, it } from 'vitest'
import { guessDocumentType } from './guess-type'

describe('guessing a document type from its file name', () => {
  it.each([
    ['Survey plan LA-2025-0441.pdf', 'survey_plan'],
    ['excision_gazette_ibeju.pdf', 'excision_gazette'],
    ['Gazette 2019.jpg', 'excision_gazette'],
    ['CofO-Plot22.pdf', 'c_of_o'],
    ['c of o scan.heic', 'c_of_o'],
    ['C_of_O.pdf', 'c_of_o'],
    ['Certificate of Occupancy.pdf', 'c_of_o'],
    ['R of O Idu.pdf', 'r_of_o'],
    ['Governor’s consent.png', 'governors_consent'],
    ['consent on c of o.pdf', 'governors_consent'],
    ['Deed of Assignment - Adeyemi.pdf', 'deed_of_assignment'],
    ['Family receipt Adeyemi.jpg', 'family_receipt'],
    ['Land purchase agreement.pdf', 'land_purchase_agreement'],
  ])('reads %s as %s', (name, type) => {
    expect(guessDocumentType(name)).toBe(type)
  })

  it('leaves the type to the person when the name says nothing', () => {
    expect(guessDocumentType('IMG_20261104_0931.jpg')).toBeNull()
    expect(guessDocumentType('scan.pdf')).toBeNull()
  })

  it('does not mistake words that merely contain a pattern', () => {
    expect(guessDocumentType('cofounder notes.pdf')).toBeNull()
    expect(guessDocumentType('surveyor invoice.pdf')).toBeNull()
  })
})
