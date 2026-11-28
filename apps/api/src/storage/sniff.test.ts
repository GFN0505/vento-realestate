import { describe, expect, it } from 'vitest'
import { sniffKind } from './sniff'

const bytes = (...parts: (number[] | string)[]): Uint8Array =>
  Uint8Array.from(parts.flatMap((p) => (typeof p === 'string' ? [...Buffer.from(p)] : p)))

/** An ISO media file: box size, "ftyp", major brand, minor version. */
const ftyp = (brand: string) => bytes([0, 0, 0, 24], 'ftyp', brand, [0, 0, 0, 0], 'mif1heic')

describe('sniffKind', () => {
  it('recognises a PDF, a JPEG and a PNG by their first bytes', () => {
    expect(sniffKind(bytes('%PDF-1.7\n%âã'))).toBe('pdf')
    expect(sniffKind(bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0x10], 'JFIF'))).toBe('jpeg')
    expect(sniffKind(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]))).toBe(
      'png',
    )
  })

  it.each(['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'])('recognises HEIC brand %s', (brand) => {
    expect(sniffKind(ftyp(brand))).toBe('heic')
  })

  it('refuses a Windows program renamed .pdf', () => {
    expect(sniffKind(bytes('MZ', [0x90, 0, 3, 0, 0, 0, 4, 0], 'This program'))).toBeNull()
  })

  it('refuses a zip (and so Word and Excel files)', () => {
    expect(sniffKind(bytes([0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0]))).toBeNull()
  })

  it('refuses SVG and HTML, which can carry scripts', () => {
    expect(sniffKind(bytes('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg">'))).toBe(
      null,
    )
    expect(sniffKind(bytes('<!doctype html><script>alert(1)</script>'))).toBeNull()
  })

  it('accepts a PDF header anywhere in the first 1024 bytes, as PDF readers do', () => {
    expect(sniffKind(bytes(' %PDF-1.4'))).toBe('pdf')
    expect(sniffKind(bytes(' '.repeat(1019), '%PDF-1.4'))).toBe('pdf')
    expect(sniffKind(bytes(' '.repeat(1020), '%PDF-1.4'))).toBeNull()
  })

  it('keeps a PNG a PNG even if "%PDF-" appears in it, and refuses a video that does', () => {
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    expect(sniffKind(bytes(png, '%PDF-1.4'))).toBe('png')
    expect(sniffKind(bytes([0, 0, 0, 24], 'ftypmp42', [0, 0, 0, 0], '%PDF-1.4'))).toBeNull()
  })

  it('refuses other ISO brands and empty input', () => {
    expect(sniffKind(ftyp('mp42'))).toBeNull()
    expect(sniffKind(ftyp('avif'))).toBeNull()
    expect(sniffKind(new Uint8Array())).toBeNull()
  })
})
