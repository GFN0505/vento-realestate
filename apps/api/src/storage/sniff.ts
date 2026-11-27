import type { FileKind } from '@vento/shared'

// The file's kind from its first bytes (decision 0025): never from the name or the browser's
// type. Four kinds don't justify a dependency.

/** Enough of the file for every signature below. */
export const SNIFF_BYTES = 4096

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0): boolean =>
  bytes.length >= offset + signature.length && signature.every((b, i) => bytes[offset + i] === b)

const ascii = (text: string): number[] => [...text].map((c) => c.charCodeAt(0))

const PDF = ascii('%PDF-')
/** Readers (Adobe's rule) accept the PDF header anywhere in the first 1024 bytes; scanners put junk first. */
const PDF_WITHIN = 1024
const JPEG = [0xff, 0xd8, 0xff]
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const FTYP = ascii('ftyp')
/**
 * HEIF major brands for still images and sequences from phones (iPhone: heic; Samsung: mif1).
 * `mif1` and `msf1` are generic HEIF brands, so an AVIF can carry them too; it is then served
 * as image/heic, which is harmless (an image the browser may not preview, never a script).
 */
const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'])

function hasPdfHeader(bytes: Uint8Array): boolean {
  const last = Math.min(bytes.length - PDF.length, PDF_WITHIN - PDF.length)
  for (let at = 0; at <= last; at++) if (startsWith(bytes, PDF, at)) return true
  return false
}

function isoBrand(bytes: Uint8Array): string | null {
  // ISO base media: 4-byte box size, then "ftyp", then the 4-byte major brand.
  if (!startsWith(bytes, FTYP, 4) || bytes.length < 12) return null
  return String.fromCharCode(...bytes.subarray(8, 12))
}

export function sniffKind(bytes: Uint8Array): FileKind | null {
  // The fixed-offset signatures first, so a JPEG or PNG that happens to contain "%PDF-" stays one.
  if (startsWith(bytes, JPEG)) return 'jpeg'
  if (startsWith(bytes, PNG)) return 'png'
  const brand = isoBrand(bytes)
  if (brand) return HEIC_BRANDS.has(brand) ? 'heic' : null
  if (hasPdfHeader(bytes)) return 'pdf'
  return null
}
