/**
 * Test data for Playwright, created in the database the e2e API uses (DATABASE_URL).
 *
 *   tsx src/test/e2e-fixtures.ts member                 verified owner with two-step on
 *   tsx src/test/e2e-fixtures.ts unverified             account whose email is not verified
 *   tsx src/test/e2e-fixtures.ts half-onboarded         verified, organization made, no entity yet
 *   tsx src/test/e2e-fixtures.ts invitation [status]    Finance invitation (pending|expired|withdrawn)
 *   tsx src/test/e2e-fixtures.ts reset-by-admin         member whose two-step an admin just reset
 *   tsx src/test/e2e-fixtures.ts age-session <email>    makes that person's sessions 40 minutes idle
 *   tsx src/test/e2e-fixtures.ts team                   organization, three entities, one member per role
 *   tsx src/test/e2e-fixtures.ts multi-org              Tunde in two organizations, plus one whose second role needs two-step
 *   tsx src/test/e2e-fixtures.ts set-role <email> <role>  changes that person's role in their current organization
 *   tsx src/test/e2e-fixtures.ts remove-member <email>  removes that person from their current organization (ends those sessions)
 *
 * Prints one JSON line. Emails are unique per run, so specs never share or collide with seed data.
 */

// Quiet logs so stdout stays one JSON line; set before the app modules read the environment.
process.env.LOG_LEVEL ??= 'error'

async function createMember() {
  const { testApp, browser } = await import('./auth-client')
  const { onboard, setUpTwoStep, signUpVerified } = await import('./flows')
  const { TEST_PASSWORD } = await import('./factories')
  const { uniqueEmail } = await import('./db')

  const { app, mailer } = testApp()
  const b = browser(app)
  const email = uniqueEmail('e2e.owner')
  const organizationName = `Parkview Homes ${Date.now().toString(36)}`
  await signUpVerified(b, mailer, email)
  await onboard(b, organizationName)
  const { totpURI, backupCodes } = await setUpTwoStep(b)
  const secret = new URL(totpURI).searchParams.get('secret') ?? ''
  return { email, password: TEST_PASSWORD, totpSecret: secret, organizationName, backupCodes }
}

async function createUnverified() {
  const { db } = await import('@/db/client')
  const { createUser, TEST_PASSWORD } = await import('./factories')
  const { uniqueEmail } = await import('./db')
  const user = await createUser(db, {
    email: uniqueEmail('e2e.unverified'),
    emailVerified: false,
    password: TEST_PASSWORD,
  })
  return { email: user.email, password: TEST_PASSWORD }
}

async function createHalfOnboarded() {
  const { testApp, browser } = await import('./auth-client')
  const { signUpVerified } = await import('./flows')
  const { TEST_PASSWORD } = await import('./factories')
  const { uniqueEmail } = await import('./db')

  const { app, mailer } = testApp()
  const b = browser(app)
  const email = uniqueEmail('e2e.half')
  const organizationName = `Banana Island Homes ${Date.now().toString(36)}`
  await signUpVerified(b, mailer, email)
  await b.rpc('onboarding/createOrganization', { name: organizationName, headOfficeState: 'Lagos' })
  return { email, password: TEST_PASSWORD, organizationName }
}

async function createInvitationFixture(status: string | undefined) {
  const { db } = await import('@/db/client')
  const { createEntity, createInvitation, createOrganization } = await import('./factories')
  const { uniqueEmail } = await import('./db')

  const org = await createOrganization(db, {
    name: `Victoria Gardens Ltd ${Date.now().toString(36)}`,
  })
  // Without an entity the app would send the invitee to onboarding, which only an owner finishes.
  await createEntity(db, org)
  const email = uniqueEmail('e2e.finance')
  const expired = status === 'expired'
  const { token } = await createInvitation(db, org, {
    role: 'finance',
    email,
    status: expired ? 'expired' : status === 'withdrawn' ? 'withdrawn' : 'pending',
    ...(expired && { expiresAt: new Date(Date.now() - 24 * 3600_000) }),
  })
  return {
    token,
    email,
    organizationName: org.name,
    inviterName: org.owner.name,
    roleName: 'Finance',
  }
}

