import { consoleOrpc } from '../api'

export const superAdminsQuery = () => consoleOrpc.console.superAdmins.list.queryOptions()

/** Open staff invitations (at most 5), and expired ones from the last 30 days. */
export const invitationsQuery = () => consoleOrpc.console.superAdmins.invitations.queryOptions()

/** "Tunde Bello" → "Tunde" (spec: **Remove Tunde**). */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name

const when = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Africa/Lagos',
})

/** "29 Nov 2026, 14:30" (Lagos), as the spec writes an invitation's expiry. */
export function formatDateTime(iso: string): string {
  return when.format(new Date(iso)).replace(' at ', ', ')
}
