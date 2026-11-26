import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AUTOMATED_RUN_PROBLEM,
  allowListProblems,
  automationFlags,
  type EmailConfig,
  emailConfigProblems,
} from './config'

const none = { ci: false, e2e: false }
const secret = 'x'.repeat(32)

const dev: EmailConfig = {
  NODE_ENV: 'development',
  EMAIL_TRANSPORT: 'dev',
  EMAIL_FROM: 'Vento Real Estate <no-reply@localhost>',
}
const postmark: EmailConfig = {
  NODE_ENV: 'production',
  EMAIL_TRANSPORT: 'postmark',
  EMAIL_FROM: 'Vento Real Estate <no-reply@mail.vento.example>',
  POSTMARK_SERVER_TOKEN: 'server-token',
  POSTMARK_WEBHOOK_SECRET: secret,
}

describe('email start-up guards: tests, CI and e2e', () => {
  it.each([
    ['NODE_ENV=test', { ...dev, NODE_ENV: 'test' as const }, none],
    ['CI', dev, { ci: true, e2e: false }],
    ['VENTO_E2E=1', dev, { ci: false, e2e: true }],
  ])('refuses Postmark under %s, with the exact message', (_, base, flags) => {
    const asPostmark = { ...base, EMAIL_TRANSPORT: 'postmark' as const }
    expect(emailConfigProblems(asPostmark, flags)).toEqual([AUTOMATED_RUN_PROBLEM])
    expect(AUTOMATED_RUN_PROBLEM).toBe(
      'Postmark is never used in tests, CI or e2e. Use EMAIL_TRANSPORT=memory or dev.',
    )
  })

  it('refuses a Postmark token even when the transport is dev', () => {
    const withToken = { ...dev, POSTMARK_SERVER_TOKEN: 'server-token' }
    expect(emailConfigProblems(withToken, { ci: true, e2e: false })).toEqual([
      AUTOMATED_RUN_PROBLEM,
    ])
  })

  it('wins over staging and production settings', () => {
    expect(
      emailConfigProblems({ ...postmark, APP_ENV: 'production' }, { ci: false, e2e: true }),
    ).toEqual([AUTOMATED_RUN_PROBLEM])
  })

  it('lets memory and dev run', () => {
    expect(
      emailConfigProblems({ ...dev, NODE_ENV: 'test', EMAIL_TRANSPORT: 'memory' }, none),
    ).toEqual([])
    expect(emailConfigProblems(dev, { ci: true, e2e: true })).toEqual([])
  })

  it('reads CI and VENTO_E2E from the environment', () => {
    expect(automationFlags({ CI: 'true' })).toEqual({ ci: true, e2e: false })
    expect(automationFlags({ CI: 'false', VENTO_E2E: '1' })).toEqual({ ci: false, e2e: true })
    expect(automationFlags({})).toEqual(none)
  })
})

describe('email start-up guards: staging and production', () => {
  const staging = {
    ...postmark,
    APP_ENV: 'staging' as const,
    EMAIL_ALLOWED_RECIPIENTS: 'you@example.com,@your-test-domain.com',
  }
  const production = { ...postmark, APP_ENV: 'production' as const }

  it('starts staging with Postmark, a real sender, the secret and an allow-list', () => {
    expect(emailConfigProblems(staging, none)).toEqual([])
  })

  it('refuses staging without an allow-list, a token, a real sender or a long secret', () => {
    const problems = emailConfigProblems(
      {
        ...staging,
        EMAIL_ALLOWED_RECIPIENTS: undefined,
        POSTMARK_SERVER_TOKEN: undefined,
        EMAIL_FROM: 'Vento Real Estate <no-reply@localhost>',
        POSTMARK_WEBHOOK_SECRET: 'short',
      },
      none,
    )
    expect(problems.map((p) => p.split(':')[0])).toEqual([
      'POSTMARK_SERVER_TOKEN',
      'EMAIL_FROM',
      'POSTMARK_WEBHOOK_SECRET',
      'EMAIL_ALLOWED_RECIPIENTS',
    ])
  })

  it('refuses the dev transport on staging', () => {
    expect(emailConfigProblems({ ...staging, EMAIL_TRANSPORT: 'dev' }, none)[0]).toMatch(
      /^EMAIL_TRANSPORT:/,
    )
  })

  it('starts production with Postmark and no allow-list', () => {
    expect(emailConfigProblems(production, none)).toEqual([])
  })

  it('refuses an allow-list in production, so mail is never silently dropped', () => {
    expect(
      emailConfigProblems({ ...production, EMAIL_ALLOWED_RECIPIENTS: 'a@b.ng' }, none),
    ).toEqual(['EMAIL_ALLOWED_RECIPIENTS: Must be empty in production'])
  })

  it('refuses APP_ENV=production without NODE_ENV=production', () => {
    expect(emailConfigProblems({ ...production, NODE_ENV: 'development' }, none)).toEqual([
      'NODE_ENV: APP_ENV=production needs NODE_ENV=production',
    ])
  })

  it('refuses NODE_ENV=production without APP_ENV', () => {
    expect(emailConfigProblems(postmark, none)).toEqual([
      'APP_ENV: Set APP_ENV to staging or production',
    ])
    expect(emailConfigProblems({ ...postmark, APP_ENV: 'development' }, none)).toEqual([
      'APP_ENV: Set APP_ENV to staging or production',
    ])
  })
})

