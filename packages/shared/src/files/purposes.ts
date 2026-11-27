// What each kind of upload may be (decision 0025). Data, not code paths: a new file feature
// (receipts, site photos, KYC) adds one entry here and one value to the `file_purpose` enum.
// No zod here, so the web's upload code can import it without the schemas.

import type { PermissionAction, PermissionModule } from '../access/permissions'
import type { FeatureKey } from '../features/catalog'

export const MIB = 1024 * 1024

/** Every upload goes to the bucket in parts of this size (the last part may be smaller). */
export const FILE_PART_SIZE = 5 * MIB

/** Part upload links last 15 minutes; the browser asks for fresh ones when they expire. */
export const PART_URL_SECONDS = 15 * 60

/** Download and preview links last 5 minutes. */
export const DOWNLOAD_URL_SECONDS = 300

/** Uploads one person may have started and not finished at once. */
export const MAX_UPLOADS_IN_PROGRESS = 20

/**
 * File kinds we accept anywhere, with the content type the server serves them as. The server
 * decides the kind from the file's first bytes, never the name or the browser's type; the
 * extensions only let the browser's picker filter and give a first check before uploading.
 */
export const FILE_KINDS = {
  pdf: { contentType: 'application/pdf', extensions: ['pdf'], label: 'PDF' },
  jpeg: { contentType: 'image/jpeg', extensions: ['jpg', 'jpeg'], label: 'JPG' },
  png: { contentType: 'image/png', extensions: ['png'], label: 'PNG' },
  heic: { contentType: 'image/heic', extensions: ['heic', 'heif'], label: 'HEIC' },
} as const satisfies Record<
  string,
  { contentType: string; extensions: readonly string[]; label: string }
>
export type FileKind = keyof typeof FILE_KINDS

/** Browsers report HEIC (and some others) as one of these, so the extension decides at start. */
const UNKNOWN_BROWSER_TYPES = ['', 'application/octet-stream']

/** Also reported for the same kinds by some browsers and phones. */
const TYPE_ALIASES: Record<string, FileKind> = {
  'image/jpg': 'jpeg',
  'image/pjpeg': 'jpeg',
  'image/heif': 'heic',
  'image/heic-sequence': 'heic',
  'image/heif-sequence': 'heic',
  'application/x-pdf': 'pdf',
}

export type FilePurposeDef = {
  /** The catalog feature; unavailable → NOT_FOUND, as the middleware would answer. */
  feature: FeatureKey
  /** The permission an upload needs; missing → FORBIDDEN. */
  module: PermissionModule
  action: PermissionAction
  /** Completes "Only … can ___." in the refusal. */
  doing: string
  maxBytes: number
  kinds: readonly FileKind[]
  /** Shown when the file isn't one of `kinds`. */
  kindMessage: string
}

export const FILE_PURPOSE_KEYS = ['title_document'] as const
export type FilePurpose = (typeof FILE_PURPOSE_KEYS)[number]

export const FILE_PURPOSES = {
  title_document: {
    feature: 'land',
    module: 'land',
    action: 'create',
    doing: 'upload title documents',
    maxBytes: 25 * MIB,
    kinds: ['pdf', 'jpeg', 'png', 'heic'],
    kindMessage: 'Upload a PDF or a photo (JPG, PNG or HEIC).',
  },
} as const satisfies Record<FilePurpose, FilePurposeDef>

/** The largest file any purpose accepts (the contract's outer bound). */
export const MAX_FILE_BYTES = Math.max(...Object.values(FILE_PURPOSES).map((p) => p.maxBytes))

/** How many parts a file of this size is uploaded in. */
export function partCount(sizeBytes: number): number {
  return Math.max(1, Math.ceil(sizeBytes / FILE_PART_SIZE))
}

/** The exact bytes part `partNumber` carries: FILE_PART_SIZE, the remainder for the last. */
export function partBytes(sizeBytes: number, partNumber: number): number {
  return partNumber < partCount(sizeBytes)
    ? FILE_PART_SIZE
    : sizeBytes - (partCount(sizeBytes) - 1) * FILE_PART_SIZE
}

/** "31 MB", "4.2 MB", "25.3 MB": never rounds an over-limit file down to the limit. */
export function formatFileSize(bytes: number, limit?: number): string {
  const mb = bytes / MIB
  const whole = Math.round(mb)
  if (limit !== undefined && bytes > limit && whole * MIB <= limit) {
    // Just over the limit: round up, so it never reads "25 MB. Upload files up to 25 MB."
    return `${Math.ceil(mb * 10) / 10} MB`
  }
  if (mb < 10) return `${Math.max(0.1, Math.round(mb * 10) / 10)} MB`
  return `${whole} MB`
}

export function tooLargeMessage(sizeBytes: number, purpose: FilePurpose): string {
  const max = FILE_PURPOSES[purpose].maxBytes
  return `This file is ${formatFileSize(sizeBytes, max)}. Upload files up to ${formatFileSize(max)}.`
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
}

/**
 * The kind the browser claims, from its type or (when it doesn't know) the extension. Only a
 * first check before uploading; completion sniffs the bytes.
 */
export function declaredKind(name: string, type: string): FileKind | null {
  const t = type.trim().toLowerCase()
  if (!UNKNOWN_BROWSER_TYPES.includes(t)) {
    const kinds = Object.entries(FILE_KINDS) as [FileKind, (typeof FILE_KINDS)[FileKind]][]
    return kinds.find(([, k]) => k.contentType === t)?.[0] ?? TYPE_ALIASES[t] ?? null
  }
  const ext = extensionOf(name)
  const kinds = Object.entries(FILE_KINDS) as [FileKind, (typeof FILE_KINDS)[FileKind]][]
  return kinds.find(([, k]) => (k.extensions as readonly string[]).includes(ext))?.[0] ?? null
}

export type FileProblem = { reason: 'file_type' | 'file_too_large'; message: string }

/**
 * Why this file can't be uploaded for this purpose, or null. The web checks before starting
 * (no wasted bandwidth); the server checks again at start and sniffs the bytes at the end.
 */
export function fileProblem(
  purpose: FilePurpose,
  file: { name: string; size: number; type: string },
): FileProblem | null {
  const def = FILE_PURPOSES[purpose]
  const kind = declaredKind(file.name, file.type)
  if (!kind || !(def.kinds as readonly FileKind[]).includes(kind)) {
    return { reason: 'file_type', message: def.kindMessage }
  }
  if (file.size > def.maxBytes) {
    return { reason: 'file_too_large', message: tooLargeMessage(file.size, purpose) }
  }
  return null
}

/** The `accept` attribute for a file input, e.g. ".pdf,.jpg,.jpeg,.png,.heic,.heif,application/pdf,…". */
export function acceptFor(purpose: FilePurpose): string {
  const kinds = FILE_PURPOSES[purpose].kinds.map((k) => FILE_KINDS[k])
  return [
    ...kinds.flatMap((k) => k.extensions.map((e) => `.${e}`)),
    ...kinds.map((k) => k.contentType),
  ].join(',')
}
