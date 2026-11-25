import { index, pgEnum, pgTable, text, uuid } from 'drizzle-orm/pg-core'
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
