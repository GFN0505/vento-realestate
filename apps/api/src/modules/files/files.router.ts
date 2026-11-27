import { serviceContext } from '@/access/service-context'
import { member } from '@/orpc'
import { abortUpload, completeUpload, signUploadParts, startUpload } from './files.service'

// Built on `member` (tab guard, two-step gate). The contract is `platform` because the feature
// and permission depend on the upload's purpose: the service checks both, feature first.
export const filesRouter = {
  startUpload: member.files.startUpload.handler(({ context, input }) =>
    startUpload(serviceContext(context), input),
  ),
  signParts: member.files.signParts.handler(({ context, input }) =>
    signUploadParts(serviceContext(context), input),
  ),
  completeUpload: member.files.completeUpload.handler(({ context, input }) =>
    completeUpload(serviceContext(context), input),
  ),
  abortUpload: member.files.abortUpload.handler(({ context, input }) =>
    abortUpload(serviceContext(context), input.fileId),
  ),
}
