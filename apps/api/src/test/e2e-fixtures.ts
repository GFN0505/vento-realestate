/**
 * Test data for Playwright, created in the database the e2e API uses (DATABASE_URL).
 *
 *   tsx src/test/e2e-fixtures.ts member      → a signed-up, verified owner with two-step on
 *   tsx src/test/e2e-fixtures.ts invitation  → a pending invitation to a Finance role
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
  const { totpURI } = await setUpTwoStep(b)
  const secret = new URL(totpURI).searchParams.get('secret') ?? ''
  return { email, password: TEST_PASSWORD, totpSecret: secret, organizationName }
}

async function createFinanceInvitation() {
  const { db } = await import('@/db/client')
  const { createEntity, createInvitation, createOrganization } = await import('./factories')
  const { uniqueEmail } = await import('./db')

  const org = await createOrganization(db, {
    name: `Victoria Gardens Ltd ${Date.now().toString(36)}`,
  })
  // Without an entity the app would send the invitee to onboarding, which only an owner finishes.
  await createEntity(db, org)
  const email = uniqueEmail('e2e.finance')
  const { token } = await createInvitation(db, org, { role: 'finance', email })
  return {
    token,
    email,
    organizationName: org.name,
    inviterName: org.owner.name,
    roleName: 'Finance',
  }
}

const commands = { member: createMember, invitation: createFinanceInvitation } as const

async function main() {
  const name = process.argv[2]
  const run = commands[name as keyof typeof commands]
  if (!run) throw new Error(`Unknown fixture "${name}". Use: ${Object.keys(commands).join(', ')}`)
  process.stdout.write(`${JSON.stringify(await run())}\n`)
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error)
    process.exit(1)
  },
)
