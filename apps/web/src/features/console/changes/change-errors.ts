import { ORPCError } from '@orpc/client'
import { apiErrorMessage } from '@/lib/api-errors'
import { connection } from '@/lib/connection'
import { errorReason, isNetworkFailure } from '@/lib/error-data'
import { consoleRefusal } from '../api'

export const NETWORK_CHANGE_ERROR =
  "Couldn't reach Vento Real Estate. Your change wasn't made. Try again."
export const PROOF_NEEDED = "Confirm it's you to make this change, then try again."

export type ChangeNext = 'end_trial' | 'change_ai_budget' | 'resend_invitation'

export type ChangeFailure = {
  message: string
  /** `platform_stale`: the page and the preview are refreshed, the sheet stays open. */
  stale: boolean
  /** The console's next step, e.g. an **End trial** link (plan §6.1). */
  next: ChangeNext | null
  /** `resend_invitation`: the staff invitation already open for that email. */
  invitationId: string | null
  /** The session ended: the Session expired dialog says so; nothing to show here. */
  silent: boolean
}

const NEXTS: readonly ChangeNext[] = ['end_trial', 'change_ai_budget', 'resend_invitation']

function nextOf(error: ORPCError<string, unknown>): Pick<ChangeFailure, 'next' | 'invitationId'> {
  const data: unknown = error.data
  if (typeof data !== 'object' || data === null) return { next: null, invitationId: null }
  const next = 'next' in data ? NEXTS.find((n) => n === data.next) : undefined
  const id =
    'invitationId' in data && typeof data.invitationId === 'string' ? data.invitationId : null
  return { next: next ?? null, invitationId: id }
}

/** What a refused preview or apply says. Operation messages are already plain words. */
export function changeFailure(error: unknown): ChangeFailure {
  const plain = { stale: false, next: null, invitationId: null, silent: false }
  if (isNetworkFailure(error) || !connection.isOnline()) {
    return { ...plain, message: NETWORK_CHANGE_ERROR }
  }
  if (error instanceof ORPCError && error.code === 'UNAUTHORIZED') {
    return { ...plain, message: '', silent: true }
  }
  if (consoleRefusal(error) === 'console_window_closed') return { ...plain, message: PROOF_NEEDED }
  if (error instanceof ORPCError && error.code === 'CONFLICT') {
    const reason = errorReason(error)
    if (reason === 'platform_stale') return { ...plain, message: error.message, stale: true }
    if (reason === 'platform_refused') return { ...plain, message: error.message, ...nextOf(error) }
  }
  return { ...plain, message: apiErrorMessage(error) }
}
