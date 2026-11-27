/**
 * A customer account or a Vento Real Estate staff account (decision 0023). Fixed when the account
 * is made: a database trigger refuses any change, and one email is only ever one kind.
 */
export const ACCOUNT_KINDS = ['customer', 'staff'] as const
export type AccountKind = (typeof ACCOUNT_KINDS)[number]

/**
 * The `users.account_kind` column as a Better Auth field (returned, never accepted on sign-up:
 * only the staff sign-up makes a staff account). Not yet in `authUserFields`: it joins them with
 * migration 0013 (admin-console plan §1b.3, step B1), since Better Auth reads every listed field.
 * Typed as a mutable array because Better Auth's enum type is `Array<LiteralString>`.
 */
export const accountKindUserField: {
  type: AccountKind[]
  required: true
  input: false
  defaultValue: 'customer'
} = { type: [...ACCOUNT_KINDS], required: true, input: false, defaultValue: 'customer' }

/**
 * Extra columns Better Auth keeps on its user and session rows. The API passes these to
 * `betterAuth({ user: { additionalFields } })` and the web passes them to
 * `inferAdditionalFields`, so both sides agree on names and which ones sign-up accepts.
 * Shapes follow Better Auth's field attributes; this package doesn't depend on it.
 */
export const authUserFields = {
  /** Typed on sign-up; pre-fills the organization name in onboarding. */
  companyName: { type: 'string', required: false, input: true },
  /** Must equal CURRENT_TERMS_VERSION on sign-up. */
  termsVersion: { type: 'string', required: false, input: true },
  termsAcceptedAt: { type: 'date', required: false, input: false },
  lastActiveOrganizationId: { type: 'string', required: false, input: false },
  /** Set when an owner or admin resets someone's two-step; cleared when they set it up again. */
  twoStepSetupRequired: { type: 'boolean', required: false, input: false, defaultValue: false },
} as const

/**
 * The console's session columns (docs/plans/admin-console.md §3, migration 0011), spread
 * into `authSessionFields`. No defaultValue, for the same reason as `persistent`: a rotated
 * session must carry them over (or have the server clear them), never be reset by a default.
 */
export const consoleSessionFields = {
  /** The last passkey, authenticator code or backup code proven on this session. Never a password. */
  secondFactorAt: { type: 'date', required: false, input: false },
  /** The console window opened (closes 8 hours later at most). */
  consoleOpenedAt: { type: 'date', required: false, input: false },
  /** The last console request (the window closes after 15 minutes without one). */
  consoleActiveAt: { type: 'date', required: false, input: false },
} as const

export const authSessionFields = {
  activeOrganizationId: { type: 'string', required: false, input: false },
  /**
   * True when "Keep me signed in" was ticked: 30 days, no idle limit. No defaultValue on
   * purpose: Better Auth applies defaults over the old session when it rotates one (turning
   * two-step on), which would quietly change a session's kind. The database defaults to false.
   */
  persistent: { type: 'boolean', required: false, input: false },
  lastActiveAt: { type: 'date', required: false, input: false },
  // The three below have no defaultValue either, for the same reason as `persistent`.
  /** Approximate place from the IP at sign-in ("Lekki, Lagos"); the full IP is never stored. */
  place: { type: 'string', required: false, input: false },
  /** "Confirm it's you": the password was proven at this moment (5-minute window). */
  reauthenticatedAt: { type: 'date', required: false, input: false },
  /** When the session last moved into its active organization; the two-step gate reads it. */
  organizationEnteredAt: { type: 'date', required: false, input: false },
  ...consoleSessionFields,
} as const

/** Better Auth's route prefix on the API and, through the proxy, on the web origin. */
export const AUTH_BASE_PATH = '/api/auth'
