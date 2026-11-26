import { ORPCError } from '@orpc/server'
import { describe, expect, it } from 'vitest'
import { errorSummary } from './error-summary'

describe('errorSummary', () => {
  it('does not log a third-party message that contains an email', () => {
    const error = new TypeError('Invalid recipient grace.umeh@example.com')
    const summary = errorSummary(error)
    expect(summary.error).toBe('TypeError')
    expect(JSON.stringify(summary)).not.toContain('grace.umeh@example.com')
  })

  it('logs a database error by code and constraint, never its message', () => {
    const cause = Object.assign(new Error('Key (email)=(ngozi@example.com) already exists'), {
      code: '23505',
      constraint: 'users_email_unique',
    })
    const summary = errorSummary(new Error('Failed query: params: ngozi@example.com', { cause }))
    expect(summary).toMatchObject({ code: '23505', constraint: 'users_email_unique' })
    expect(JSON.stringify(summary)).not.toContain('@example.com')
  })

  it('logs the code and message of our own errors', () => {
    const error = new ORPCError('INTERNAL_SERVER_ERROR', { message: 'Ledger did not balance' })
    expect(errorSummary(error)).toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      detail: 'Ledger did not balance',
    })
  })
})
