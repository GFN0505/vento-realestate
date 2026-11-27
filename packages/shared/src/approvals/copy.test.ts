import { describe, expect, it } from 'vitest'
import {
  cannotApproveInModuleText,
  chainText,
  companiesText,
  decidedMomentAgoMessage,
  duplicateRuleMessage,
  formatAmount,
  gapText,
  needsApprovalLine,
  noApproverMessage,
  policySentence,
  roleInRuleMessage,
  stepText,
  tooManyRowsMessage,
  whenText,
} from './copy'

const OWNER = '01900000-0000-7000-8000-00000000000a'
const ADMIN = '01900000-0000-7000-8000-00000000000b'
const FINANCE = '01900000-0000-7000-8000-00000000000c'
const names = { [OWNER]: 'Owner', [ADMIN]: 'Admin', [FINANCE]: 'Finance' }

describe('formatAmount', () => {
  it('groups naira without kobo when there are none', () => {
    expect(formatAmount('23520000.00', 'NGN')).toBe('₦23,520,000')
    expect(formatAmount('5000000', 'NGN')).toBe('₦5,000,000')
  })

  it('keeps kobo and handles foreign currencies and negatives', () => {
    expect(formatAmount('1250000.50', 'NGN')).toBe('₦1,250,000.50')
    expect(formatAmount('4000.00', 'USD')).toBe('$4,000')
    expect(formatAmount('-8960000.00', 'NGN')).toBe('−₦8,960,000')
    expect(formatAmount('0.00', 'NGN')).toBe('₦0')
  })

  it('keeps every digit of the largest storable amount', () => {
    expect(formatAmount('999999999999.99', 'NGN')).toBe('₦999,999,999,999.99')
  })
})

describe('chain text', () => {
  it('joins roles in a step with "or" and steps with arrows', () => {
    expect(stepText(['Owner', 'Admin'])).toBe('Owner or Admin')
    expect(stepText(['Owner', 'Admin', 'Finance'])).toBe('Owner, Admin or Finance')
    expect(chainText([[OWNER, ADMIN]], names)).toBe('Owner or Admin')
    expect(chainText([[FINANCE], [OWNER]], names)).toBe('Finance → Owner')
  })

  it('never shows an id for a role it cannot name', () => {
    expect(chainText([['01900000-0000-7000-8000-0000000000ff']], names)).toBe('a removed role')
  })

  it('writes the send sheet line with "then"', () => {
    expect(needsApprovalLine(['Finance', 'MD'])).toBe('Needs approval by Finance, then MD.')
  })
})

describe('policy and rule words', () => {
  it('writes the policy sentence from the rule', () => {
    expect(
      policySentence({
        actionKey: 'access.role.update',
        minAmount: null,
        stepTexts: ['Owner or Admin'],
        entityNames: 'all',
      }),
    ).toBe("Change a role's permissions needs approval by Owner or Admin.")
    expect(
      policySentence({
        actionKey: 'access.member.make_owner',
        minAmount: '20000000.00',
        stepTexts: ['Finance', 'MD'],
        entityNames: ['Parkview SPV'],
      }),
    ).toBe(
      'Make someone an owner over ₦20,000,000 in Parkview SPV needs approval by Finance, then MD.',
    )
  })

  it('reads When and Companies', () => {
    expect(whenText(null)).toBe('Any amount')
    expect(whenText('5000000.00')).toBe('Over ₦5,000,000')
    expect(companiesText('all')).toBe('all companies')
    expect(companiesText(['Parkview SPV', 'Lekki SPV'])).toBe('Parkview SPV and Lekki SPV')
  })

  it('uses the spec copy for refusals and warnings', () => {
    expect(
      duplicateRuleMessage({
        actionKey: 'access.role.update',
        minAmount: '5000000.00',
        entityNames: 'all',
      }),
    ).toBe(
      "There's already a rule for Change a role's permissions over ₦5,000,000 in all companies.",
    )
    expect(gapText(2, 'Parkview SPV')).toBe('Nobody can approve step 2 in Parkview SPV')
    expect(gapText(1, null)).toBe('Nobody can approve step 1')
    expect(noApproverMessage('Parkview SPV')).toBe(
      'Nobody else can approve this in Parkview SPV. Ask an owner to add an approver to the rule.',
    )
    expect(roleInRuleMessage('Site manager', 2)).toBe(
      'Site manager approves in 2 rules. Change those rules first.',
    )
    expect(roleInRuleMessage('Site manager', 1)).toBe(
      'Site manager approves in 1 rule. Change that rule first.',
    )
    expect(decidedMomentAgoMessage('Aisha Bello', 'approve')).toBe(
      'Aisha Bello approved this a moment ago.',
    )
    expect(tooManyRowsMessage(64210)).toBe(
      'Narrow the dates to export. This view has 64,210 entries.',
    )
    expect(cannotApproveInModuleText('Finance', 'projects')).toBe(
      "Finance can't approve in Projects & construction. Give it Approve on its role first.",
    )
  })
})
