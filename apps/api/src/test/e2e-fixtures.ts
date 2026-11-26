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
 *   tsx src/test/e2e-fixtures.ts team-scoped            owner, an admin limited to Parkview, and members with narrower and wider entity access
 *   tsx src/test/e2e-fixtures.ts starter-team [places]  Starter org (owner, admin, sales) with `places` people places left (default 2)
 *   tsx src/test/e2e-fixtures.ts team-invitation <orgId> <pending|expired|failed|bounced|complained> [email]  an open invitation with that state
 *   tsx src/test/e2e-fixtures.ts plans                  publishes the starting plans (Starter, Growth, Enterprise) if missing
 *   tsx src/test/e2e-fixtures.ts starter-org            standard organization on Starter: owner (two-step on), a sales member, one entity
 *   tsx src/test/e2e-fixtures.ts org-group <orgId> <standard|pilot|internal>
 *   tsx src/test/e2e-fixtures.ts org-override <orgId> <release|feature> <flag> <on|off|clear>
 *   tsx src/test/e2e-fixtures.ts org-override <orgId> limit <limit> <n|unlimited|clear>
 *   tsx src/test/e2e-fixtures.ts org-trial <orgId> <plan> <days>
 *   tsx src/test/e2e-fixtures.ts org-release <orgId> <flag,flag,...>   release overrides on, in one go
 *   tsx src/test/e2e-fixtures.ts companies [starter]    holding, Parkview, Lekki (two people only there), archived Ikoyi Crest; owner, Parkview-only admin, sales
 *   tsx src/test/e2e-fixtures.ts custom-role [name]     a custom role from Project manager held by one member, plus a viewer to give it to
 *   tsx src/test/e2e-fixtures.ts role-editor            an "Office manager" custom role (Settings, Sales; no Finance) with its holder, an admin and a sales member
 *   tsx src/test/e2e-fixtures.ts no-company             a member limited only to an archived company
 *
 * Organizations from `member`, `team` and `multi-org` are internal (everything, "Soon" tags), as
 * every organization was before feature flags. Fixtures only change per-organization data, never
 * global release stages, so specs can run in parallel.
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
  await makeInternal(email)
  return { email, password: TEST_PASSWORD, totpSecret: secret, organizationName, backupCodes }
}

/** Onboarding makes a standard organization; the 3a journeys expect an internal one. */
async function makeInternal(ownerEmail: string) {
  const { db } = await import('@/db/client')
  const { members, organizationPlans, users } = await import('@/db/schema')
  const { eq } = await import('drizzle-orm')
  const [row] = await db
    .select({ organizationId: members.organizationId })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(eq(users.email, ownerEmail))
  if (!row) throw new Error(`no organization for ${ownerEmail}`)
  await db
    .update(organizationPlans)
    .set({ releaseGroup: 'internal' })
    .where(eq(organizationPlans.organizationId, row.organizationId))
}

const E2E_ACTOR = { userId: null, name: 'Vento (e2e)', operator: 'e2e' }
const E2E_REASON = 'e2e fixture'

async function publishPlans() {
  const { db } = await import('@/db/client')
  const { seedPlans } = await import('@/platform/seed-plans')
  return { published: await seedPlans(db, E2E_ACTOR) }
}

/** "Lekki Partners …" on Starter: the owner sees plan hints, the sales member never does. */
async function createStarterOrg() {
  const { db } = await import('@/db/client')
  const {
    createEntity,
    createMember: addMember,
    createOrganization,
    TEST_PASSWORD,
  } = await import('./factories')
  await publishPlans()
  const suffix = Date.now().toString(36)
  const owner = await passwordUser(db, 'Bisi Lawal', 'e2e.starter.owner')
  const org = await createOrganization(db, {
    name: `Lekki Partners ${suffix}`,
    owner,
    planKey: 'starter',
  })
  await createEntity(db, org, { name: `Lekki Partners ${suffix} Ltd`, type: 'holding' })
  const sales = await passwordUser(db, 'Grace Umeh', 'e2e.starter.sales')
  await addMember(db, org, { role: 'sales', user: sales })
  const totpSecret = await turnOnTwoStep(owner.email)
  return {
    organizationId: org.id,
    organizationName: org.name,
    password: TEST_PASSWORD,
    owner: { email: owner.email, name: owner.name, totpSecret },
    sales: { email: sales.email, name: sales.name },
  }
}

