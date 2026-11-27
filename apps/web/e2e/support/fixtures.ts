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

export type StarterOrgFixture = {
  organizationId: string
  organizationName: string
  password: string
  owner: { email: string; name: string; totpSecret: string }
  sales: { email: string; name: string }
}

/** A standard organization on Starter: an owner (two-step on) and a sales member, one entity. */
export const createStarterOrgFixture = () => runFixture<StarterOrgFixture>('starter-org')

/** Publishes the starting plans in the e2e database if they are missing. */
export const publishPlans = () => runFixture<{ published: unknown }>('plans')

/**
 * The API serves flags from a snapshot it reloads every second under e2e (see playwright.config).
 * A fixture that changes flags or plans waits one reload so the next request sees the change;
 * waiting is synchronous here because fixtures are.
 */
const SNAPSHOT_RELOAD_MS = 1_800
function afterSnapshotReload<T>(result: T): T {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, SNAPSHOT_RELOAD_MS)
  return result
}

export const setReleaseOverride = (orgId: string, flag: string, value: 'on' | 'off' | 'clear') =>
  afterSnapshotReload(runFixture('org-override', orgId, 'release', flag, value))

/** Releases several flags at once (one reload wait): a feature and what it needs. */
export const releaseFlags = (orgId: string, flags: readonly string[]) => {
  return afterSnapshotReload(runFixture('org-release', orgId, flags.join(',')))
}

export const setFeatureOverride = (orgId: string, flag: string, value: 'on' | 'off' | 'clear') =>
  afterSnapshotReload(runFixture('org-override', orgId, 'feature', flag, value))

export const setReleaseGroup = (orgId: string, group: 'standard' | 'pilot' | 'internal') =>
  afterSnapshotReload(runFixture('org-group', orgId, group))

export const startTrial = (orgId: string, plan: string, days: number) =>
  afterSnapshotReload(runFixture('org-trial', orgId, plan, String(days)))

export type ScopedTeamFixture = {
  organizationId: string
  organizationName: string
  password: string
  entities: Record<'parkview' | 'lekki', { id: string; name: string }>
  members: Record<'owner' | 'limitedAdmin' | 'facility' | 'both' | 'sales' | 'finance', TeamMember>
}

/** An owner, an admin limited to Parkview, and members with narrower and wider entity access. */
export const createScopedTeamFixture = () => runFixture<ScopedTeamFixture>('team-scoped')

export type StarterTeamFixture = {
  organizationId: string
  organizationName: string
  password: string
  limit: number
  owner: Required<TeamMember>
  admin: Required<TeamMember>
  sales: TeamMember
}

/** A Starter organization (owner, admin, sales) with `places` people places left. */
export const createStarterTeamFixture = (places = 2) =>
  afterSnapshotReload(runFixture<StarterTeamFixture>('starter-team', String(places)))

export type TeamInvitationState = 'pending' | 'expired' | 'failed' | 'bounced' | 'complained'

/** An open Sales invitation in the organization, in the given state; `email` defaults to unique. */
export const createTeamInvitation = (
  organizationId: string,
  state: TeamInvitationState,
  email?: string,
) =>
  runFixture<{ id: string; email: string }>(
    'team-invitation',
    organizationId,
    state,
    ...(email ? [email] : []),
  )

type Entity = { id: string; name: string }
type Person = { email: string; name: string; totpSecret?: string }

export type CompaniesFixture = {
  organizationId: string
  organizationName: string
  password: string
  entities: {
    holding: Entity
    parkview: Entity & { rcNumber: string }
    /** Absent on the `starter` variant. */
    lekki?: Entity & { rcNumber: string }
    ikoyi: Entity & { rcNumber: string }
  }
  /**
   * Default: owner, parkviewAdmin (Parkview only), kunle and ope (Lekki Gardens only), sales.
   * `starter`: owner, admin (all companies), sales; two active companies on the Starter plan.
   */
  members: Record<string, Person>
}

/** Settings → Companies (J-ONB-07). `starter` is at 2 of 2 active companies. */
export const createCompaniesFixture = (mode?: 'starter') => {
  const fixture = runFixture<CompaniesFixture>('companies', ...(mode ? [mode] : []))
  // Starter publishes plans, which the API reads from its snapshot.
  return mode ? afterSnapshotReload(fixture) : fixture
}

export type CustomRoleFixture = {
  organizationId: string
  organizationName: string
  password: string
  role: { id: string; name: string }
  owner: Required<Person>
  /** Holds the custom role. */
  holder: Person
  /** A viewer, free to be given it. */
  viewer: Person
}

/** A custom role copied from Project manager, held by Bayo; Chidi (viewer) can be given it. */
export const createCustomRoleFixture = (name?: string) =>
  runFixture<CustomRoleFixture>('custom-role', ...(name ? [name] : []))

export type RoleEditorFixture = {
  organizationId: string
  organizationName: string
  password: string
  role: { id: string; name: string }
  editor: Required<Person>
  admin: Required<Person>
  sales: Person
}

/** Ngozi holds "Office manager" (Settings create, edit, delete; no Finance); Kemi is an admin. */
export const createRoleEditorFixture = () => runFixture<RoleEditorFixture>('role-editor')

export type NoCompanyFixture = {
  organizationId: string
  organizationName: string
  password: string
  archived: Entity
  owner: Person
  member: Person
}

