import { ORPCError } from '@orpc/client'
import { screen } from '@testing-library/react'
import type { Role } from '@vento/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { clearPreview, startPreview } from '@/features/preview/preview-role'
import { testMe, testRoles } from '@/test/me'
import { renderWithMe } from '@/test/render-with-me'
import { PlanLimitMessage } from './plan-limit-message'

const OWNER_COPY =
  'Your Starter plan includes 2 active companies. Archive one, or talk to Vento Real Estate about Growth.'
const MEMBER_COPY =
  'Your organization has reached its limit of 2 active companies. Ask Bisi Lawal (owner).'

const limitError = (message: string) =>
  new ORPCError('FORBIDDEN', {
    message,
    data: { reason: 'plan_limit', limit: 'entities', included: 2 },
  })

const roles: Role[] = testRoles().map((r) => ({ ...r, canApprove: [] }))

afterEach(() => clearPreview())

describe('PlanLimitMessage', () => {
  it('gives an owner the message and Talk to Vento Real Estate, about this limit', () => {
    renderWithMe(<PlanLimitMessage error={limitError(OWNER_COPY)} />, testMe('owner'))

    expect(screen.getByRole('alert')).toHaveTextContent(OWNER_COPY)
    const link = screen.getByRole('link', { name: 'Talk to Vento Real Estate' })
    expect(decodeURIComponent(link.getAttribute('href') ?? '')).toContain(
      'talk about more companies',
    )
  })

  it('tells any other member who to ask, with no Talk to Vento Real Estate', () => {
    renderWithMe(<PlanLimitMessage error={limitError(MEMBER_COPY)} />, testMe('admin'))

    expect(screen.getByRole('alert')).toHaveTextContent(MEMBER_COPY)
    expect(
      screen.queryByRole('link', { name: 'Talk to Vento Real Estate' }),
    ).not.toBeInTheDocument()
  })

  it('offers no Talk to Vento Real Estate while an owner previews another role', () => {
    startPreview('org-a', 'role-sales')
    renderWithMe(<PlanLimitMessage error={limitError(OWNER_COPY)} />, testMe('owner'), roles)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Talk to Vento Real Estate' }),
    ).not.toBeInTheDocument()
  })

  it('renders nothing for any other error', () => {
    const permission = new ORPCError('FORBIDDEN', { data: { reason: 'permission' } })
    renderWithMe(<PlanLimitMessage error={permission} />, testMe('owner'))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