async function organizationRef(id: string | undefined) {
  const { db } = await import('@/db/client')
  const { organizationById } = await import('@/platform/operations/common')
  return { db, organization: await organizationById(db, id ?? '') }
}

async function orgGroup(id: string | undefined, group: string | undefined) {
  const { releaseGroup } = await import('@vento/shared')
  const { db, organization } = await organizationRef(id)
  const { setReleaseGroup } = await import('@/platform/operations/release')
  const to = releaseGroup.parse(group)
  const { releaseGroup: current } = await (
    await import('@/platform/snapshot')
  ).loadOrganizationPlan(db, organization.id)
  if (current !== to) {
    await setReleaseGroup(db, E2E_ACTOR, { organization, group: to, reason: E2E_REASON })
  }
  return { organizationId: organization.id, releaseGroup: to }
}

async function orgOverride(args: (string | undefined)[]) {
  const [id, kind, key, value] = args
  const { featureKey, limitKey } = await import('@vento/shared')
  const { db, organization } = await organizationRef(id)
  const ops = await import('@/platform/operations/plans')
  const release = await import('@/platform/operations/release')
  const base = { organization, reason: E2E_REASON }
  const onOff = (v: string | undefined) => {
    if (v === 'on' || v === 'off' || v === 'clear') return v
    throw new Error('value must be on, off or clear')
  }
  if (kind === 'release') {
    await release.setReleaseOverride(db, E2E_ACTOR, {
      ...base,
      key: featureKey.parse(key),
      value: onOff(value),
    })
  } else if (kind === 'feature') {
    await ops.setFeatureOverride(db, E2E_ACTOR, {
      ...base,
      key: featureKey.parse(key),
      value: onOff(value),
    })
  } else if (kind === 'limit') {
    const limit = limitKey.parse(key)
    await ops.setLimitOverride(db, E2E_ACTOR, {
      ...base,
      key: limit,
      value: ops.parseLimitValue(limit, value ?? ''),
    })
  } else {
    throw new Error('kind must be release, feature or limit')
  }
  return { organizationId: organization.id, kind, key, value }
}

/** Releases several flags to one organization in one process: a feature and what it needs. */
async function orgRelease(id: string | undefined, flags: string | undefined) {
  const keys = (flags ?? '').split(',').filter(Boolean)
  for (const key of keys) await orgOverride([id, 'release', key, 'on'])
  return { organizationId: id, released: keys }
}

