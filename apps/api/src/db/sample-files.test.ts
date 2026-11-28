import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { sniffKind } from '@/storage/sniff'
import { SAMPLE_CAPTION, samplePdf, samplePng } from './sample-files'

describe('sample files', () => {
  it('makes a PDF the upload check accepts, saying it is fictional', () => {
    const pdf = samplePdf("Governor's consent (Plot 22)")
    expect(sniffKind(pdf)).toBe('pdf')
    const text = Buffer.from(pdf).toString('latin1')
    expect(text).toContain('(Fictional sample \\267 not a real document)')
    expect(text).toContain("(Governor's consent \\(Plot 22\\))")
    const xref = Number(/startxref\n(\d+)/.exec(text)?.[1])
    expect(text.slice(xref, xref + 4)).toBe('xref')
  })

  it('makes a PNG the upload check accepts, with the caption and every pixel row', () => {
    const png = Buffer.from(samplePng())
    expect(sniffKind(png)).toBe('png')
    expect(png.toString('latin1')).toContain(
      Buffer.from(SAMPLE_CAPTION, 'latin1').toString('latin1'),
    )
    const idat = png.indexOf('IDAT')
    const length = png.readUInt32BE(idat - 4)
    expect(inflateSync(png.subarray(idat + 4, idat + 4 + length))).toHaveLength(80 * 241)
  })
})
