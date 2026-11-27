import { useSyncExternalStore } from 'react'
import { type ParsedEmail, parseEmails, toParsed } from './parse-emails'

/*
 * What's typed in the Invite people sheet. It lives outside React, so it survives the sheet
 * closing by Esc, a failed request, the session-expired dialog and signing in again (spec: never
 * lose what was typed). Sending, or Cancel, clears it.
 */

/** A clash the server reported for this row (spec: every clashing row is marked at once). */
export type RowClash =
  | { kind: 'member' }
  | { kind: 'invited'; invitationId: string }
  /** A Vento Real Estate staff account: it can't join any organization (decision 0023). */
  | { kind: 'staff' }

export type InviteRow = ParsedEmail & {
  /** null = the role chosen for everyone. */
  roleId: string | null
  clash: RowClash | null
}

export type EntityMode = 'all' | 'some'

export type InviteDraft = {
  /** What's still in the box (an unfinished address, or what didn't fit under 20). */
  text: string
  rows: readonly InviteRow[]
  roleId: string | null
  /** "Give people different roles": each row shows its own role menu. Off by default. */
  perRow: boolean
  entityMode: EntityMode
  entityIds: readonly string[]
  /** "Removed 1 duplicate" or the 20-at-a-time line, announced politely. */
  notice: string | null
  /** The last refusal, for the footer (plan limit, clashes, connection). */
  error: unknown
}

export const BATCH_LIMIT_NOTICE =
  'You can invite 20 people at a time. Send these, then invite the rest.'

const empty = (limits: readonly string[] | null): InviteDraft => ({
  text: '',
  rows: [],
  roleId: null,
  perRow: false,
  // A granter limited to some entities can only give those (all ticked to start).
  entityMode: limits ? 'some' : 'all',
  entityIds: limits ?? [],
  notice: null,
  error: null,
})

let draft: InviteDraft = empty(null)
const listeners = new Set<() => void>()

function set(next: Partial<InviteDraft>) {
  draft = { ...draft, ...next }
  for (const listener of listeners) listener()
}

function noticeFor(duplicates: number, overflow: boolean): string | null {
  if (overflow) return BATCH_LIMIT_NOTICE
  if (duplicates === 0) return null
  return duplicates === 1 ? 'Removed 1 duplicate' : `Removed ${duplicates} duplicates`
}

export const inviteDraft = {
  get: () => draft,
  /** A fresh sheet for this granter (and an optional prefill from "Invite again"). */
  reset(limits: readonly string[] | null) {
    draft = empty(limits)
    for (const listener of listeners) listener()
  },
  setText: (text: string) => set({ text }),
  /** Turns text into rows; whatever doesn't fit stays in the box. */
  add(text: string, keep = '') {
    const result = parseEmails(
      text,
      draft.rows.map((r) => r.email),
    )
    const rows = result.added.map((p): InviteRow => ({ ...p, roleId: null, clash: null }))
    set({
      rows: [...draft.rows, ...rows],
      text: [result.rest, keep].filter(Boolean).join('\n'),
      notice: noticeFor(result.duplicates, result.rest.length > 0),
      error: null,
    })
    return rows.length
  },
  remove(email: string) {
    set({ rows: draft.rows.filter((r) => r.email !== email), notice: null, error: null })
  },
  /** After a send: the rows that went leave; any marked rows stay to be fixed. */
  removeMany(emails: readonly string[]) {
    const gone = new Set(emails)
    set({ rows: draft.rows.filter((r) => !gone.has(r.email)), notice: null })
  },
  /** One role for everyone again clears the rows' own choices. */
  setPerRow(perRow: boolean) {
    set({ perRow, rows: perRow ? draft.rows : draft.rows.map((r) => ({ ...r, roleId: null })) })
  },
  removeLast() {
    set({ rows: draft.rows.slice(0, -1), notice: null })
  },
  /** "Did you mean grace@gmail.com?" accepted. */
  replace(email: string, next: string) {
    const taken = draft.rows.some((r) => r.email === next)
    set({
      rows: taken
        ? draft.rows.filter((r) => r.email !== email)
        : draft.rows.map((r) => (r.email === email ? { ...r, ...toParsed(next), clash: null } : r)),
    })
  },
  setRowRole(email: string, roleId: string) {
    set({ rows: draft.rows.map((r) => (r.email === email ? { ...r, roleId } : r)) })
  },
  setRole: (roleId: string) => set({ roleId }),
  setEntityMode: (entityMode: EntityMode) => set({ entityMode }),
  setEntityIds: (entityIds: readonly string[]) => set({ entityIds }),
  setError: (error: unknown) => set({ error }),
  /** Marks every row the server says is already in or invited. */
  markClashes(
    members: readonly string[],
    invited: readonly { email: string; id: string }[],
    staff: readonly string[] = [],
  ) {
    const member = new Set(members.map((e) => e.toLowerCase()))
    const staffEmails = new Set(staff.map((e) => e.toLowerCase()))
    const pending = new Map(invited.map((i) => [i.email.toLowerCase(), i.id]))
    set({
      rows: draft.rows.map((r) => {
        if (staffEmails.has(r.email)) return { ...r, clash: { kind: 'staff' } }
        if (member.has(r.email)) return { ...r, clash: { kind: 'member' } }
        const id = pending.get(r.email)
        return id ? { ...r, clash: { kind: 'invited', invitationId: id } } : r
      }),
    })
  },
}

export function useInviteDraft(): InviteDraft {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => draft,
    () => draft,
  )
}