async function orgTrial(
  id: string | undefined,
  plan: string | undefined,
  days: string | undefined,
) {
  const { db, organization } = await organizationRef(id)
  const { findPlanVersion } = await import('@/platform/operations/common')
  const { startTrial } = await import('@/platform/operations/plans')
  await publishPlans()
  const target = await findPlanVersion(db, plan ?? '')
  await startTrial(db, E2E_ACTOR, {
    organization,
    target,
    days: Number(days),
    reason: E2E_REASON,
  })
  return { organizationId: organization.id, plan: target.planKey, days: Number(days) }
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

/**
 * "Vento Homes" for the Team screens' entity-scope rules. Ibrahim (admin) is limited to Parkview;
 * Kunle is Parkview only (within his reach), Tayo has Parkview and Lekki, and Grace and Aisha have
 * every entity (beyond his reach).
 */
async function createTeamScoped() {
  const { db } = await import('@/db/client')
  const {
    createEntity,
    createMember: addMember,
    createOrganization,
    TEST_PASSWORD,
  } = await import('./factories')

  const suffix = Date.now().toString(36)
  const owner = await passwordUser(db, 'Olumide Bankole', 'e2e.scoped.owner')
  const org = await createOrganization(db, { name: `Vento Homes ${suffix}`, owner })
  await createEntity(db, org, { name: `Vento Homes ${suffix} Ltd`, type: 'holding' })
  const parkview = await createEntity(db, org, { name: 'Parkview Residences SPV Ltd' })
  const lekki = await createEntity(db, org, { name: 'Lekki Gardens SPV Ltd' })

  const people = [
    { key: 'limitedAdmin', role: 'admin', name: 'Ibrahim Sule', entityIds: [parkview.id] },
    { key: 'facility', role: 'facility', name: 'Kunle Balogun', entityIds: [parkview.id] },
    { key: 'both', role: 'sales', name: 'Tayo Adeleke', entityIds: [parkview.id, lekki.id] },
    { key: 'sales', role: 'sales', name: 'Grace Umeh', entityIds: undefined },
    { key: 'finance', role: 'finance', name: 'Aisha Bello', entityIds: undefined },
  ] as const
  const members: Record<string, { email: string; name: string; totpSecret?: string }> = {
    owner: {
      email: owner.email,
      name: owner.name,
      totpSecret: await turnOnTwoStep(owner.email),
    },
  }
  for (const p of people) {
    const user = await passwordUser(db, p.name, `e2e.scoped.${p.key.toLowerCase()}`)
    await addMember(db, org, {
      role: p.role,
      user,
      ...(p.entityIds && { entityIds: [...p.entityIds] }),
    })
    const needsTwoStep = p.role === 'admin' || p.role === 'finance'
    members[p.key] = {
      email: user.email,
      name: p.name,
      ...(needsTwoStep && { totpSecret: await turnOnTwoStep(user.email) }),
    }
  }
  return {
    organizationId: org.id,
    organizationName: org.name,
    password: TEST_PASSWORD,
    entities: {
      parkview: { id: parkview.id, name: parkview.name },
      lekki: { id: lekki.id, name: lekki.name },
    },
    members,
  }
}

/** A Starter organization with `places` people places left, so a batch can be too big for it. */
async function createStarterTeam(places: string | undefined) {
  const { db } = await import('@/db/client')
  const {
    createEntity,
    createMember: addMember,
    createOrganization,
    TEST_PASSWORD,
  } = await import('./factories')
  await publishPlans()
  const suffix = Date.now().toString(36)
  const owner = await passwordUser(db, 'Bisi Lawal', 'e2e.limit.owner')
  const org = await createOrganization(db, {
    name: `Lekki Partners ${suffix}`,
    owner,
    planKey: 'starter',
  })
  await createEntity(db, org, { name: `Lekki Partners ${suffix} Ltd`, type: 'holding' })
  const admin = await passwordUser(db, 'Ngozi Adeyemi', 'e2e.limit.admin')
  await addMember(db, org, { role: 'admin', user: admin })
  const sales = await passwordUser(db, 'Grace Umeh', 'e2e.limit.sales')
  await addMember(db, org, { role: 'sales', user: sales })
  // Owner, admin and sales fill three places.
  const limit = 3 + Number(places ?? '2')
  await orgOverride([org.id, 'limit', 'members', String(limit)])
  return {
    organizationId: org.id,
    organizationName: org.name,
    password: TEST_PASSWORD,
    limit,
    owner: { email: owner.email, name: owner.name, totpSecret: await turnOnTwoStep(owner.email) },
    admin: { email: admin.email, name: admin.name, totpSecret: await turnOnTwoStep(admin.email) },
    sales: { email: sales.email, name: sales.name },
  }
}

/** An open invitation in an existing organization, in the given delivery or expiry state. */
async function createTeamInvitation(
  orgId: string | undefined,
  state: string | undefined,
  email: string | undefined,
) {
  const { db } = await import('@/db/client')
  const { members, organizations, roles, users } = await import('@/db/schema')
  const { syncSystemRoles } = await import('@/access/system-roles')
  const { and, eq } = await import('drizzle-orm')
  const { createInvitation } = await import('./factories')
  const { uniqueEmail } = await import('./db')
  if (!orgId) throw new Error('team-invitation needs an organization id')

  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId))
  const [owner] = await db
    .select({ user: users, memberId: members.id })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .innerJoin(roles, eq(roles.id, members.roleId))
    .where(and(eq(members.organizationId, orgId), eq(roles.key, 'owner')))
    .limit(1)
  if (!org || !owner) throw new Error(`no organization or owner for ${orgId}`)
  const roleIds = await syncSystemRoles(db, orgId)
  const testOrg = {
    id: org.id,
    name: org.name,
    roleIds,
    owner: owner.user,
    ownerMemberId: owner.memberId,
  }

  const delivery = ['failed', 'bounced', 'complained'].includes(state ?? '') ? state : 'sent'
  const expired = state === 'expired'
  const address = email ?? uniqueEmail('e2e.invited')
  const { invitation } = await createInvitation(db, testOrg, {
    role: 'sales',
    email: address,
    status: 'pending', // past its date, an open invitation reads as expired
    ...(expired && { expiresAt: new Date(Date.now() - 24 * 3600_000) }),
    delivery: delivery as 'sent' | 'failed' | 'bounced' | 'complained',
  })
  return { id: invitation.id, email: address, state }
}

