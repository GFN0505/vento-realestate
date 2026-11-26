import { ORPCError } from '@orpc/client'
import { describe, expect, it } from 'vitest'
import { ModuleForbiddenError } from '@/features/shell/module-forbidden-error'
import { routeErrorKind } from './route-error-kind'

const shell = { inShell: true, online: true }
const forbidden = (reason: string) =>
  new ORPCError('FORBIDDEN', { status: 403, data: { reason }, defined: true })

describe('route error kind', () => {
  it('shows the 403 page when the role cannot view the module', () => {
    expect(routeErrorKind(new ModuleForbiddenError('hr'), shell)).toBe('forbidden')
  })

  it('shows the 403 page for a server FORBIDDEN with reason permission', () => {
    expect(routeErrorKind(forbidden('permission'), shell)).toBe('forbidden')
  })

  it('re-runs the guard when two-step setup is required', () => {
    expect(routeErrorKind(forbidden('two_step_setup_required'), shell)).toBe('two_step')
  })

  it.each(['own_access', 'owner_only', 'entity_limit'])(
    'toasts any other refusal (%s)',
    (reason) => {
      expect(routeErrorKind(forbidden(reason), shell)).toBe('toast')
    },
  )

  it('shows the 404 page for NOT_FOUND inside the shell', () => {
    expect(routeErrorKind(new ORPCError('NOT_FOUND', { status: 404 }), shell)).toBe('not_found')
  })

  it('shows the offline page for a network failure or when offline', () => {
    expect(routeErrorKind(new TypeError('Failed to fetch'), shell)).toBe('offline')
    expect(routeErrorKind(new Error('boom'), { inShell: true, online: false })).toBe('offline')
  })

  it('shows the offline page when a page chunk fails offline', () => {
    const chunk = new TypeError('Failed to fetch dynamically imported module: /assets/sales-1.js')
    expect(routeErrorKind(chunk, { inShell: true, online: false })).toBe('offline')
  })

  it('treats a page chunk failing while online as a new deploy', () => {
    const chunk = new TypeError('Failed to fetch dynamically imported module: /assets/sales-1.js')
    expect(routeErrorKind(chunk, shell)).toBe('stale_code')
  })

  it('shows the 500 page for anything else', () => {
    expect(routeErrorKind(new ORPCError('INTERNAL_SERVER_ERROR', { status: 500 }), shell)).toBe(
      'server',
    )
  })
})