/** A member whose two-step an admin of the same organization reset, as the Team screen will. */
async function createResetByAdmin() {
  const { db } = await import('@/db/client')
  const { env } = await import('@/env')
  const { createAuth } = await import('@/auth/auth')
  const { createDevTransport } = await import('@/email/transports/dev')
  const { syncSystemRoles } = await import('@/access/system-roles')
  const { resetMemberTwoStep } = await import('@/modules/members/members.service')
  const { sendAll } = await import('@/email/mailer')
  const { members, users } = await import('@/db/schema')
  const { contextFor, createMember: addMember } = await import('./factories')
  const { eq } = await import('drizzle-orm')

  const target = await createMember()
  const [targetUser] = await db.select().from(users).where(eq(users.email, target.email))
  const [targetMember] = await db
    .select()
    .from(members)
    .where(eq(members.userId, targetUser?.id ?? ''))
  if (!targetUser || !targetMember) throw new Error('target member missing')
  const roleIds = await syncSystemRoles(db, targetMember.organizationId)
  const org = {
    id: targetMember.organizationId,
    name: target.organizationName,
    roleIds,
    owner: targetUser,
    ownerMemberId: targetMember.id,
  }
  // The target is the only owner; a second owner does the reset.
  const { user: actor } = await addMember(db, org, { role: 'owner', name: 'Ngozi Adeyemi' })
  const ctx = await contextFor(db, actor, org)
  const result = await resetMemberTwoStep(ctx, targetMember.id)

  // Same sequence as the router: alert, then the emailed reset link, written to the dev mail folder.
  const mailer = createDevTransport(env.EMAIL_DEV_DIR)
  await sendAll(mailer, result.emails)
  const auth = createAuth({ db, mailer, rateLimit: false })
  await auth.api.requestPasswordReset({
    body: { email: result.resetPasswordFor, redirectTo: '/reset-password' },
  })
  return { email: target.email, password: target.password }
}

async function ageSession(email: string | undefined) {
  if (!email) throw new Error('age-session needs an email')
  const { db } = await import('@/db/client')
  const { sessions, users } = await import('@/db/schema')
  const { eq, inArray } = await import('drizzle-orm')
  const { sql } = await import('drizzle-orm')
  const owner = db.select({ id: users.id }).from(users).where(eq(users.email, email))
  const aged = await db
    .update(sessions)
    .set({ lastActiveAt: sql`now() - interval '40 minutes'` })
    .where(inArray(sessions.userId, owner))
    .returning({ id: sessions.id })
  return { aged: aged.length }
}

type Db = typeof import('@/db/client')['db']
type SystemRoleKey = import('@vento/shared').SystemRoleKey

const TEAM: { role: SystemRoleKey; name: string }[] = [
  { role: 'owner', name: 'Olumide Bankole' },
  { role: 'admin', name: 'Ngozi Adeyemi' },
  { role: 'land_legal', name: 'Chidi Okafor' },
  { role: 'project_manager', name: 'Emeka Obi' },
  { role: 'sales', name: 'Grace Umeh' },
  { role: 'finance', name: 'Aisha Bello' },
  { role: 'hr', name: 'Funke Adebayo' },
  { role: 'facility', name: 'Kunle Balogun' },
  { role: 'viewer', name: 'Yusuf Ibrahim' },
]

/** A user who can sign in with TEST_PASSWORD. */
async function passwordUser(db: Db, name: string, emailPrefix: string) {
  const { createUser, TEST_PASSWORD } = await import('./factories')
  const { uniqueEmail } = await import('./db')
  return createUser(db, { name, email: uniqueEmail(emailPrefix), password: TEST_PASSWORD })
}

