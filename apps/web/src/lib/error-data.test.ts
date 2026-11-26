import { ORPCError } from '@orpc/client'
import { describe, expect, it } from 'vitest'
import { isNotFound, isPlanLimit } from './error-data'

const forbidden = (reason: string) =>
  new ORPCError('FORBIDDEN', { message: 'Refused', data: { reason } })

describe('error data', () => {
  it('recognises a plan limit refusal', () => {
    expect(isPlanLimit(forbidden('plan_limit'))).toBe(true)
  })

  it('does not mistake a permission refusal or a plain error for a plan limit', () => {
    expect(isPlanLimit(forbidden('permission'))).toBe(false)
    expect(isPlanLimit(new Error('plan_limit'))).toBe(false)
  })

  it('recognises NOT_FOUND only from the API', () => {
    expect(isNotFound(new ORPCError('NOT_FOUND'))).toBe(true)
    expect(isNotFound(new ORPCError('FORBIDDEN'))).toBe(false)
    expect(isNotFound(new Error('Not found'))).toBe(false)
  })
})
