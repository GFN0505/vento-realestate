import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { id, timestamps, timestamptz } from '../columns'
import { organizations } from './organization'

// Identity tables, shaped as Better Auth 1.7 expects (plural, snake_case). They belong to a
// person, not an organization, so they have no organization_id (decision 0010).
// On a Better Auth upgrade, diff against `npx auth generate`; auth-schema.test.ts guards drift.

export const users = pgTable(
  'users',
  {
    id: id(),
    name: text().notNull(),
    email: text().notNull(),
    emailVerified: boolean().notNull().default(false),
    image: text(),
    twoFactorEnabled: boolean().notNull().default(false),
    companyName: text(),
    termsVersion: text(),
    termsAcceptedAt: timestamptz(),
    lastActiveOrganizationId: uuid().references(() => organizations.id, { onDelete: 'set null' }),
    twoStepSetupRequired: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('users_email_unique').on(t.email),
    check('users_email_lower_case', sql`${t.email} = lower(${t.email})`),
  ],
)

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    token: text().notNull(),
    expiresAt: timestamptz().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Masked when written ("102.89.34.x"); the full address is never stored. */
    ipAddress: text(),
    userAgent: text(),
    activeOrganizationId: uuid().references(() => organizations.id, { onDelete: 'set null' }),
    persistent: boolean().notNull().default(false),
    lastActiveAt: timestamptz().defaultNow().notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('sessions_token_unique').on(t.token),
    index('sessions_user_id_idx').on(t.userId),
    index('sessions_active_organization_id_idx').on(t.activeOrganizationId),
  ],
)

export const accounts = pgTable(
  'accounts',
  {
    id: id(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamptz(),
    refreshTokenExpiresAt: timestamptz(),
    scope: text(),
    password: text(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('accounts_provider_account_unique').on(t.providerId, t.accountId),
    index('accounts_user_id_idx').on(t.userId),
  ],
)

export const verifications = pgTable(
  'verifications',
  {
    id: id(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamptz().notNull(),
    ...timestamps,
  },
  (t) => [index('verifications_identifier_idx').on(t.identifier)],
)

export const twoFactors = pgTable(
  'two_factors',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    secret: text().notNull(),
    backupCodes: text().notNull(),
    verified: boolean().notNull().default(true),
    failedVerificationCount: integer().notNull().default(0),
    lockedUntil: timestamptz(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('two_factors_user_id_unique').on(t.userId),
    index('two_factors_secret_idx').on(t.secret),
  ],
)

export const rateLimits = pgTable(
  'rate_limits',
  {
    id: id(),
    key: text().notNull(),
    count: integer().notNull(),
    lastRequest: bigint({ mode: 'number' }).notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex('rate_limits_key_unique').on(t.key)],
)