/** Signs in through Better Auth and turns two-step on; returns the authenticator secret. */
async function turnOnTwoStep(email: string): Promise<string> {
  const { testApp, browser } = await import('./auth-client')
  const { setUpTwoStep, signIn } = await import('./flows')
  const b = browser(testApp().app)
  const res = await signIn(b, email)
  if (res.status !== 200) throw new Error(`sign-in failed for ${email}`)
  const { totpURI } = await setUpTwoStep(b)
  return new URL(totpURI).searchParams.get('secret') ?? ''
}

/** Makes `organizationId` where the person lands at their next sign-in. */
async function defaultOrganization(db: Db, userId: string, organizationId: string) {
  const { users } = await import('@/db/schema')
  const { eq } = await import('drizzle-orm')
  await db
    .update(users)
    .set({ lastActiveOrganizationId: organizationId })
    .where(eq(users.id, userId))
}

/**
 * "Vento Homes" with a holding company and two SPVs, and one member per built-in role.
 * Kunle (facility) is limited to Parkview. Roles that need two-step have it on, with the secret.
 */
async function createTeam() {
  const { db } = await import('@/db/client')
  const { DEFAULT_ROLES } = await import('@vento/shared')
  const {
    createEntity,
    createMember: addMember,
    createOrganization,
    TEST_PASSWORD,
  } = await import('./factories')

  const suffix = Date.now().toString(36)
  const owner = await passwordUser(db, 'Olumide Bankole', 'e2e.owner')
  const org = await createOrganization(db, { name: `Vento Homes ${suffix}`, owner })
  const holding = await createEntity(db, org, {
    name: `Vento Homes ${suffix} Ltd`,
    type: 'holding',
  })
  const parkview = await createEntity(db, org, { name: 'Parkview Residences SPV Ltd' })
  const lekki = await createEntity(db, org, { name: 'Lekki Gardens SPV Ltd' })

  const members: Record<string, { email: string; name: string; totpSecret?: string }> = {}
  for (const { role, name } of TEAM) {
    const user =
      role === 'owner' ? owner : await passwordUser(db, name, `e2e.${role.replace('_', '.')}`)
    if (role !== 'owner') {
      await addMember(db, org, {
        role,
        user,
        ...(role === 'facility' && { entityIds: [parkview.id] }),
      })
    }
    const needsTwoStep = DEFAULT_ROLES.find((r) => r.key === role)?.requiresTwoStep
    const totpSecret = needsTwoStep ? await turnOnTwoStep(user.email) : undefined
    members[role] = { email: user.email, name, ...(totpSecret && { totpSecret }) }
  }
  return {
    organizationId: org.id,
    organizationName: org.name,
    password: TEST_PASSWORD,
    entities: {
      holding: { id: holding.id, name: holding.name },
      parkview: { id: parkview.id, name: parkview.name },
      lekki: { id: lekki.id, name: lekki.name },
    },
    members,
  }
}

/**
 * Tunde: finance in A (two-step on) and owner in B; lands in A. Zainab: viewer in A and finance
 * in B, without two-step, so switching to B sends her to two-step setup.
 */
