import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SignInCard } from './sign-in-card'
import { testSecurity } from './test-data'

describe('the Sign-in card', () => {
  it('offers Turn on while two-step is off, and no backup codes row', () => {
    render(<SignInCard data={testSecurity()} />)

    expect(screen.getByText('Set when you joined')).toBeInTheDocument()
    expect(screen.getByText('Off')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Turn on' })).toBeInTheDocument()
    expect(screen.queryByText('Backup codes')).not.toBeInTheDocument()
  })

  it('offers Turn off when two-step is on and nothing requires it', () => {
    const data = testSecurity({ twoStep: { enabled: true, requiredBy: null, backupCodesLeft: 8 } })
    render(<SignInCard data={data} />)

    expect(screen.getByRole('button', { name: 'Turn off' })).toBeInTheDocument()
    expect(screen.getByText('8 of 10 left')).toBeInTheDocument()
  })

  it('says what requires two-step and offers no Turn off', () => {
    const requiredBy = {
      organizationName: 'Vento Homes Ltd',
      reason: 'role',
      roleName: 'Finance',
    } as const
    render(
      <SignInCard
        data={testSecurity({ twoStep: { enabled: true, requiredBy, backupCodesLeft: 10 } })}
      />,
    )

    expect(screen.getByText('Required for your role (Finance)')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Turn off' })).not.toBeInTheDocument()
  })

  it('names the organization when it requires two-step for everyone', () => {
    const requiredBy = {
      organizationName: 'Vento Homes Ltd',
      reason: 'organization',
      roleName: null,
    } as const
    render(
      <SignInCard
        data={testSecurity({ twoStep: { enabled: false, requiredBy, backupCodesLeft: null } })}
      />,
    )

    expect(screen.getByText('Required by Vento Homes Ltd')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Turn on' })).toBeInTheDocument()
  })

  it('warns when 3 or fewer backup codes are left', () => {
    const data = testSecurity({ twoStep: { enabled: true, requiredBy: null, backupCodesLeft: 3 } })
    render(<SignInCard data={data} />)

    expect(
      screen.getByText("3 left. Make new ones so you don't get locked out."),
    ).toBeInTheDocument()
  })
})
