// Product defaults approved by the owner on 25 Nov 2026 (spec, "Owner's decisions").
// They are security policy, not statutory rules, so they live in code.

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** A session without "Keep me signed in" ends after this long without activity… */
export const SESSION_IDLE_MS = 30 * MINUTE
/** …or this long after sign-in, whichever comes first. */
export const SESSION_MAX_MS = 12 * HOUR
/** "Keep me signed in": counted from sign-in, not extended by use. */
export const PERSISTENT_SESSION_SECONDS = 30 * 24 * 60 * 60
/** Better Auth gives a "don't remember me" session exactly 24 h; anything longer was remembered. */
export const PERSISTENT_THRESHOLD_MS = 25 * HOUR
/** Write lastActiveAt at most this often, to avoid a write on every request. */
export const LAST_ACTIVE_WRITE_INTERVAL_MS = MINUTE

export const INVITATION_TTL_MS = 7 * DAY

export const PASSWORD_LOCK_THRESHOLD = 10
export const PASSWORD_LOCK_WINDOW_MS = 15 * MINUTE
export const TWO_STEP_LOCK_THRESHOLD = 5
export const SIGN_IN_LOCK_MS = 15 * MINUTE

export const VERIFICATION_TTL_SECONDS = 30 * 60
export const RESET_TOKEN_TTL_SECONDS = 30 * 60
export const VERIFICATION_RESEND_PER_MINUTE = 1
export const VERIFICATION_RESEND_PER_HOUR = 5

/** auth_attempts rows older than this are pruned when new ones are written. */
export const AUTH_ATTEMPT_RETENTION_MS = DAY