/** The archived SPV every 3c fixture uses: RC clash, Restore, "Archived … by …". */
const IKOYI = { name: 'Ikoyi Crest SPV Ltd', rcNumber: 'RC 1832276' }

/**
 * Settings → Companies (J-ONB-07). Lekki Gardens is the only company Kunle and Ope can see, so
 * archiving it asks first. `starter`: on Starter at 2 of 2 active companies, with an
 * all-companies admin, for the plan message and the admin's server refusal.
 */
async function createCompanies(mode: string | undefined) {
  const { db } = await import('@/db/client')
  const f = await import('./factories')
  const starter = mode === 'starter'
  if (starter) await publishPlans()
  const suffix = Date.now().toString(36)
  const owner = await passwordUser(db, 'Olumide Bankole', 'e2e.companies.owner')
  const org = await f.createOrganization(db, {
    name: `Vento Homes ${suffix}`,
    owner,
    ...(starter && { planKey: 'starter' }),
  })
  const holding = await f.createEntity(db, org, {
    name: `Vento Homes ${suffix} Ltd`,
    type: 'holding',
  })
  const parkview = await f.createEntity(db, org, {
    name: 'Parkview Residences SPV Ltd',
    rcNumber: 'RC 1789234',
  })
  const lekki = starter
    ? null
    : await f.createEntity(db, org, { name: 'Lekki Gardens SPV Ltd', rcNumber: 'RC 1904417' })
  const ikoyi = await f.archiveEntityRow(db, await f.createEntity(db, org, IKOYI), owner)

  const people: Record<string, { email: string; name: string; totpSecret?: string }> = {
    owner: { email: owner.email, name: owner.name, totpSecret: await turnOnTwoStep(owner.email) },
  }
  const add = async (
    key: string,
    name: string,
    role: 'admin' | 'sales' | 'project_manager' | 'facility',
    entityIds?: string[],
  ) => {
    const user = await passwordUser(db, name, `e2e.companies.${key.toLowerCase()}`)
    await f.createMember(db, org, { role, user, ...(entityIds && { entityIds }) })
    const totpSecret = role === 'admin' ? await turnOnTwoStep(user.email) : undefined
    people[key] = { email: user.email, name, ...(totpSecret && { totpSecret }) }
  }
  if (starter) await add('admin', 'Ngozi Adeyemi', 'admin')
  else {
    await add('parkviewAdmin', 'Funmi Akande', 'admin', [parkview.id])
    if (lekki) {
      await add('kunle', 'Kunle Ojo', 'project_manager', [lekki.id])
      await add('ope', 'Ope Martins', 'facility', [lekki.id])
    }
  }
  await add('sales', 'Grace Umeh', 'sales')
  const ref = (e: { id: string; name: string } | null) => e && { id: e.id, name: e.name }
  return {
    organizationId: org.id,
    organizationName: org.name,
    password: f.TEST_PASSWORD,
    entities: {
      holding: ref(holding),
      parkview: { ...ref(parkview), rcNumber: 'RC 1789234' },
      ...(lekki && { lekki: { ...ref(lekki), rcNumber: 'RC 1904417' } }),
      ikoyi: { ...ref(ikoyi), rcNumber: IKOYI.rcNumber },
    },
    members: people,
  }
}

