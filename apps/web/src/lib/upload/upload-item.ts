import { cleanFileName } from '@vento/shared'
import type { UploadPhase } from './upload-types'

export type UploadStatus = UploadPhase | 'failed' | 'done'

export type UploadItem = {
  /** This list's own key (the server's id only exists once started). */
  key: string
  file: File
  /** The name as it will be stored. */
  name: string
  size: number
  status: UploadStatus
  /** Bytes sent so far, including the part going up now. */
  loaded: number
  /** What went wrong, in words for the person; null unless failed. */
  error: string | null
  canRetry: boolean
  /** Set once done: what a record's save sends. */
  fileId: string | null
  /** From `guessType(name)` when added, e.g. a document type the row's picker starts on. */
  guess: string | null
}

export const PENDING: readonly UploadStatus[] = ['checking', 'uploading', 'paused']

export function newItem(key: string, file: File, guess: string | null): UploadItem {
  return {
    key,
    file,
    name: cleanFileName(file.name) || file.name,
    size: file.size,
    status: 'checking',
    loaded: 0,
    error: null,
    canRetry: false,
    fileId: null,
    guess,
  }
}

export const sameFile = (a: File, b: File) =>
  a.name === b.name && a.size === b.size && a.lastModified === b.lastModified

/** "Waiting for 1 upload…" on a save button while files are still going up. */
export function waitingForUploads(count: number): string {
  return `Waiting for ${count} ${count === 1 ? 'upload' : 'uploads'}…`
}
