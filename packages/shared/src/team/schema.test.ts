import { describe, expect, it } from 'vitest'
import { errorMap } from '../common/errors'
import { listTeamInput, teamRow } from './schema'

const ID = '01936f1e-8b2a-7c3d-9e4f-5a6b7c8d9e0f'
const role = { id: ID, key: 'sales', name: 'Sales' }

describe('team schemas', () => {
  it('defaults to everyone, page 1, 50 per page', () => {
    expect(listTeamInput.parse({})).toEqual({ page: 1, pageSize: 50, show: 'everyone' })
  })

  it('trims the search and refuses fields it does not know', () => {
    expect(listTeamInput.parse({ q: '  aisha ' }).q).toBe('aisha')
    expect(listTeamInput.safeParse({ organizationId: ID }).success).toBe(false)
    expect(listTeamInput.safeParse({ q: 'x'.repeat(101) }).success).toBe(false)
  })

  it('tells member, invitation and removed rows apart', () => {
    const invitation = teamRow.parse({
      kind: 'invitation',
      id: ID,
      email: 'aisha@ventohomes.ng',
      role,
      access: { kind: 'some', entities: [{ id: ID, name: 'Parkview' }], hiddenCount: 1 },
      status: 'expired',
      invitedByName: 'Olumide Bankole',
      lastSentAt: '2026-11-20T10:00:00.000Z',
      expiresAt: '2026-11-27T10:00:00.000Z',
      delivery: 'bounced',
      deliveryChangedAt: null,
      can: { resend: true, withdraw: true },
      readOnly: null,
    })
    expect(invitation.kind).toBe('invitation')
    const removed = teamRow.parse({
      kind: 'removed',
      id: ID,
      userId: ID,
      name: 'Grace Umeh',
      email: 'grace@ventohomes.ng',
      role,
      removedAt: '2026-11-12T10:00:00.000Z',
      removedByName: null,
    })
    expect(removed.kind).toBe('removed')
    expect(teamRow.safeParse({ ...removed, kind: 'member' }).success).toBe(false)
  })

  it('carries every clashing email in a conflict', () => {
    const data = errorMap.CONFLICT.data.parse({
      reason: 'already_invited',
      alreadyMembers: ['grace@ventohomes.ng'],
      alreadyInvited: [{ email: 'aisha@ventohomes.ng', id: ID }],
    })
    expect(data.alreadyInvited?.[0]?.id).toBe(ID)
  })
})