/** Kunle can see only an archived company. */
export const createNoCompanyFixture = () => runFixture<NoCompanyFixture>('no-company')

export type SecurityTeamFixture = {
  organizationId: string
  organizationName: string
  password: string
  /** owner, admin and finance have two-step on (with secrets); sales and viewer use the password alone. */
  members: Record<'owner' | 'admin' | 'finance' | 'sales' | 'viewer', TeamMember>
}

/** An internal organization (passkeys available) for My security, passkeys and require-two-step. */
export const createSecurityTeamFixture = () => runFixture<SecurityTeamFixture>('security-team')

/** Stored passkeys, not usable to sign in, until the person has `total` (the limit of 10). */
export const fillPasskeys = (email: string, total: number) =>
  runFixture<{ passkeys: number }>('fill-passkeys', email, String(total))

/** The "require two-step" switch is 8 days old and this person's sessions 9: the 7 days ran out. */
export const expireGrace = (email: string) =>
  runFixture<{ sessions: number }>('expire-grace', email)

/** A password reset is required, yet any passkey is kept (the race path). */
export const forceReset = (email: string) => runFixture<{ email: string }>('force-reset', email)

/** Closes the 5-minute "Confirm it's you" window, so the next sensitive action asks for the password. */
export const ageReauth = (email: string) => runFixture<{ sessions: number }>('age-reauth', email)

/** Days until the person's newest session expires on the server, and whether it is persistent. */
export const sessionExpiry = (email: string) =>
  runFixture<{ days: number; persistent: boolean }>('session-expiry', email)

// Vento console (admin-console plan §13). Fixtures never change global stages except
// `flagStage`, which only releases.spec.ts uses, to put back the keys it owns.

export type SuperAdminState = 'active' | 'revoked' | 'two-step-reset'
/**
 * Slice 1 names, kept so older specs still run: since 1b every super-admin is a staff account
 * with no organization (decision 0023), so both mean `active`.
 */
type LegacySuperAdminState = 'member' | 'no-org'

export type SuperAdminFixture = Credentials & {
  userId: string
  totpSecret: string
  backupCodes: string[]
  /** Always null since 1b: staff accounts have no organization; signing in lands on the console. */
  organizationName: string | null
  state: SuperAdminState
}

/** A super-admin: a staff account made through the real staff sign-up (admin-console plan §1b.17). */
export const createSuperAdminFixture = (
  state: SuperAdminState | LegacySuperAdminState = 'active',
) =>
  runFixture<SuperAdminFixture>(
    'super-admin',
    state === 'member' || state === 'no-org' ? 'active' : state,
  )

export type StaffInvitationState = 'pending' | 'expired' | 'withdrawn' | 'accepted' | 'started'

/** A staff invitation and its link (J-ADM-05); `started` has a password set (resume). */
export const createStaffInvitation = (
  state: StaffInvitationState = 'pending',
  inviterEmail?: string,
) =>
  runFixture<{ email: string; name: string; link: string; inviterName: string | null }>(
    'staff-invitation',
    state,
    ...(inviterEmail ? [inviterEmail] : []),
  )

/** A customer account on this email: the staff sign-up's "got a customer account meanwhile". */
export const createCustomerAccount = (email: string) =>
  runFixture<{ email: string; userId: string }>('customer-account', email)

/** Makes that staff invitation `hours` older (expiry without waiting). */
export const ageStaffInvitation = (email: string, hours = 49) =>
  runFixture<{ invitations: number }>('age-staff-invitation', email, String(hours))

/** Expires every open staff invitation: the cap of 5 open ones is global, so a run starts clean. */
export const expireStaffInvitations = () =>
  runFixture<{ invitations: number }>('expire-staff-invitations')

/**
 * The Dashboard's queue (J-ADM-06): unique organization names for a trial ending in 2 days, people
 * over the limit, no plan and nobody active for 18 days, plus an internal one that must never show.
 */
export const createDashboardFixture = (withCommandLineChange = false) =>
  runFixture<{ trial: string; overLimit: string; noPlan: string; quiet: string; internal: string }>(
    'dashboard',
    ...(withCommandLineChange ? ['command'] : []),
  )

/** Closes the console window on every session: 16 minutes idle, or opened 8 hours ago. */
export const ageConsole = (email: string, how: 'idle' | 'max' = 'idle') =>
  runFixture<{ sessions: number }>('age-console', email, how)

/** The last code or passkey was 10 minutes ago: opening the console asks "Confirm it's you". */
export const ageSecondFactor = (email: string) =>
  runFixture<{ sessions: number }>('age-second-factor', email)

/** The person's passkeys were added 20 minutes ago, before an aged proof: they may open the console. */
export const agePasskeys = (email: string) =>
  runFixture<{ passkeys: number }>('age-passkeys', email)

/** releases.spec.ts only: sets (or restores) a global release stage on a key it owns. */
export const flagStage = (key: string, stage: 'off' | 'internal' | 'pilot' | 'on') =>
  afterSnapshotReload(runFixture<{ key: string; stage: string }>('flag-stage', key, stage))

/** A break-glass change by that super-admin in Vento's activity (the rose Command line tag). */
export const platformActivity = (email: string) =>
  runFixture<{ email: string }>('platform-activity', email)
