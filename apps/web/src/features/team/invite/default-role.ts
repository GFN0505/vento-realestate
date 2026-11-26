import type { ListTeamOutput, Role } from '@vento/shared'
import { readItem, writeItem } from '@/lib/storage'

/*
 * The role the invite sheet starts with, so Send has one thing to wait for at most. Never an
 * owner or admin (nobody gets full access by accident): the role this person last invited with,
 * else the most common role in the team, else Sales.
 */

const key = (organizationId: string) => `vento.invite.role.${organizationId}`
const ordinary = (role: Pick<Role, 'key'>) => role.key !== 'owner' && role.key !== 'admin'

export function rememberInviteRole(organizationId: string, roleId: string): void {
  writeItem(key(organizationId), roleId)
}

export function defaultInviteRole(
  roles: readonly Role[],
  organizationId: string | undefined,
  pages: readonly (ListTeamOutput | undefined)[],
): string | null {
  const choices = roles.filter(ordinary)
  const last = organizationId ? readItem(key(organizationId)) : null
  if (last && choices.some((r) => r.id === last)) return last

  const counts = new Map<string, number>()
  const seen = new Set<string>()
  for (const row of pages.flatMap((page) => page?.items ?? [])) {
    if (row.kind !== 'member' || seen.has(row.id)) continue
    seen.add(row.id)
    counts.set(row.role.id, (counts.get(row.role.id) ?? 0) + 1)
  }
  const most = Math.max(0, ...choices.map((r) => counts.get(r.id) ?? 0))
  // Ties (a team of one per role) go to Sales, the role most teams invite most.
  const tied = choices.filter((r) => most > 0 && counts.get(r.id) === most)
  const common = tied.find((r) => r.key === 'sales') ?? tied[0]
  return (common ?? choices.find((r) => r.key === 'sales') ?? choices[0])?.id ?? null
}
