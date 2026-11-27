import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { findBareVento, stripComments } from '@vento/shared'
import { describe, expect, it } from 'vitest'
import { invitationEmail } from '@/email/templates/invitation'
import type { RenderedEmail } from '@/email/templates/layout'
import {
  breakGlassEmail,
  staffInvitationEmail,
  superAdminBackupCodesEmail,
  superAdminRemovedEmail,
  superAdminsChangedEmail,
} from '@/email/templates/platform-notices'
import { resetPassword } from '@/email/templates/reset-password'
import * as alerts from '@/email/templates/security-alert'
import { trialEndingEmail } from '@/email/templates/trial-ending'
import {
  existingAccountSignUp,
  existingStaffAccountSignUp,
  verifyEmail,
} from '@/email/templates/verify-email'

// The product is always "Vento Real Estate" (decision 0022, admin-console plan §1b.14). Scans the
// API and shared code (comments aside), every rendered email, and the help articles. A failure
// prints file, line and the string.

const repo = resolve(import.meta.dirname, '../../../..')

function files(dir: string, keep: (path: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path, keep)
    return keep(path) ? [path] : []
  })
}

function bare(path: string, text: string): string[] {
  const file = relative(repo, path)
  return findBareVento(text, file).map((hit) => `${file}:${hit.line}: ${hit.text}`)
}

const isCode = (path: string) => /\.ts$/.test(path) && !/\.test\.ts$/.test(path)

describe('API and shared copy say Vento Real Estate', () => {
  it('has no bare "Vento" in the API source (tests, fixtures and the demo seed aside)', () => {
    const api = resolve(repo, 'apps/api/src')
    const paths = files(
      api,
      (p) =>
        isCode(p) && !p.includes(`${join(api, 'test')}/`) && !p.endsWith(join('db', 'seed.ts')),
    )
    expect(paths.length).toBeGreaterThan(50)
    expect(paths.flatMap((p) => bare(p, stripComments(readFileSync(p, 'utf8'))))).toEqual([])
  })

  it('has no bare "Vento" in the shared package', () => {
    const shared = resolve(repo, 'packages/shared/src')
    // The matcher's own allow-list names the word on purpose.
    const paths = files(shared, (p) => isCode(p) && !p.includes(`${join('src', 'brand')}/`))
    expect(paths.flatMap((p) => bare(p, stripComments(readFileSync(p, 'utf8'))))).toEqual([])
  })
})

const at = { at: '14:30', on: '27 Nov 2026' }
const urls = { resetUrl: 'http://x/r', securityUrl: 'http://x/s' }

