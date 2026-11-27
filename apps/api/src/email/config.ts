/**
 * Start-up rules for email (plan section 13.3). Pure, so the whole matrix is unit-tested; `env.ts`
 * prints the problems and exits before the API serves anything.
 */

export type AppEnv = 'development' | 'staging' | 'production'

export type EmailConfig = {
  NODE_ENV: 'development' | 'test' | 'production'
  /** Unset means development, except under NODE_ENV=production, where it must be explicit. */
  APP_ENV?: AppEnv | undefined
  EMAIL_TRANSPORT: 'dev' | 'memory' | 'postmark'
  EMAIL_FROM: string
  POSTMARK_SERVER_TOKEN?: string | undefined
  POSTMARK_WEBHOOK_SECRET?: string | undefined
  EMAIL_ALLOWED_RECIPIENTS?: string | undefined
}

/** Signs of an automated run, read from the process environment. */
export type AutomationFlags = { ci: boolean; e2e: boolean }

export const AUTOMATED_RUN_PROBLEM =
  'Postmark is never used in tests, CI or e2e. Use EMAIL_TRANSPORT=memory or dev.'

export const WEBHOOK_SECRET_MIN_LENGTH = 32

/**
 * Domains of the fictional seed and demo data. They may be real domains someone owns, so a
 * seeded person must never get real email: these can't be allow-listed.
 */
export const SEED_DOMAINS = ['ventohomes.ng', 'lekkipartners.ng'] as const

/** `CI=false` or `CI=0` is someone switching it off, not a CI run. */
export function automationFlags(source: Record<string, string | undefined>): AutomationFlags {
  const ci = source.CI?.trim().toLowerCase()
  return { ci: Boolean(ci) && ci !== 'false' && ci !== '0', e2e: source.VENTO_E2E === '1' }
}

export function resolvedAppEnv(config: Pick<EmailConfig, 'APP_ENV'>): AppEnv {
  return config.APP_ENV ?? 'development'
}

/** The address inside `"Name" <address>` or a bare address. */
export function senderAddress(from: string): string {
  return (from.match(/<([^>]*)>/)?.[1] ?? from).trim()
}

/** Postmark only sends from a verified sender; a localhost address can never be one. */
function isRealSender(from: string): boolean {
  const domain = senderAddress(from).split('@')[1]?.toLowerCase() ?? ''
  return domain.includes('.') && domain !== 'localhost' && !domain.endsWith('.localhost')
}

function postmarkProblems(config: EmailConfig, where: string): string[] {
  const problems: string[] = []
  if (config.EMAIL_TRANSPORT !== 'postmark') {
    problems.push(`EMAIL_TRANSPORT: ${where} sends email through Postmark; set it to postmark`)
  }
  if (!config.POSTMARK_SERVER_TOKEN) {
    problems.push(`POSTMARK_SERVER_TOKEN: Required on ${where}`)
  }
  if (!isRealSender(config.EMAIL_FROM)) {
    problems.push(
      `EMAIL_FROM: Use the verified sender, e.g. "Vento Real Estate <no-reply@mail.example.com>"`,
    )
  }
  return problems
}

function webhookSecretProblem(secret: string | undefined, required: boolean): string[] {
  if (!secret) return required ? ['POSTMARK_WEBHOOK_SECRET: Required (32+ random characters)'] : []
  return secret.length < WEBHOOK_SECRET_MIN_LENGTH
    ? ['POSTMARK_WEBHOOK_SECRET: Use at least 32 random characters (openssl rand -hex 32)']
    : []
}

const isSeedDomain = (domain: string): boolean =>
  SEED_DOMAINS.some((seed) => domain === seed || domain.endsWith(`.${seed}`))

/**
 * Problems with a set `EMAIL_ALLOWED_RECIPIENTS`. The parser (`allow-list.ts`) skips empty entries,
 * so a list like `","` would allow nobody while looking configured, and a `*` or a space would
 * silently match nothing: both are refused here instead of failing quietly at send time.
 */
export function allowListProblems(raw: string): string[] {
  const entries = raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
  if (!entries.length) {
    return ['EMAIL_ALLOWED_RECIPIENTS: List at least one domain or address, separated by commas']
  }
  const problems: string[] = []
  const unusable = entries.filter((entry) => /[\s*]/.test(entry))
  if (unusable.length) {
    problems.push(
      `EMAIL_ALLOWED_RECIPIENTS: Wildcards and spaces aren't supported (${unusable.join(', ')}); list each domain (@example.com) or address`,
    )
  }
  const seeded = entries.filter((entry) => isSeedDomain(entry.slice(entry.lastIndexOf('@') + 1)))
  if (seeded.length) {
    problems.push(
      `EMAIL_ALLOWED_RECIPIENTS: ${seeded.join(', ')} is seed or demo data (${SEED_DOMAINS.join(', ')}); seeded people must never get real email`,
    )
  }
  return problems
}

/** Every reason the email settings are unsafe to start with; empty when they're fine. */
export function emailConfigProblems(config: EmailConfig, flags: AutomationFlags): string[] {
  // Automated runs first: whatever else is configured, they can never reach a real inbox.
  if (config.NODE_ENV === 'test' || flags.ci || flags.e2e) {
    const usesPostmark =
      config.EMAIL_TRANSPORT === 'postmark' || Boolean(config.POSTMARK_SERVER_TOKEN)
    return usesPostmark ? [AUTOMATED_RUN_PROBLEM] : []
  }

  if (config.NODE_ENV === 'production' && !config.APP_ENV) {
    return ['APP_ENV: Set APP_ENV to staging or production']
  }

  const appEnv = resolvedAppEnv(config)
  const allowList = config.EMAIL_ALLOWED_RECIPIENTS
  if (appEnv === 'production') {
    return [
      ...(config.NODE_ENV === 'production'
        ? []
        : ['NODE_ENV: APP_ENV=production needs NODE_ENV=production']),
      ...postmarkProblems(config, 'production'),
      ...webhookSecretProblem(config.POSTMARK_WEBHOOK_SECRET, true),
      // An allow-list in production would silently drop customers' email.
      ...(allowList ? ['EMAIL_ALLOWED_RECIPIENTS: Must be empty in production'] : []),
    ]
  }
  if (appEnv === 'staging') {
    return [
      ...postmarkProblems(config, 'staging'),
      ...webhookSecretProblem(config.POSTMARK_WEBHOOK_SECRET, true),
      ...(allowList
        ? allowListProblems(allowList)
        : ['EMAIL_ALLOWED_RECIPIENTS: Required on staging (domains or addresses)']),
    ]
  }

  if (config.NODE_ENV === 'production') {
    return ['APP_ENV: Set APP_ENV to staging or production']
  }
  if (config.EMAIL_TRANSPORT !== 'postmark') return []
  // Development with real email (owner's choice): only to the people listed, the rest to .mail/.
  return [
    ...postmarkProblems(config, 'development'),
    ...webhookSecretProblem(config.POSTMARK_WEBHOOK_SECRET, false),
    ...(allowList
      ? allowListProblems(allowList)
      : [
          'EMAIL_ALLOWED_RECIPIENTS: Required to send real email in development (your own addresses)',
        ]),
  ]
}
