import type { StaffJoinPreview } from '@vento/shared/console'
import { COPY } from '@/lib/auth-errors'

export const STAFF_WRONG_CODE = "That code didn't work. Check the time on your phone and try again."

/** The wrong-code sentence for this screen; any other message as it is. */
export const staffCodeError = (error: string) =>
  error === COPY.wrongCode ? STAFF_WRONG_CODE : error

const someone = (preview: StaffJoinPreview) =>
  preview.inviterName ?? 'a Vento Real Estate super-admin'

/** Spec §1 "Bad links": what a link that can't be used says, and whether it offers Sign in. */
export function closedWords(preview: StaffJoinPreview): {
  title: string
  body: string
  signIn: boolean
} {
  switch (preview.status) {
    case 'withdrawn':
      return {
        title: 'This invitation was withdrawn',
        body: 'Ask a Vento Real Estate super-admin if you still need access.',
        signIn: false,
      }
    case 'accepted':
      return {
        title: 'This invitation has already been used',
        body: 'Sign in with the email and password you set.',
        signIn: true,
      }
    case 'customer_account':
      return {
        title: "This email can't be a staff account",
        body: `${preview.email ?? 'This email'} now has a Vento Real Estate customer account, so it can't be a staff account. Ask ${someone(preview)} to invite a different email.`,
        signIn: false,
      }
    default:
      return {
        title: 'This invitation has expired',
        body: `Ask ${someone(preview)} to send a new one.`,
        signIn: false,
      }
  }
}

/** "Welcome, Tunde. You're a Vento Real Estate super-admin." */
export function welcome(name: string | null): string {
  const first = name?.trim().split(/\s+/)[0]
  return first
    ? `Welcome, ${first}. You're a Vento Real Estate super-admin.`
    : "Welcome. You're a Vento Real Estate super-admin."
}
