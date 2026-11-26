import type { ListTeamOutput, TeamMemberRow } from '@vento/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { testRoles } from '@/test/me'
import { defaultInviteRole, rememberInviteRole } from './default-role'

const roles = testRoles()
const member = (id: string, key: 'finance' | 'owner' | 'admin'): TeamMemberRow =>
  ({ kind: 'member', id, role: { id: `role-${key}`, key, name: key } }) as TeamMemberRow
const page = (items: TeamMemberRow[]) => ({ items }) as unknown as ListTeamOutput

afterEach(() => localStorage.clear())

describe('defaultInviteRole', () => {
  it('starts from the role last used to invite', () => {
    rememberInviteRole('org', 'role-hr')
    expect(defaultInviteRole(roles, 'org', [])).toBe('role-hr')
  })

  it('else picks the most common role, never owner or admin', () => {
    const team = page([
      member('1', 'owner'),
      member('2', 'admin'),
      member('3', 'admin'),
      member('4', 'finance'),
    ])
    expect(defaultInviteRole(roles, 'org', [team])).toBe('role-finance')
  })

  it('breaks a tie in favour of Sales', () => {
    const tie = page([
      member('1', 'finance'),
      {
        ...member('2', 'finance'),
        role: { id: 'role-sales', key: 'sales', name: 'Sales' },
      } as TeamMemberRow,
    ])
    expect(defaultInviteRole(roles, 'org', [tie])).toBe('role-sales')
  })

  it('else falls back to Sales', () => {
    expect(defaultInviteRole(roles, 'org', [])).toBe('role-sales')
  })
})
