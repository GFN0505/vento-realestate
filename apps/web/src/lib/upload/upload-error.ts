import { ORPCError } from '@orpc/client'
import { type FilePurpose, fileProblem, startUploadInput } from '@vento/shared'
import { GENERIC_ERROR } from '@/lib/error-copy'
import { errorReason } from '@/lib/error-data'

/** `rejected`: this file can't be uploaded here; `refused`: not now or not by this person. */
export type UploadErrorKind = 'rejected' | 'refused' | 'failed' | 'cancelled'

export class UploadError extends Error {
  constructor(
    message: string,
    readonly kind: UploadErrorKind,
    readonly retryable: boolean,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'UploadError'
  }
}

/** The upload is gone on the server (aborted, swept or refused): start a fresh one, once. */
export class Restart extends Error {}

export const UPLOAD_FAILED =
  "This file didn't finish uploading. Check your connection and try again."
const SIGNED_OUT = 'Your session ended. Sign in, then try again.'

/**
 * The same first checks as the server, so a wrong file wastes no data: the clean name it will be
 * stored under, or why it can't be uploaded for this purpose.
 */
export function checkFile(
  purpose: FilePurpose,
  file: File,
): { ok: true; name: string } | { ok: false; problem: string } {
  const problem = fileProblem(purpose, file)
  if (problem) return { ok: false, problem: problem.message }
  const parsed = startUploadInput.safeParse({
    purpose,
    name: file.name,
    size: file.size,
    type: file.type,
  })
  if (!parsed.success) {
    return { ok: false, problem: parsed.error.issues[0]?.message ?? GENERIC_ERROR }
  }
  return { ok: true, name: parsed.data.name }
}

/** Any failure, in words for the person and with whether Try again can help. */
export function toUploadError(error: unknown, cancelled: boolean): UploadError {
  if (cancelled) return new UploadError('', 'cancelled', false, { cause: error })
  if (error instanceof UploadError) return error
  if (error instanceof Restart) return new UploadError(UPLOAD_FAILED, 'failed', true)
  if (!(error instanceof ORPCError)) {
    return new UploadError(UPLOAD_FAILED, 'failed', true, { cause: error })
  }
  const reason = errorReason(error)
  if (reason === 'file_type' || reason === 'file_too_large') {
    return new UploadError(error.message, 'rejected', false, { cause: error })
  }
  if (error.code === 'UNAUTHORIZED') return new UploadError(SIGNED_OUT, 'refused', true)
  if (error.code === 'TOO_MANY_REQUESTS') {
    return new UploadError(error.message, 'refused', true, { cause: error })
  }
  if (error.code === 'FORBIDDEN' || error.code === 'NOT_FOUND') {
    return new UploadError(error.message, 'refused', false, { cause: error })
  }
  const message = error.defined && error.status < 500 ? error.message : GENERIC_ERROR
  return new UploadError(message, 'failed', true, { cause: error })
}
