import { index, pgEnum, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { id, timestamps, timestamptz } from '../columns'
import { users } from './auth'

export const authAttemptKind = pgEnum('auth_attempt_kind', [
  'password_failure',
  'verification_email',
  'password_reset_email',
])

/** Counts failures and resends per email for lockouts and resend limits. Pruned after 24 h. */
export const authAttempts = pgTable(
  'auth_attempts',
  {
    id: id(),
    kind: authAttemptKind().notNull(),
    /** Lower-case email. Kept even when no account exists, so locks don't reveal accounts. */
    subject: text().notNull(),
    ...timestamps,
  },
  (t) => [index('auth_attempts_kind_subject_idx').on(t.kind, t.subject, t.createdAt)],
)

export const signInLockReason = pgEnum('sign_in_lock_reason', ['password', 'two_step'])

export const signInLocks = pgTable(
  'sign_in_locks',
  {
    id: id(),
    email: text().notNull(),
    userId: uuid().references(() => users.id, { onDelete: 'cascade' }),
    reason: signInLockReason().notNull(),
    lockedUntil: timestamptz().notNull(),
    ...timestamps,
  },
  (t) => [index('sign_in_locks_email_idx').on(t.email, t.lockedUntil.desc())],
)

/** Hashes of recent passwords, so a reset can't reuse one of the last 5. */
export const passwordHistories = pgTable(
  'password_histories',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    passwordHash: text().notNull(),
    ...timestamps,
  },
  (t) => [index('password_histories_user_idx').on(t.userId, t.createdAt.desc())],
)

/**
 * Browsers that have signed in to this person's account, by a hash of Vento's random device
 * cookie (no fingerprinting). A sign-in from one not seen in 90 days sends the "new sign-in"
 * alert. Rows unseen for 90 days are pruned at the person's next sign-in.
 */
export const knownDevices = pgTable(
  'known_devices',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Hex SHA-256 of the cookie value; the cookie itself is never stored. */
    deviceHash: text().notNull(),
    firstSeenAt: timestamptz().defaultNow().notNull(),
    lastSeenAt: timestamptz().defaultNow().notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('known_devices_user_device_unique').on(t.userId, t.deviceHash),
    index('known_devices_user_last_seen_idx').on(t.userId, t.lastSeenAt),
  ],
)
