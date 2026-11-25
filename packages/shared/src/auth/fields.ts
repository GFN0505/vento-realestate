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

export const authSessionFields = {
  activeOrganizationId: { type: 'string', required: false, input: false },
  /**
   * True when "Keep me signed in" was ticked: 30 days, no idle limit. No defaultValue on
   * purpose: Better Auth applies defaults over the old session when it rotates one (turning
   * two-step on), which would quietly change a session's kind. The database defaults to false.
   */
  persistent: { type: 'boolean', required: false, input: false },
  lastActiveAt: { type: 'date', required: false, input: false },
} as const

/** Better Auth's route prefix on the API and, through the proxy, on the web origin. */
export const AUTH_BASE_PATH = '/api/auth'
