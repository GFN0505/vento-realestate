import { consoleOrpc } from '../api'

export const superAdminsQuery = () => consoleOrpc.console.superAdmins.list.queryOptions()

/** "tunde.bello@ventoerp.com" → "Tunde": before the server names the account, its email does. */
export function nameFromEmail(email: string): string {
  const first = email.trim().split('@')[0]?.split(/[._-]/)[0] ?? ''
  return first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : email
}

/** "Tunde Bello" → "Tunde" (spec: **Remove Tunde**). */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name
