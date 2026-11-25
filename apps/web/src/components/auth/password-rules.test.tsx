import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { meetsLocalRules, PasswordRules } from './password-rules'

const LABELS = [
  'At least 8 characters',
  'An uppercase letter',
  'A lowercase letter',
  'A number',
  'A special character, like ! @ # ?',
]

function ruleState(label: string) {
  return screen.getByText(label).closest('li')?.getAttribute('data-state')
}

describe('PasswordRules', () => {
  it('shows the five rules, all unticked, for an empty password', () => {
    render(<PasswordRules password="" />)

    for (const label of LABELS) expect(ruleState(label)).toBe('pending')
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
  })

  it('ticks each rule as it is met', () => {
    render(<PasswordRules password="lekki2026" />)

    expect(ruleState('At least 8 characters')).toBe('met')
    expect(ruleState('A lowercase letter')).toBe('met')
    expect(ruleState('A number')).toBe('met')
    expect(ruleState('An uppercase letter')).toBe('pending')
    expect(ruleState('A special character, like ! @ # ?')).toBe('pending')
  })

  it('ticks every rule for a strong password', () => {
    render(<PasswordRules password="Vento-Test-2026!" />)

    expect(screen.getAllByText('Done:')).toHaveLength(5)
  })

  it('turns unmet rules rose after a submit', () => {
    render(<PasswordRules password="lekki" showUnmetAsFailed />)

    expect(ruleState('A lowercase letter')).toBe('met')
    expect(ruleState('At least 8 characters')).toBe('failed')
    expect(screen.getAllByText('Not met:')).toHaveLength(4)
  })

  it('shows the rule the server refused as failed', () => {
    render(<PasswordRules password="Lekki2026" serverIssues={{ rule: 'special' }} />)

    expect(ruleState('A special character, like ! @ # ?')).toBe('failed')
  })

  it('adds the last-5 rule only on reset', () => {
    const { rerender } = render(<PasswordRules password="x" />)
    expect(screen.queryByText('Different from your last 5 passwords')).not.toBeInTheDocument()

    rerender(<PasswordRules password="x" showReuseRule serverIssues={{ reused: true }} />)
    expect(ruleState('Different from your last 5 passwords')).toBe('failed')
  })
})

describe('meetsLocalRules', () => {
  it('accepts a password that meets all five rules', () => {
    expect(meetsLocalRules('Vento-Test-2026!')).toBe(true)
  })

  it('refuses a long password without a special character', () => {
    expect(meetsLocalRules('VentoTest2026')).toBe(false)
  })
})
