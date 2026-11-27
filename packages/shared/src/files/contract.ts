import { z } from 'zod'
import { platform } from '../common/errors'
import {
  abortUploadInput,
  completeUploadInput,
  completeUploadOutput,
  signPartsInput,
  signPartsOutput,
  startUploadInput,
  startUploadOutput,
} from './schema'

// Private file uploads (decision 0025). The bytes go straight to the bucket; these only sign
// links and finish the upload. `platform`, because the feature depends on the purpose: the
// service checks the purpose's feature (NOT_FOUND) and then its permission (FORBIDDEN), in the
// middleware's order. A file is only ever read through the record that holds it, so there is no
// download procedure here.
export const filesContract = {
  /**
   * BAD_REQUEST `file_type` / `file_too_large` (the purpose's rules, from the declared type and
   * size); TOO_MANY_REQUESTS with 20 uploads already in progress for this person.
   */
  startUpload: platform.input(startUploadInput).output(startUploadOutput),
  /** The uploader's own unfinished upload only; anything else is NOT_FOUND. */
  signParts: platform.input(signPartsInput).output(signPartsOutput),
  /**
   * Checks size and content (first bytes) and records a SHA-256. A file that fails is deleted:
   * BAD_REQUEST `file_type` / `file_too_large`; missing or wrong parts: `upload_incomplete`.
   * Calling it again for a finished file returns the same answer.
   */
  completeUpload: platform.input(completeUploadInput).output(completeUploadOutput),
  /** The uploader's own upload that no record uses; NOT_FOUND otherwise. */
  abortUpload: platform.input(abortUploadInput).output(z.void()),
}
