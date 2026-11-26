import { sql } from 'drizzle-orm'
import {
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
    /**
     * Set when someone else resets this person's two-step: sign-in is refused until they set a
     * new password through the emailed link, so a reset alone never opens the account.
     */
    passwordResetRequired: boolean().notNull().default(false),
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
    /** Approximate place from the IP at sign-in ("Lekki, Lagos"), decision 0020. */
    place: text(),
    /** "Confirm it's you": the password was proven at this moment (5-minute window). */
    reauthenticatedAt: timestamptz(),
    /**
     * When the session last moved into its active organization (sign-in, switch, invitation,
     * onboarding). The two-step gate tells "next sign-in or switch" from "already in" with it;
     * null reads as created_at.
     */
    organizationEnteredAt: timestamptz(),
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

/**
 * Better Auth passkey plugin's model `passkey` (decision 0019). A credential belongs to one
 * person, so `credential_id` is unique across Vento. At most 10 per person (trigger in
 * 0010_passkey_guards). `last_used_at` is Vento's, written by our after-hook.
 */
export const passkeys = pgTable(
  'passkeys',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text(),
    publicKey: text().notNull(),
    // Better Auth's field name; the column is named explicitly so casing can't make it credential_i_d.
    credentialID: text('credential_id').notNull(),
    counter: integer().notNull(),
    deviceType: text().notNull(),
    backedUp: boolean().notNull(),
    transports: text(),
    aaguid: text(),
    lastUsedAt: timestamptz(),
    ...timestamps,
  },
  (t) => [
    index('passkeys_user_id_idx').on(t.userId),
    uniqueIndex('passkeys_credential_id_unique').on(t.credentialID),
    check(
      'passkeys_name_length',
      sql`${t.name} is null or char_length(${t.name}) between 1 and 40`,
    ),
  ],
)