async function createMultiOrg() {
  const { db } = await import('@/db/client')
  const {
    createEntity,
    createMember: addMember,
    createOrganization,
    TEST_PASSWORD,
  } = await import('./factories')

  const suffix = Date.now().toString(36)
  const a = await createOrganization(db, { name: `Vento Homes ${suffix}` })
  await createEntity(db, a, { name: `Vento Homes ${suffix} Ltd`, type: 'holding' })
  const b = await createOrganization(db, { name: `Lekki Partners ${suffix}` })
  await createEntity(db, b, { name: `Lekki Partners ${suffix} Ltd`, type: 'holding' })

  const tunde = await passwordUser(db, 'Tunde Ola', 'e2e.tunde')
  await addMember(db, a, { role: 'finance', user: tunde })
  await addMember(db, b, { role: 'owner', user: tunde })
  const totpSecret = await turnOnTwoStep(tunde.email)
  await defaultOrganization(db, tunde.id, a.id)

  const zainab = await passwordUser(db, 'Zainab Musa', 'e2e.zainab')
  await addMember(db, a, { role: 'viewer', user: zainab })
  await addMember(db, b, { role: 'finance', user: zainab })
  await defaultOrganization(db, zainab.id, a.id)

  return {
    password: TEST_PASSWORD,
    organizations: { a: { id: a.id, name: a.name }, b: { id: b.id, name: b.name } },
    tunde: { email: tunde.email, name: tunde.name, totpSecret },
    pendingTwoStep: { email: zainab.email, name: zainab.name },
  }
}

/** The person's current membership and an owner of the same organization to act for them. */
async function membershipAndActor(email: string | undefined) {
  if (!email) throw new Error('needs an email')
  const { db } = await import('@/db/client')
  const { loadMembership } = await import('@/access/context')
  const { members, roles, users } = await import('@/db/schema')
  const { and, eq, ne } = await import('drizzle-orm')
  const { contextFor } = await import('./factories')

  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()))
  if (!user) throw new Error(`no user ${email}`)
  const membership = await loadMembership(db, user.id, user.lastActiveOrganizationId)
  if (!membership) throw new Error(`${email} has no organization`)
  const [owner] = await db
    .select({ user: users })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .innerJoin(roles, eq(roles.id, members.roleId))
    .where(
      and(
        eq(members.organizationId, membership.organizationId),
        eq(members.status, 'active'),
        eq(roles.key, 'owner'),
        ne(members.userId, user.id),
      ),
    )
    .limit(1)
  if (!owner) throw new Error('no other owner to act')
  const ctx = await contextFor(db, owner.user, { id: membership.organizationId })
  return { db, membership, ctx }
}

/** Changes the role the way an owner would (audited), keeping the entity limits. */
async function setRole(email: string | undefined, role: string | undefined) {
  const { systemRoleKey } = await import('@vento/shared')
  const key = systemRoleKey.parse(role)
  const { db, membership, ctx } = await membershipAndActor(email)
  const { roles } = await import('@/db/schema')
  const { and, eq } = await import('drizzle-orm')
  const { updateMemberAccess } = await import('@/modules/members/members.service')
  const [target] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.organizationId, membership.organizationId), eq(roles.key, key)))
  if (!target) throw new Error(`no role ${key}`)
  await updateMemberAccess(ctx, {
    memberId: membership.member.id,
    roleId: target.id,
    entityIds: membership.member.entityIds,
  })
  return { email, role: key, organizationName: membership.organizationName }
}

/** Removes the person the way an owner would: their sessions in that organization end. */
async function removeMemberFixture(email: string | undefined) {
  const { membership, ctx } = await membershipAndActor(email)
  const { removeMember } = await import('@/modules/members/members.service')
  await removeMember(ctx, membership.member.id)
  return { email, organizationName: membership.organizationName }
}

async function main() {
  const [name, arg, arg2] = process.argv.slice(2)
  const runs: Record<string, () => Promise<unknown>> = {
    member: createMember,
    unverified: createUnverified,
    'half-onboarded': createHalfOnboarded,
    invitation: () => createInvitationFixture(arg),
    'reset-by-admin': createResetByAdmin,
    'age-session': () => ageSession(arg),
    team: createTeam,
    'multi-org': createMultiOrg,
    'set-role': () => setRole(arg, arg2),
    'remove-member': () => removeMemberFixture(arg),
  }
  const run = name ? runs[name] : undefined
  if (!run) throw new Error(`Unknown fixture "${name}". Use: ${Object.keys(runs).join(', ')}`)
  process.stdout.write(`${JSON.stringify(await run())}\n`)
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error)
    process.exit(1)
  },
)
