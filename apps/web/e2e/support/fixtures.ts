import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

// apps/web/e2e/support → repo root
const repoRoot = join(import.meta.dirname, '..', '..', '..', '..')

export type MemberFixture = {
  email: string
  password: string
  totpSecret: string
  organizationName: string
}

export type InvitationFixture = {
  token: string
  email: string
  organizationName: string
  inviterName: string
  roleName: string
}

/** Runs the API's fixture CLI against the database the e2e API uses. Its last line is JSON. */
function runFixture<T>(name: 'member' | 'invitation'): T {
  const output = execFileSync(
    'pnpm',
    ['--filter', '@vento/api', 'exec', 'tsx', 'src/test/e2e-fixtures.ts', name],
    { cwd: repoRoot, encoding: 'utf8', env: process.env },
  )
  const line = output.trim().split('\n').at(-1)
  if (!line) throw new Error(`Fixture "${name}" printed nothing`)
  return JSON.parse(line) as T
}

/** A verified owner with two-step on, in an organization with one entity. */
export const createMemberFixture = () => runFixture<MemberFixture>('member')

/** A pending invitation to a Finance role, for an email that has no account. */
export const createInvitationFixture = () => runFixture<InvitationFixture>('invitation')
