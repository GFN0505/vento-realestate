import { describe, expect, it } from 'vitest'
import { invitationEmail } from './invitation'
import { backupCodeUsedAlert, signInLockedAlert, twoStepResetAlert } from './security-alert'
import { trialEndingEmail } from './trial-ending'
import { verifyEmail } from './verify-email'

describe('email templates', () => {
  it('puts both the link and the 6-digit code in the verification email', () => {
    const email = verifyEmail({
      name: 'Olumide',
      url: 'http://localhost/v?token=abc',
      code: '482913',
    })
    expect(email.text).toContain('http://localhost/v?token=abc')
    expect(email.text).toContain('482913')
    expect(email.html).toContain('482913')
  })

  it('names the product Vento Real Estate in the header and footer', () => {
    const email = verifyEmail({ name: 'Olumide', url: 'http://localhost/v', code: '482913' })
    expect(email.html).toContain('>Real Estate</span>')
    expect(email.html).toContain('Vento Real Estate')
    expect(email.text.split('\n').at(-1)).toBe('Vento Real Estate')
  })

  it('escapes names in the HTML', () => {
    const email = invitationEmail({
      organizationName: '<script>alert(1)</script> Ltd',
      inviterName: 'Olumide Bankole',
      roleName: 'Finance',
      entities: 'all',
      canApprove: [],
      twoStepRequired: false,
      expiresOn: '2 Dec 2026',
      url: 'http://localhost/accept',
    })
    expect(email.html).not.toContain('<script>')
    expect(email.html).toContain('&lt;script&gt;')
  })

  it('names the organization, inviter, role, entities and expiry in an invitation', () => {
    const email = invitationEmail({
      organizationName: 'Vento Homes Ltd',
      inviterName: 'Olumide Bankole',
      roleName: 'Finance',
      entities: ['Parkview Residences SPV Ltd'],
      canApprove: ['Sales & CRM', 'Finance', 'HR & payroll'],
      twoStepRequired: true,
      expiresOn: '2 Dec 2026',
      url: 'http://localhost/accept',
    })
    expect(email.subject).toBe('Olumide Bankole invited you to Vento Homes Ltd on Vento')
    expect(email.text).toContain('as Finance')
    expect(email.text).toContain('Parkview Residences SPV Ltd')
    expect(email.text).toContain('Can approve: Sales & CRM, Finance, HR & payroll')
    expect(email.text).toContain('expires on 2 Dec 2026')
  })

  it('uses the spec subjects for security alerts', () => {
    expect(twoStepResetAlert({ byName: 'Olumide Bankole' }).subject).toBe(
      'Vento: your two-step sign-in was reset by Olumide Bankole',
    )
    expect(
      backupCodeUsedAlert({ left: 9, at: '10:30', on: '25 Nov 2026', resetUrl: 'x' }).subject,
    ).toBe('Vento: a backup code was used (9 left)')
  })

  it('writes the lockout body from the spec', () => {
    const email = signInLockedAlert({
      reason: 'two_step',
      at: '10:30',
      on: '25 Nov 2026',
      lockedUntil: '10:45',
      resetUrl: 'http://localhost/forgot-password',
    })
    expect(email.subject).toBe('Vento: sign-in locked for 15 minutes')
    expect(email.text).toContain(
      "Someone entered 5 wrong codes for your Vento account at 10:30 on 25 Nov 2026. Sign-in is locked until 10:45. If this wasn't you, reset your password now: http://localhost/forgot-password",
    )
  })

  it('writes the trial-ending email from the spec, with Talk to Vento', () => {
    const email = trialEndingEmail({
      planName: 'Enterprise',
      endsOn: '2 Jan 2027',
      losing: ['Board pack'],
      talkUrl: 'mailto:support@vento.ng',
    })
    expect(email.subject).toBe('Your Enterprise trial ends on 2 Jan 2027')
    expect(email.text).toContain(
      'Your Enterprise trial ends on 2 Jan 2027. After that, the board pack is no longer available. Your data stays.',
    )
    expect(email.text).toContain('Talk to Vento: mailto:support@vento.ng')
  })
})
