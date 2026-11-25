import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PasswordRules } from './password-rules'

function ruleState(label: string) {
  return screen.getByText(label).closest('li')?.getAttribute('data-state')
}

describe('PasswordRules', () => {
  it('leaves every rule unticked for an empty password', () => {
    render(<PasswordRules password="" />)

    expect(ruleState('At least 12 characters')).toBe('pending')
    expect(ruleState('Includes a number')).toBe('pending')
  })

  it('ticks length and number as they are met', () => {
    render(<PasswordRules password="lekkigardens2026" />)

    expect(ruleState('At least 12 characters')).toBe('met')
    expect(ruleState('Includes a number')).toBe('met')
    expect(screen.getAllByText('Done:')).toHaveLength(2)
  })

  it('keeps the number rule unticked for a long password without digits', () => {
    render(<PasswordRules password="lekkigardensphase" />)

    expect(ruleState('At least 12 characters')).toBe('met')
    expect(ruleState('Includes a number')).toBe('pending')
  })

  it('shows only the length and number rules outside reset', () => {
    render(<PasswordRules password="password12345" />)

    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.queryByText(/common or leaked/i)).not.toBeInTheDocument()
  })

  it('adds the last-5 rule only on reset', () => {
    const { rerender } = render(<PasswordRules password="x" />)
    expect(screen.queryByText('Different from your last 5 passwords')).not.toBeInTheDocument()

    rerender(<PasswordRules password="x" showReuseRule serverIssues={{ reused: true }} />)
    expect(ruleState('Different from your last 5 passwords')).toBe('failed')
    expect(screen.getByText('Not met:')).toBeInTheDocument()
  })
})
