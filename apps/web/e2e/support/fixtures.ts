import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

// apps/web/e2e/support → repo root
const repoRoot = join(import.meta.dirname, '..', '..', '..', '..')

export type MemberFixture = {
  email: string
  password: string
  totpSecret: string
  organizationName: string
  backupCodes: string[]
}

export type InvitationFixture = {
  token: string
  email: string
  organizationName: string
  inviterName: string
  roleName: string
}

/** Runs the API's fixture CLI against the database the e2e API uses. Its last line is JSON. */
export function runFixture<T>(...args: string[]): T {
  const output = execFileSync(
    'pnpm',
    ['--filter', '@vento/api', 'exec', 'tsx', 'src/test/e2e-fixtures.ts', ...args],
    { cwd: repoRoot, encoding: 'utf8', env: process.env },
  )
  const line = output.trim().split('\n').at(-1)
  if (!line) throw new Error(`Fixture "${args.join(' ')}" printed nothing`)
  return JSON.parse(line) as T
}

/** A verified owner with two-step on, in an organization with one entity. */
export const createMemberFixture = () => runFixture<MemberFixture>('member')

/** A pending invitation to a Finance role, for an email that has no account. */
export const createInvitationFixture = (status: 'pending' | 'expired' | 'withdrawn' = 'pending') =>
  runFixture<InvitationFixture>('invitation', status)

type Credentials = { email: string; password: string }

/** Verified email is missing: the account exists but has never confirmed it. */
export const createUnverifiedFixture = () => runFixture<Credentials>('unverified')

/** Signed up and verified, organization made (step 1), no entity yet (step 2 pending). */
export const createHalfOnboardedFixture = () =>
  runFixture<Credentials & { organizationName: string }>('half-onboarded')

/** A member whose two-step an admin of the same organization has just reset. */
export const createResetByAdminFixture = () => runFixture<Credentials>('reset-by-admin')

/** Makes this person's sessions 40 minutes idle, past the 30-minute limit. */
export const ageSessions = (email: string) => runFixture<{ aged: number }>('age-session', email)

export type TeamMember = { email: string; name: string; totpSecret?: string }

export type TeamFixture = {
  organizationId: string
  organizationName: string
  password: string
  entities: Record<'holding' | 'parkview' | 'lekki', { id: string; name: string }>
  members: Record<string, TeamMember>
}

/** One organization, three entities and a member per built-in role (see the API fixtures CLI). */
export const createTeamFixture = () => runFixture<TeamFixture>('team')

export type MultiOrgFixture = {
  password: string
  organizations: { a: { id: string; name: string }; b: { id: string; name: string } }
  tunde: { email: string; name: string; totpSecret: string }
  pendingTwoStep: { email: string; name: string }
}

/** Tunde: finance in organization A and owner in B. Zainab's role in B needs two-step she lacks. */
export const createMultiOrgFixture = () => runFixture<MultiOrgFixture>('multi-org')

/** Changes the person's role in their current organization, as an owner would. */
export const setRole = (email: string, role: string) =>
  runFixture<{ role: string }>('set-role', email, role)

/** Removes the person from their current organization, ending their sessions there. */
export const removeMember = (email: string) => runFixture<{ email: string }>('remove-member', email)
