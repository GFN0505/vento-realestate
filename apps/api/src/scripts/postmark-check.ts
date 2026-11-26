/**
 * Opt-in check of the Postmark transport against Postmark's real API, using Postmark's test token
 * (`POSTMARK_API_TEST`): Postmark validates and answers, but delivers nothing. Never part of
 * `pnpm test` (the file isn't a *.test.ts) and never in CI (env.ts refuses a token there).
 *
 *   VENTO_EMAIL_INTEGRATION=1 POSTMARK_SERVER_TOKEN=POSTMARK_API_TEST pnpm --filter @vento/api email:check
 */
const TEST_TOKEN = 'POSTMARK_API_TEST'

if (process.env.VENTO_EMAIL_INTEGRATION !== '1') {
  process.stderr.write('Set VENTO_EMAIL_INTEGRATION=1 to run the Postmark check.\n')
  process.exit(1)
}
if (process.env.POSTMARK_SERVER_TOKEN !== TEST_TOKEN) {
  process.stderr.write(
    `The Postmark check only runs with Postmark's test token (POSTMARK_SERVER_TOKEN=${TEST_TOKEN}); it never uses a real one.\n`,
  )
  process.exit(1)
}

// Imported after the checks: these load and validate the environment.
const { createPostmarkTransport } = await import('@/email/transports/postmark')
const { env } = await import('@/env')

const transport = createPostmarkTransport({
  token: TEST_TOKEN,
  from: 'Vento Real Estate <no-reply@example.com>',
  stream: env.POSTMARK_MESSAGE_STREAM,
})
const message = {
  subject: 'Vento email check',
  html: '<p>Postmark transport check.</p>',
  text: 'Postmark transport check.',
  tag: 'invitation' as const,
}
const results = await transport.sendBatch([
  { ...message, to: 'check@blackhole.postmarkapp.com' },
  {
    ...message,
    to: 'check@blackhole.postmarkapp.com',
    fromName: 'Vento "Check" via Vento',
    replyTo: { name: 'Vento Check', email: 'reply@example.com' },
    metadata: { invitationId: '01936f1e-8b2a-7c3d-9e4f-000000000000' },
  },
])

const ok = results.every((r) => r.status === 'sent' && r.messageId.length > 0)
process.stdout.write(`${JSON.stringify({ ok, results })}\n`)
process.exit(ok ? 0 : 1)
