/**
 * Test data for Playwright, created in the database the e2e API uses (DATABASE_URL).
 *
 *   tsx src/test/e2e-fixtures.ts member                 verified owner with two-step on
 *   tsx src/test/e2e-fixtures.ts unverified             account whose email is not verified
 *   tsx src/test/e2e-fixtures.ts half-onboarded         verified, organization made, no entity yet
 *   tsx src/test/e2e-fixtures.ts invitation [status]    Finance invitation (pending|expired|withdrawn)
 *   tsx src/test/e2e-fixtures.ts reset-by-admin         member whose two-step an admin just reset
 *   tsx src/test/e2e-fixtures.ts age-session <email>    makes that person's sessions 40 minutes idle
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

async function main() {
  const [name, arg] = process.argv.slice(2)
  const runs: Record<string, () => Promise<unknown>> = {
    member: createMember,
    unverified: createUnverified,
    'half-onboarded': createHalfOnboarded,
    invitation: () => createInvitationFixture(arg),
    'reset-by-admin': createResetByAdmin,
    'age-session': () => ageSession(arg),
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
