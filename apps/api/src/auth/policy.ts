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
/** One resend per invitation per minute (spec, owner's decision 12). Enforced in the update. */
export const INVITATION_RESEND_INTERVAL_MS = MINUTE
/** A queued invitation email this old never went out (the process died after commit). */
export const INVITATION_QUEUED_STALE_MS = 10 * MINUTE

/** members.last_active_at is written at most this often per member (shown by day). */
export const MEMBER_ACTIVITY_WRITE_INTERVAL_MS = HOUR

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

/** "Confirm it's you" lasts this long on a session (spec decision 6). */
export const REAUTH_WINDOW_MS = 5 * MINUTE
/** A browser not seen for this long counts as new again ("new sign-in" alert). */
export const KNOWN_DEVICE_TTL_MS = 90 * DAY
/** The device cookie's lifetime: browsers cap cookies at 400 days. */
export const DEVICE_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60
/**
 * "Require two-step for everyone": people already signed in may carry on this long after it was
 * turned on (spec decision 5). Their next sign-in or switch into the organization ends it sooner.
 */
export const TWO_STEP_GRACE_MS = 7 * DAY
/** account.confirmPassword attempts per person per minute. */
export const CONFIRM_PASSWORD_PER_MINUTE = 10

// The Vento console (admin-console spec, owner's decision 6).
/** A passkey or code proven this recently opens the console without asking again. */
export const CONSOLE_PROOF_FRESH_MS = 5 * MINUTE
/** The console window closes after this long without a console request… */
export const CONSOLE_IDLE_MS = 15 * MINUTE
/** …or this long after it opened, whichever comes first. */
export const CONSOLE_MAX_MS = 8 * HOUR
/** platform_admins.last_console_at is written at most this often ("Last console activity"). */
export const CONSOLE_ADMIN_ACTIVITY_WRITE_MS = MINUTE
/** console.access.confirm attempts per person per minute, on top of the two-step lock. */
export const CONSOLE_CONFIRM_PER_MINUTE = 10
/** How long a console passkey challenge stays valid. */
export const CONSOLE_PASSKEY_CHALLENGE_MS = 2 * MINUTE
