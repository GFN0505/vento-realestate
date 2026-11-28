import { crc32, deflateSync } from 'node:zlib'

// Tiny sample documents for the seed and the e2e fixtures: a one-page PDF and a small PNG, both
// marked as fictional, so the vault's preview and download work locally with real bytes and
// nobody mistakes them for a title document.

export const SAMPLE_CAPTION = 'Fictional sample · not a real document'

/** PDF string literal: escapes, and Latin-1 characters (· is \267) as octal. */
function pdfText(text: string): string {
  return [...text]
    .map((ch) => {
      if (ch === '(' || ch === ')' || ch === '\\') return `\\${ch}`
      const code = ch.charCodeAt(0)
      if (code < 0x80) return ch
      return code <= 0xff ? `\\${code.toString(8)}` : '?'
    })
    .join('')
}

/** A valid one-page A4 PDF with `title` and the caption, in Helvetica. */
export function samplePdf(title: string): Uint8Array {
  const content = `BT /F1 20 Tf 72 760 Td (${pdfText(title)}) Tj 0 -34 Td /F1 14 Tf (${pdfText(SAMPLE_CAPTION)}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ]
  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((obj, i) => {
    offsets.push(body.length)
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`
  })
  const xref = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  // Every character is ASCII by now, so string length is the byte offset.
  return new Uint8Array(Buffer.from(body, 'latin1'))
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typed = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typed))
  return Buffer.concat([length, typed, crc])
}

/**
 * A 240×80 grey PNG with a darker frame, the caption in its Description text chunk (drawing
 * text would need a font renderer; the vault shows the file name beside it anyway).
 */
export function samplePng(): Uint8Array {
  const width = 240
  const height = 80
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 0, 0, 0, 0], 8) // 8-bit greyscale, no interlace
  const rows: Buffer[] = []
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(width + 1) // filter byte 0, then pixels
    for (let x = 0; x < width; x++) {
      const frame = x < 4 || y < 4 || x >= width - 4 || y >= height - 4
      row[x + 1] = frame ? 0x70 : 0xe8
    }
    rows.push(row)
  }
  const text = Buffer.from(`Description\0${SAMPLE_CAPTION}`, 'latin1')
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', header),
      chunk('tEXt', text),
      chunk('IDAT', deflateSync(Buffer.concat(rows))),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  )
}