/** A custom role made from Project manager, held by Bayo; Chidi (viewer) is there to be given it. */
async function createCustomRoleFixture(name: string | undefined) {
  const { db } = await import('@/db/client')
  const { defaultPermissions, defaultRole } = await import('@vento/shared')
  const f = await import('./factories')
  const suffix = Date.now().toString(36)
  const owner = await passwordUser(db, 'Olumide Bankole', 'e2e.roles.owner')
  const org = await f.createOrganization(db, { name: `Vento Homes ${suffix}`, owner })
  await f.createEntity(db, org, { name: `Vento Homes ${suffix} Ltd`, type: 'holding' })
  const role = await f.createCustomRole(db, org, {
    name: name ?? 'Site supervisor',
    permissions: defaultPermissions(defaultRole('project_manager')),
  })
  const bayo = await passwordUser(db, 'Bayo Ogunleye', 'e2e.roles.holder')
  await f.createMember(db, org, { role: 'viewer', roleId: role.id, user: bayo })
  const chidi = await passwordUser(db, 'Chidi Okafor', 'e2e.roles.chidi')
  await f.createMember(db, org, { role: 'viewer', user: chidi })
  return {
    organizationId: org.id,
    organizationName: org.name,
    password: f.TEST_PASSWORD,
    role: { id: role.id, name: role.name },
    owner: { email: owner.email, name: owner.name, totpSecret: await turnOnTwoStep(owner.email) },
    holder: { email: bayo.email, name: bayo.name },
    viewer: { email: chidi.email, name: chidi.name },
  }
}

/**
 * The permission ceiling: Ngozi holds "Office manager" (Settings create, edit and delete, and
 * Sales; no Finance or HR; two-step on). Kemi is an admin (wider), Grace is sales (within).
 */
async function createRoleEditor() {
  const { db } = await import('@/db/client')
  const f = await import('./factories')
  const suffix = Date.now().toString(36)
  const owner = await passwordUser(db, 'Olumide Bankole', 'e2e.editor.owner')
  const org = await f.createOrganization(db, { name: `Vento Homes ${suffix}`, owner })
  await f.createEntity(db, org, { name: `Vento Homes ${suffix} Ltd`, type: 'holding' })
  const ngozi = await passwordUser(db, 'Ngozi Eze', 'e2e.editor.office')
  const editor = await f.createOfficeManager(db, org, ngozi)
  const kemi = await passwordUser(db, 'Kemi Adebayo', 'e2e.editor.admin')
  await f.createMember(db, org, { role: 'admin', user: kemi })
  const grace = await passwordUser(db, 'Grace Umeh', 'e2e.editor.sales')
  await f.createMember(db, org, { role: 'sales', user: grace })
  return {
    organizationId: org.id,
    organizationName: org.name,
    password: f.TEST_PASSWORD,
    role: { id: editor.role.id, name: editor.role.name },
    editor: { email: ngozi.email, name: ngozi.name, totpSecret: await turnOnTwoStep(ngozi.email) },
    admin: { email: kemi.email, name: kemi.name, totpSecret: await turnOnTwoStep(kemi.email) },
    sales: { email: grace.email, name: grace.name },
  }
}

/** Kunle can see only Ikoyi Crest, which is archived: "No company" and the Home card. */
async function createNoCompany() {
  const { db } = await import('@/db/client')
  const f = await import('./factories')
  const suffix = Date.now().toString(36)
  const owner = await passwordUser(db, 'Olumide Bankole', 'e2e.nocompany.owner')
  const org = await f.createOrganization(db, { name: `Vento Homes ${suffix}`, owner })
  await f.createEntity(db, org, { name: `Vento Homes ${suffix} Ltd`, type: 'holding' })
  const ikoyi = await f.archiveEntityRow(db, await f.createEntity(db, org, IKOYI), owner)
  const kunle = await passwordUser(db, 'Kunle Ojo', 'e2e.nocompany.member')
  await f.createMember(db, org, { role: 'project_manager', user: kunle, entityIds: [ikoyi.id] })
  return {
    organizationId: org.id,
    organizationName: org.name,
    password: f.TEST_PASSWORD,
    archived: { id: ikoyi.id, name: ikoyi.name },
    owner: { email: owner.email, name: owner.name },
    member: { email: kunle.email, name: kunle.name },
  }
}

async function main() {
  const [name, arg, arg2, arg3, arg4] = process.argv.slice(2)
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
    'team-scoped': createTeamScoped,
    'starter-team': () => createStarterTeam(arg),
    'team-invitation': () => createTeamInvitation(arg, arg2, arg3),
    plans: publishPlans,
    'starter-org': createStarterOrg,
    'org-group': () => orgGroup(arg, arg2),
    'org-override': () => orgOverride([arg, arg2, arg3, arg4]),
    'org-trial': () => orgTrial(arg, arg2, arg3),
    'org-release': () => orgRelease(arg, arg2),
    companies: () => createCompanies(arg),
    'custom-role': () => createCustomRoleFixture(arg),
    'role-editor': createRoleEditor,
    'no-company': createNoCompany,
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
