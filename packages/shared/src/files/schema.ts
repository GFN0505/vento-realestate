import { z } from 'zod'
import { id } from '../common/schemas'
import { FILE_PURPOSE_KEYS, MAX_FILE_BYTES, partCount } from './purposes'

export const filePurpose = z.enum(FILE_PURPOSE_KEYS)

/** S3 allows 10,000 parts; ours are 5 MiB, so the largest purpose needs far fewer. */
const MAX_PARTS = partCount(MAX_FILE_BYTES)

const partNumber = z.number().int().min(1).max(MAX_PARTS)

// Path separators and control characters (C0, DEL, C1) never reach a Content-Disposition or
// the database; they become spaces.
// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point.
const UNSAFE_NAME = /[\u0000-\u001f\u007f-\u009f/\\]/g
// Invisible characters go without a trace: bidi overrides and isolates (U+202A–202E,
// U+2066–2069) can show "invoice<U+202E>fdp.exe" as "invoiceexe.pdf", and zero-width ones
// (U+200B–200F, U+FEFF) make two names look the same.
const INVISIBLE = /[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g
const NAME_LIMIT = 200

/** The browser's file name, cleaned and cut to 200 characters keeping its extension. */
export function cleanFileName(raw: string): string {
  const name = raw.replace(INVISIBLE, '').replace(UNSAFE_NAME, ' ').replace(/\s+/g, ' ').trim()
  if (name.length <= NAME_LIMIT) return name
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 && name.length - dot <= 10 ? name.slice(dot) : ''
  return `${name.slice(0, NAME_LIMIT - ext.length).trimEnd()}${ext}`
}

export const fileName = z
  .string()
  .max(1000)
  .transform(cleanFileName)
  .pipe(z.string().min(1, { message: 'This file has no name. Rename it and try again.' }))

/**
 * Start an upload: the server checks the purpose's feature, permission, size and declared type,
 * then answers with every part's upload link.
 */
export const startUploadInput = z.strictObject({
  purpose: filePurpose,
  name: fileName,
  /** Bytes, as the browser reports `File.size`. */
  size: z.number().int().min(1, { message: 'This file is empty.' }).max(Number.MAX_SAFE_INTEGER),
  /** `File.type`; may be empty (HEIC on many browsers), then the extension decides. */
  type: z.string().max(200),
})
export type StartUploadInput = z.input<typeof startUploadInput>

export const uploadPart = z.object({ partNumber, url: z.url() })
export type UploadPart = z.infer<typeof uploadPart>

export const startUploadOutput = z.object({
  fileId: id,
  /** Every part is this many bytes except the last. */
  partSize: z.number().int().min(1),
  parts: z.array(uploadPart).min(1),
  /** When the part links stop working; ask `signParts` for fresh ones after that. */
  expiresAt: z.iso.datetime(),
})
export type StartUploadOutput = z.infer<typeof startUploadOutput>

/** Fresh links for parts still to send (resume after the old ones expired). */
export const signPartsInput = z.strictObject({
  fileId: id,
  partNumbers: z
    .array(partNumber)
    .min(1)
    .max(MAX_PARTS)
    .refine((ns) => new Set(ns).size === ns.length, { message: 'Ask for each part once.' }),
})
export const signPartsOutput = z.object({
  parts: z.array(uploadPart).min(1),
  expiresAt: z.iso.datetime(),
})
export type SignPartsOutput = z.infer<typeof signPartsOutput>

/** Every part, with the ETag the bucket returned for it (exposed by the bucket's CORS rule). */
export const completeUploadInput = z.strictObject({
  fileId: id,
  parts: z
    .array(z.strictObject({ partNumber, etag: z.string().min(1).max(200) }))
    .min(1)
    .max(MAX_PARTS),
})
export const completeUploadOutput = z.object({
  fileId: id,
  /** As sniffed from the bytes, e.g. `application/pdf`. */
  contentType: z.string(),
  sizeBytes: z.number().int().min(1),
})
export type CompleteUploadOutput = z.infer<typeof completeUploadOutput>

/** Cancel an upload, or drop a finished one that no record uses yet (removed from a form). */
export const abortUploadInput = z.strictObject({ fileId: id })