describe('email start-up guards: development', () => {
  const realEmail: EmailConfig = {
    ...postmark,
    NODE_ENV: 'development',
    POSTMARK_WEBHOOK_SECRET: undefined,
    EMAIL_ALLOWED_RECIPIENTS: 'olumide@gmail.com',
  }

  it('uses the dev transport by default', () => {
    expect(emailConfigProblems(dev, none)).toEqual([])
  })

  it('sends real email in manual testing only with a token and an allow-list', () => {
    expect(emailConfigProblems(realEmail, none)).toEqual([])
    expect(
      emailConfigProblems({ ...realEmail, EMAIL_ALLOWED_RECIPIENTS: undefined }, none),
    ).toEqual([
      'EMAIL_ALLOWED_RECIPIENTS: Required to send real email in development (your own addresses)',
    ])
    expect(emailConfigProblems({ ...realEmail, POSTMARK_SERVER_TOKEN: undefined }, none)).toEqual([
      'POSTMARK_SERVER_TOKEN: Required on development',
    ])
  })
})

describe('the email allow-list at start-up', () => {
  const staging: EmailConfig = {
    ...postmark,
    APP_ENV: 'staging',
    EMAIL_ALLOWED_RECIPIENTS: 'you@example.com',
  }
  const development: EmailConfig = {
    ...postmark,
    NODE_ENV: 'development',
    POSTMARK_WEBHOOK_SECRET: undefined,
    EMAIL_ALLOWED_RECIPIENTS: 'you@example.com',
  }

  it.each([
    ['you@example.com,@your-test-domain.com', []],
    [' you@example.com , your-test-domain.com ,', []],
    [',', ['EMAIL_ALLOWED_RECIPIENTS: List at least one domain or address, separated by commas']],
    [
      ' , ,',
      ['EMAIL_ALLOWED_RECIPIENTS: List at least one domain or address, separated by commas'],
    ],
    [
      '*@example.com',
      [
        "EMAIL_ALLOWED_RECIPIENTS: Wildcards and spaces aren't supported (*@example.com); list each domain (@example.com) or address",
      ],
    ],
    [
      'you@example.com,@*.example.com,first last@example.com',
      [
        "EMAIL_ALLOWED_RECIPIENTS: Wildcards and spaces aren't supported (@*.example.com, first last@example.com); list each domain (@example.com) or address",
      ],
    ],
  ])('checks %j', (raw, problems) => {
    expect(allowListProblems(raw)).toEqual(problems)
  })

  it.each([
    '@ventohomes.ng',
    'ventohomes.ng',
    'Aisha@VentoHomes.ng',
    '@lekkipartners.ng',
    'tunde@lekkipartners.ng',
    '@mail.ventohomes.ng',
  ])('refuses the seed domain in %j, so seeded people never get real email', (entry) => {
    const [problem] = allowListProblems(`you@example.com,${entry}`)
    expect(problem).toBe(
      `EMAIL_ALLOWED_RECIPIENTS: ${entry.trim().toLowerCase()} is seed or demo data (ventohomes.ng, lekkipartners.ng); seeded people must never get real email`,
    )
  })

  it.each([
    ['staging', staging],
    ['development with Postmark', development],
  ])('refuses to start %s with a list that is empty, a wildcard or a seed domain', (_, base) => {
    expect(emailConfigProblems(base, none)).toEqual([])
    for (const raw of [',', '*', '@ventohomes.ng']) {
      const problems = emailConfigProblems({ ...base, EMAIL_ALLOWED_RECIPIENTS: raw }, none)
      expect(problems).toHaveLength(1)
      expect(problems[0]).toMatch(/^EMAIL_ALLOWED_RECIPIENTS: /)
    }
  })

  it('ignores the list when development uses the dev transport', () => {
    expect(
      emailConfigProblems({ ...dev, EMAIL_ALLOWED_RECIPIENTS: '@ventohomes.ng' }, none),
    ).toEqual([])
  })
})

describe('the API process', () => {
  it('exits with the message when a test run is configured for Postmark', () => {
    const apiRoot = join(import.meta.dirname, '..', '..')
    const run = spawnSync(join(apiRoot, 'node_modules', '.bin', 'tsx'), ['src/env.ts'], {
      cwd: apiRoot,
      encoding: 'utf8',
      timeout: 30_000,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        NODE_ENV: 'test',
        EMAIL_TRANSPORT: 'postmark',
        DATABASE_URL: 'postgres://vento:vento@localhost:5432/vento_build_test',
        WEB_ORIGIN: 'http://localhost:5173',
        BETTER_AUTH_SECRET: 'test-only-secret-not-for-real-use-00000000',
      },
    })
    expect(run.status).toBe(1)
    expect(run.stderr).toContain(AUTOMATED_RUN_PROBLEM)
  })
})
