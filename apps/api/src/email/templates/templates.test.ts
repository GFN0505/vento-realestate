import { describe, expect, it } from 'vitest'
import { invitationEmail } from './invitation'
import { staffInvitationEmail, superAdminRemovedEmail } from './platform-notices'
import {
  backupCodeUsedAlert,
  newOwnerAlert,
  newSignInAlert,
  passkeyAddedAlert,
  passkeyRemovedAlert,
  signInLockedAlert,
  twoStepNoLongerRequiredAlert,
  twoStepResetAlert,
} from './security-alert'
import { trialEndingEmail } from './trial-ending'
import { existingStaffAccountSignUp, verifyEmail } from './verify-email'

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
    expect(email.subject).toBe(
      'Olumide Bankole invited you to Vento Homes Ltd on Vento Real Estate',
    )
    expect(email.text).toContain('as Finance')
    expect(email.text).toContain('Parkview Residences SPV Ltd')
    expect(email.text).toContain('Can approve: Sales & CRM, Finance, HR & payroll')
    expect(email.text).toContain('expires on 2 Dec 2026')
  })

  it('uses the spec subjects for security alerts', () => {
    expect(twoStepResetAlert({ byName: 'Olumide Bankole' }).subject).toBe(
      'Vento Real Estate: your two-step sign-in was reset by Olumide Bankole',
    )
    expect(
      backupCodeUsedAlert({ left: 9, at: '10:30', on: '25 Nov 2026', resetUrl: 'x' }).subject,
    ).toBe('Vento Real Estate: a backup code was used (9 left)')
  })

  it('writes the lockout body from the spec', () => {
    const email = signInLockedAlert({
      reason: 'two_step',
      at: '10:30',
      on: '25 Nov 2026',
      lockedUntil: '10:45',
      resetUrl: 'http://localhost/forgot-password',
    })
    expect(email.subject).toBe('Vento Real Estate: sign-in locked for 15 minutes')
    expect(email.text).toContain(
      "Someone entered 5 wrong codes for your Vento Real Estate account at 10:30 on 25 Nov 2026. Sign-in is locked until 10:45. If this wasn't you, reset your password now: http://localhost/forgot-password",
    )
  })

  it('writes the trial-ending email as a factual notice with a plain contact line', () => {
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
    expect(email.text).toContain(
      'Questions about your plan? Contact Vento Real Estate: mailto:support@vento.ng',
    )
    expect(email.html).not.toContain('Talk to Vento Real Estate')
  })

  it('tells every owner who was made an owner, by whom and when', () => {
    const email = newOwnerAlert({
      byName: 'Olumide Bankole',
      newOwnerName: 'Aisha Bello',
      organizationName: 'Vento Homes Ltd',
      at: '10:30',
      on: '26 Nov 2026',
      teamUrl: 'http://localhost/settings/team',
    })
    expect(email.subject).toBe('Vento Real Estate: Aisha Bello is now an owner of Vento Homes Ltd')
    expect(email.text).toContain(
      'Olumide Bankole made Aisha Bello an owner of Vento Homes Ltd at 10:30 on 26 Nov 2026. Owners can do everything, including changing who has access.',
    )
    expect(email.text).toContain(
      "If this wasn't expected, sign in and check Team: http://localhost/settings/team",
    )
  })

  describe('brick 3d security alerts', () => {
    const at = { at: '08:12', on: '26 Nov 2026' }
    const urls = {
      securityUrl: 'http://localhost/settings/security',
      resetUrl: 'http://localhost/forgot-password',
    }
    const alerts = [
      newSignInAlert({ device: 'Chrome on Mac', place: 'Lekki, Lagos', ...at, ...urls }),
      passkeyAddedAlert({ name: 'iCloud Keychain · iPhone', ...at, ...urls }),
      passkeyRemovedAlert({ name: 'iCloud Keychain · iPhone', ...at, ...urls }),
      twoStepNoLongerRequiredAlert({
        byName: 'Aisha Bello',
        organizationName: 'Vento Homes Ltd',
        ...at,
        organizationUrl: 'http://localhost/settings/organization',
      }),
    ]

    it('uses the spec subjects', () => {
      expect(alerts.map((a) => a.subject)).toEqual([
        'Vento Real Estate: new sign-in on Chrome on Mac',
        'Vento Real Estate: a passkey was added to your account',
        'Vento Real Estate: a passkey was removed from your account',
        'Vento Real Estate: two-step is no longer required for everyone in Vento Homes Ltd',
      ])
    })

    it('writes the new sign-in body from the spec, with the place but no IP address', () => {
      expect(alerts[0]?.text).toContain(
        'Your Vento Real Estate account was signed in to at 08:12 on 26 Nov 2026 from Chrome on Mac, near Lekki, Lagos.',
      )
      for (const alert of alerts) expect(alert.text).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\b/)
    })

    it('leaves the place out when it is unknown', () => {
      const alert = newSignInAlert({ device: 'Safari on iPhone', place: null, ...at, ...urls })
      expect(alert.text).toContain('from Safari on iPhone. If this was you')
    })
  })

  it('invites to the staff console with the link and when it stops working', () => {
    const email = staffInvitationEmail({
      byName: 'Ada Okafor',
      until: '29 Nov 2026, 14:30',
      url: 'http://localhost/staff-invitation/abc',
    })
    expect(email.subject).toBe('Ada Okafor invited you to the Vento Real Estate console')
    expect(email.text).toContain('This link works until 29 Nov 2026, 14:30.')
    expect(email.text).toContain('http://localhost/staff-invitation/abc')
    expect(email.text).toContain('Nothing happens unless you accept.')
  })

  it('says a removed super-admin’s staff account is closed', () => {
    const email = superAdminRemovedEmail({ byName: 'Ada Okafor', at: '14:30 on 27 Nov 2026' })
    expect(email.subject).toBe("You're no longer a Vento Real Estate super-admin")
    expect(email.text).toContain('Your staff account is closed.')
  })

  it('tells a staff account someone tried to sign up as a customer', () => {
    const email = existingStaffAccountSignUp({ name: 'Ada', signInUrl: 'http://localhost/sign-in' })
    expect(email.text).toContain("It's a staff account")
  })
})
