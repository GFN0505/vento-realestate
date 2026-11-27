import { type PeopleLimit, placesLeft } from './plan-places'
import type { InviteRow } from './use-invite-draft'

/** What's wrong with a row, or null. Shown on the row itself, never in a banner (spec). */
export function rowProblem(row: InviteRow, viewerEmail: string): string | null {
  if (!row.valid) return 'Check this email'
  if (row.email === viewerEmail.toLowerCase()) return "That's you"
  if (row.clash?.kind === 'member') return 'Already a member'
  if (row.clash?.kind === 'invited') return 'Already invited'
  if (row.clash?.kind === 'staff') {
    // Neutral on purpose (audit L4): an owner learns only that this email can't join.
    return "This email can't be invited. Use a different email."
  }
  return null
}

export type InvitePlan = {
  /** Rows that will go: no problem marked on them. Send names this count. */
  sendable: InviteRow[]
  /** Rows marked with a problem; they're skipped, never block the rest. */
  problems: number
  /** Owners on a limited plan: places left, and the sendable rows past them. */
  left: number | null
  over: ReadonlySet<string>
}

/**
 * Which rows Send will invite. Marked rows are skipped so the others still go; past the plan's
 * places (owners only), the extra rows are named so the owner knows which won't fit.
 */
export function planInvite(
  rows: readonly InviteRow[],
  viewerEmail: string,
  limit: PeopleLimit | null,
): InvitePlan {
  const sendable = rows.filter((row) => rowProblem(row, viewerEmail) === null)
  const left = limit ? placesLeft(limit) : null
  const over = new Set(left === null ? [] : sendable.slice(left).map((row) => row.email))
  return { sendable, problems: rows.length - sendable.length, left, over }
}
