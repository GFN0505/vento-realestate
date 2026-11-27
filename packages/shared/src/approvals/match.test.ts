import { describe, expect, it } from 'vitest'
import { belowThresholdLine, type MatchableRule, matchRule } from './match'

// The matcher is generic over amounts; brick 4's actions have none, so thresholds are exercised
// on a catalog key with made-up amounts.
type Rule = MatchableRule & { name: string }

const PARKVIEW = '01900000-0000-7000-8000-000000000001'
const LEKKI = '01900000-0000-7000-8000-000000000002'

const rule = (
  name: string,
  minAmount: string | null,
  entityIds: Rule['entityIds'] = 'all',
): Rule => ({
  name,
  actionKey: 'access.role.update',
  minAmount,
  entityIds,
})

const query = (ngnAmount: string | null, entityId: string | null = PARKVIEW) => ({
  actionKey: 'access.role.update' as const,
  entityId,
  ngnAmount,
})

describe('matchRule', () => {
  it('finds no rule when the organization has none for the action', () => {
    expect(matchRule([], query('100.00'))).toBeNull()
    const other = { ...rule('owners', null), actionKey: 'access.member.make_owner' as const }
    expect(matchRule([other], query('100.00'))).toBeNull()
  })

  it("uses the company's own rules over all-company rules", () => {
    const rules = [rule('all', null), rule('parkview', null, [PARKVIEW])]
    expect(matchRule(rules, query(null))?.name).toBe('parkview')
  })

  it('lets a company rule loosen an all-company one', () => {
    const rules = [rule('all-any', null), rule('parkview-over-10m', '10000000.00', [PARKVIEW])]
    expect(matchRule(rules, query('5000000.00'))).toBeNull()
    expect(matchRule(rules, query('5000000.00', LEKKI))?.name).toBe('all-any')
  })

  it('falls back to all-company rules for a company with none of its own', () => {
    const rules = [rule('all', null), rule('lekki', null, [LEKKI])]
    expect(matchRule(rules, query(null, PARKVIEW))?.name).toBe('all')
  })

  it('uses all-company rules for organization-wide actions', () => {
    const rules = [rule('parkview', null, [PARKVIEW]), rule('all', null)]
    expect(matchRule(rules, query(null, null))?.name).toBe('all')
  })

  it('picks the highest threshold the amount is over', () => {
    const rules = [
      rule('over-5m', '5000000.00'),
      rule('over-20m', '20000000.00'),
      rule('over-1m', '1000000.00'),
    ]
    expect(matchRule(rules, query('23520000.00'))?.name).toBe('over-20m')
    expect(matchRule(rules, query('8000000.00'))?.name).toBe('over-5m')
  })

  it('does not treat an amount equal to the threshold as over it', () => {
    const rules = [rule('over-5m', '5000000.00')]
    expect(matchRule(rules, query('5000000.00'))).toBeNull()
    expect(matchRule(rules, query('5000000.01'))?.name).toBe('over-5m')
  })

  it('compares a foreign amount at the NGN value the module recorded', () => {
    // $4,000 at ₦1,550.25 = ₦6,201,000.00: over ₦5m even though 4000 is not.
    const rules = [rule('over-5m', '5000000.00')]
    expect(matchRule(rules, query('6201000.00'))?.name).toBe('over-5m')
  })

  it('falls back to the any-amount rule when no threshold is passed', () => {
    const rules = [rule('any', null), rule('over-20m', '20000000.00')]
    expect(matchRule(rules, query('1000.00'))?.name).toBe('any')
    expect(matchRule(rules, query('25000000.00'))?.name).toBe('over-20m')
  })

  it('matches only any-amount rules for an action without an amount', () => {
    expect(matchRule([rule('over-5m', '5000000.00')], query(null))).toBeNull()
    expect(matchRule([rule('over-5m', '5000000.00'), rule('any', null)], query(null))?.name).toBe(
      'any',
    )
  })

  it('applies the make-owner rules to an owner invitation', () => {
    const owners = { ...rule('owners', null), actionKey: 'access.member.make_owner' as const }
    const q = { actionKey: 'access.invitation.owner' as const, entityId: null, ngnAmount: null }
    expect(matchRule([owners], q)?.name).toBe('owners')
  })
})

describe('belowThresholdLine', () => {
  it('names the lowest threshold', () => {
    expect(belowThresholdLine([rule('a', '20000000.00'), rule('b', '5000000.00')])).toBe(
      'Below ₦5,000,000: no approval needed',
    )
  })

  it('is empty when an any-amount rule covers everything, or there are no rules', () => {
    expect(belowThresholdLine([rule('a', '5000000.00'), rule('b', null)])).toBeNull()
    expect(belowThresholdLine([])).toBeNull()
  })
})