/** Every template, with realistic words. */
const EMAILS: [string, RenderedEmail][] = [
  ['verifyEmail', verifyEmail({ name: 'Olumide', url: 'http://x/v', code: '482913' })],
  [
    'existingAccountSignUp',
    existingAccountSignUp({ name: 'Olumide', signInUrl: 'http://x', resetUrl: 'http://x' }),
  ],
  [
    'existingStaffAccountSignUp',
    existingStaffAccountSignUp({ name: 'Ada', signInUrl: 'http://x' }),
  ],
  ['resetPassword', resetPassword({ name: 'Olumide', url: 'http://x/r' })],
  [
    'invitationEmail',
    invitationEmail({
      organizationName: 'Lekki Partners Ltd',
      inviterName: 'Bisi Lawal',
      roleName: 'Finance',
      entities: 'all',
      canApprove: ['Finance'],
      twoStepRequired: true,
      expiresOn: '4 Dec 2026',
      url: 'http://x/i',
    }),
  ],
  [
    'trialEndingEmail',
    trialEndingEmail({
      planName: 'Enterprise',
      endsOn: '2 Jan 2027',
      losing: ['Board pack'],
      talkUrl: 'mailto:x@y.ng',
    }),
  ],
  [
    'signInLockedAlert',
    alerts.signInLockedAlert({ reason: 'password', lockedUntil: '14:45', ...at, ...urls }),
  ],
  ['passwordChangedAlert', alerts.passwordChangedAlert({ viaReset: true, ...at, ...urls })],
  ['twoStepResetAlert', alerts.twoStepResetAlert({ byName: 'Ada Okafor' })],
  ['twoStepDisabledAlert', alerts.twoStepDisabledAlert({ ...at, ...urls })],
  ['backupCodeUsedAlert', alerts.backupCodeUsedAlert({ left: 3, ...at, ...urls })],
  [
    'newOwnerAlert',
    alerts.newOwnerAlert({
      byName: 'Bisi',
      newOwnerName: 'Femi',
      organizationName: 'Lekki Ltd',
      teamUrl: 'http://x',
      ...at,
    }),
  ],
  [
    'newSignInAlert',
    alerts.newSignInAlert({ device: 'Chrome on Mac', place: 'Lekki, Lagos', ...at, ...urls }),
  ],
  ['passkeyAddedAlert', alerts.passkeyAddedAlert({ name: 'MacBook', ...at, ...urls })],
  ['passkeyRemovedAlert', alerts.passkeyRemovedAlert({ name: 'MacBook', ...at, ...urls })],
  [
    'twoStepNoLongerRequiredAlert',
    alerts.twoStepNoLongerRequiredAlert({
      byName: 'Bisi',
      organizationName: 'Lekki Ltd',
      organizationUrl: 'http://x',
      ...at,
    }),
  ],
  ['passkeyCopiedAlert', alerts.passkeyCopiedAlert({ name: 'MacBook', ...at, ...urls })],
  ['backupCodesRegeneratedAlert', alerts.backupCodesRegeneratedAlert({ ...at, ...urls })],
  [
    'staffInvitationEmail',
    staffInvitationEmail({ byName: null, until: '29 Nov 2026, 14:30', url: 'http://x' }),
  ],
  [
    'superAdminRemovedEmail',
    superAdminRemovedEmail({ byName: 'Ada Okafor', at: '14:30 on 27 Nov 2026' }),
  ],
  [
    'superAdminsChangedEmail',
    superAdminsChangedEmail({
      sentence: 'Ada Okafor reset Tunde Bello’s two-step',
      at: '14:30',
      reason: 'Lost phone',
      activityUrl: 'http://x',
    }),
  ],
  [
    'breakGlassEmail',
    breakGlassEmail({
      actorName: 'Ada',
      summary: 'Moved Sales to off',
      host: 'api-1',
      at: '14:30',
      reason: 'Down',
      activityUrl: 'http://x',
    }),
  ],
  [
    'superAdminBackupCodesEmail',
    superAdminBackupCodesEmail({ name: 'Ada', at: '14:30', activityUrl: 'http://x' }),
  ],
]

/** What a reader sees in the HTML: no tags, entities as characters. */
const visible = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replaceAll('&nbsp;', ' ')

describe('every email says Vento Real Estate', () => {
  it('covers every security alert template', () => {
    const rendered = new Set(EMAILS.map(([name]) => name))
    expect(Object.keys(alerts).filter((name) => !rendered.has(name))).toEqual([])
  })

  it.each(EMAILS)('%s has no bare "Vento" in its subject, text or HTML', (name, email) => {
    const parts = { subject: email.subject, text: email.text, html: visible(email.html) }
    for (const [part, text] of Object.entries(parts)) {
      expect(findBareVento(text).map((h) => `${name} ${part}: ${h.text}`)).toEqual([])
    }
  })
})

describe('help articles say Vento Real Estate', () => {
  it('have no bare "Vento" outside code spans', () => {
    const help = resolve(repo, 'docs/help')
    const paths = files(help, (p) => p.endsWith('.md'))
    expect(paths.length).toBeGreaterThan(3)
    // Code spans and blocks name files and commands, not the product.
    const prose = (md: string) =>
      md
        .replace(/```[\s\S]*?```/g, (m) => m.replace(/[^\n]/g, ' '))
        .replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length))
    expect(paths.flatMap((p) => bare(p, prose(readFileSync(p, 'utf8'))))).toEqual([])
  })
})
