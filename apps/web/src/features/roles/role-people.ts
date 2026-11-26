import type { Role } from '@vento/shared'

const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`

/** "3 people · 1 invited", "Nobody · 1 invited", or "Nobody" (spec roles list). */
export function peopleLine(role: Pick<Role, 'memberCount' | 'invitedCount'>): string {
  const base = role.memberCount === 0 ? 'Nobody' : people(role.memberCount)
  return role.invitedCount > 0 ? `${base} · ${role.invitedCount} invited` : base
}

/** Everyone holding it: active members and open invitations. */
export function holders(role: Pick<Role, 'memberCount' | 'invitedCount'>): number {
  return role.memberCount + role.invitedCount
}

/** The Delete item when someone holds the role: "Move 3 people to another role first". */
export function moveFirstLine(role: Pick<Role, 'memberCount' | 'invitedCount'>): string {
  return `Move ${people(holders(role))} to another role first`
}
