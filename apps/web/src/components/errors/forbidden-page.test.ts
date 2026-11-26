import { describe, expect, it } from 'vitest'
import { whoToAskSentence } from './forbidden-page'

describe('403 sentence', () => {
  it('names the roles and who to ask, with the role in lower case', () => {
    expect(
      whoToAskSentence('HR & payroll', {
        roles: ['owners', 'admins', 'HR staff', 'finance staff'],
        contacts: [{ name: 'Olumide Bankole', roleName: 'Owner' }],
      }),
    ).toBe(
      'HR & payroll is for owners, admins, HR staff and finance staff. Ask Olumide Bankole (owner) to change your access.',
    )
  })

  it('offers both contacts when there are two', () => {
    expect(
      whoToAskSentence('Finance', {
        roles: ['owners'],
        contacts: [
          { name: 'Olumide Bankole', roleName: 'Owner' },
          { name: 'Ada Obi', roleName: 'Admin' },
        ],
      }),
    ).toBe(
      'Finance is for owners. Ask Olumide Bankole (owner) or Ada Obi (admin) to change your access.',
    )
  })

  it('falls back to owners and admins when nobody else can be named', () => {
    expect(whoToAskSentence('Reports', { roles: [], contacts: [] })).toBe(
      'Ask an owner or admin to change your access.',
    )
  })
})
