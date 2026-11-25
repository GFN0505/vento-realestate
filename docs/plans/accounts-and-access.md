# Plan: Accounts and access (brick 2a)

- **Status:** approved by the owner on 25 Nov 2026 and built. Decision records 0010–0012 are accepted.
- **As built (differences from this plan):** the production email guard lives in `createMailer` (so migrations run in production); `AUTH_RATE_LIMIT` switches only per-IP limits, lockouts always apply; Better Auth's rate limiter uses memory storage (no IPs stored; several API instances will need Redis) and the `rate_limits` table was dropped; a two-step reset by someone else forces a new password by email (security review); members limited to some entities can only grant those entities; the common-password check also compares a password's base word; only owners are sent to onboarding; migration `0002_reset_required_drop_rate_limits` added.
- **Spec:** [docs/specs/accounts-and-access.md](../specs/accounts-and-access.md)
- Written by the architect agent on 25 Nov 2026, checked against Better Auth **1.7.28** (the current npm `latest`) and the code on branch `brick/02-accounts-and-access`.

## Summary (plain English)
This brick gives Vento its front door. A developer signs up, verifies their email, names their organization and first company (entity), and turns on two-step sign-in. Invited colleagues accept and get in within minutes. Every later request is checked on the server: who you are, which organization you're in, what your role allows, and which entities you can see. Better Auth handles identity: passwords, email verification, sessions, authenticator codes and backup codes. Vento owns its own tables for organizations, entities, roles, members and invitations. Better Auth's organization plugin can't do soft removal, entity limits, owner-only rules or same-transaction audit, and it would publish a second, unaudited API for changing access. Every access change writes a row to an append-only audit table that the database itself refuses to edit or delete. The sign-in, sign-up, verify, reset, invitation, onboarding and two-step screens are built from the approved boards on new design tokens (Inter and Poppins, violet action colour, 10px radius). A temporary "you're signed in" page stands in for the app until brick 3. One assumption needs the owner's sign-off before build: owning these tables means changing a line in `CLAUDE.md` and the wording of decision 0003 (see open question 1).

---

## 1. Summary (technical)
- **Better Auth 1.7.28** + `@better-auth/drizzle-adapter` 1.7.28. Plugins: **`twoFactor`** (TOTP, 10 backup codes, built-in per-account lockout set to 5 failures and 15 minutes) and **`emailOTP`**, used only to put a 6-digit code in the verification email. **No `organization` plugin** and **no `haveIBeenPwned` plugin**: that plugin fails closed when the service is down, and the spec wants it to fail open. We write a ~40-line policy instead.
- Better Auth's tables (users, sessions, accounts, verifications, two_factors, rate_limits) are **written by hand in Drizzle** with `uuid` primary keys defaulting to Postgres 18's native `uuidv7()` (`advanced.database.generateId: 'uuid'`, which leaves the id to the database on pg), plural names (`usePlural: true`) and snake_case through the existing `casing`.
- Mounted at **`/api/auth/*`** on the same Hono app (decision 0009). The Vite proxy gains `/api`.
- Session length (30 min idle / 12 h max, or 30 days with "keep me signed in") is **not native**. Better Auth only has sliding `expiresIn` + `updateAge`, and gives a "don't remember" session 24 h. We add `persistent` and `lastActiveAt` to sessions and enforce the policy in one function, `enforceSessionPolicy`, called before `/rpc` and `/api/auth`. The cookie cache is off, so a revoked session fails on its very next request.
- oRPC gets `authed` → `member` → `requirePermission(module, action)` middleware. Organization, member, permissions and entity limits come only from the session row and the database.
- `audit_events` is append-only through triggers. `recordAudit(tx, event)` runs inside the caller's transaction. Better Auth hooks write the sign-in, two-step and password events.

## 2. Domain model

```
User (Better Auth) 1─* Member *─1 Organization 1─* Entity
                       │  └─* MemberEntityLimit *─1 Entity      (none = all entities)
                       └─1 Role 1─* RolePermission (module × action)
Organization 1─* Role (9 system roles seeded per org; custom roles in brick 3)
Organization 1─* Invitation *─1 Role, *─* Entity (InvitationEntityLimit)
Organization 1─* AuditEvent (append-only)
User 1─* Session (activeOrganizationId), 1─0..1 TwoFactor, 1─* PasswordHistory
```

**Who owns what.** Organizations, entities, roles, members, invitations and audit events are organization-scoped (`organization_id NOT NULL`). Users, sessions, accounts, verifications, two_factors, rate_limits, auth_attempts, sign_in_locks and password_histories are **identity tables**: they belong to a person, not an organization, so they have no `organization_id`. Decision 0010 records this exemption from non-negotiable 1. No 2a record belongs to an entity; entities are what later ledgers point at.

**State machines**
```
Invitation:  pending ──accept──▶ accepted
             pending ──decline─▶ declined
             pending ──withdraw▶ withdrawn
             pending ──(expiresAt < now, read or touched)─▶ expired
             pending ──resend──▶ pending (new token, expiresAt = now + 7 days)
Member:      active ──remove──▶ removed   (terminal; re-inviting creates a new member row)
Entity:      active ──archive─▶ archived  (not the last active entity; warn about limited members)
Session:     live ──idle 30 min / 12 h max / 30 days / revoke / password reset / removal──▶ deleted
Sign-in lock: none ──10 bad passwords in 15 min, or 5 bad codes in a row──▶ locked (15 min) ──time──▶ none
```

**Invariants (database plus service)**
- One active membership per (organization, user): partial unique index.
- Every organization keeps at least one active owner. Service: lock the organization row `FOR UPDATE` and count owners. Database: a deferred constraint trigger on `members` UPDATE/DELETE.
- RC number unique per organization, including archived entities (normalised: upper case, spaces removed).
- Member and invitation entity limits, member roles and invitation roles always point into the **same organization**, enforced by composite foreign keys `(organization_id, x_id) → x(organization_id, id)` (decision 0012).
- One pending invitation per (organization, email).
- Audit events can never be updated, deleted or truncated (trigger).
- System roles (`is_system`) are immutable. Only owners can grant, change or remove the owner role. Nobody changes their own access.
- `status = 'archived'` exactly when `archived_at IS NOT NULL` (checks on entities and members).

## 3. Database

Shared column helpers in `apps/api/src/db/columns.ts`:
- `id = uuid().primaryKey().default(sql\`uuidv7()\`)`
- `timestamps = { createdAt: timestamptz.defaultNow().notNull(), updatedAt: timestamptz.defaultNow().notNull().$onUpdate(() => new Date()) }`

**Identity (`db/schema/auth.ts`; shapes required by Better Auth plus our fields)**
| Table | Columns (beyond id, timestamps) | Indexes / constraints |
|---|---|---|
| `users` | name, email (unique, lower case), email_verified bool, image null, two_factor_enabled bool default false, company_name null, terms_version null, terms_accepted_at null, last_active_organization_id uuid null → organizations (set null), two_step_setup_required bool default false | unique(email) |
| `sessions` | token unique, expires_at, user_id → users cascade, ip_address (**masked when written**), user_agent, active_organization_id uuid null → organizations set null, persistent bool not null default false, last_active_at timestamptz not null default now() | idx user_id, idx active_organization_id |
| `accounts` | account_id, provider_id, user_id → users cascade, password null, token columns as Better Auth expects | unique(provider_id, account_id), idx user_id |
| `verifications` | identifier, value, expires_at | idx identifier |
| `two_factors` | user_id → users cascade (unique), secret, backup_codes, verified bool, failed_verification_count int default 0, locked_until null | |
| `rate_limits` | key unique, count int, last_request bigint | |

**Sign-in security (`db/schema/auth-security.ts`)**
| Table | Columns | Notes |
|---|---|---|
| `auth_attempts` | kind enum `password_failure, verification_email, password_reset_email`; subject text (lower-case email) | idx (kind, subject, created_at). Counts failures and resends. Rows older than 24 h are pruned when new ones are written. |
| `sign_in_locks` | email, user_id null → users, reason enum `password, two_step`, locked_until | idx (email, locked_until desc) |
| `password_histories` | user_id → users cascade, password_hash | idx (user_id, created_at desc). The newest 5 are kept. |

**Organization (`db/schema/organization.ts`)**
| Table | Columns | Constraints |
|---|---|---|
| `organizations` | name (2–120), head_office_state text, financial_year_start_month smallint default 1, base_currency char(3) default 'NGN' | check month 1–12, check base_currency = 'NGN' |
| `entities` | organization_id → organizations **restrict**, name, type enum `holding, spv`, rc_number null, tin null, vat_registered bool default false, base_currency char(3) default 'NGN', status enum `active, archived` default active, archived_at null | unique(organization_id, id); partial unique (organization_id, rc_number) where rc_number is not null; idx (organization_id, status); status/archived_at check |

**Access (`db/schema/access.ts`)**
| Table | Columns | Constraints |
|---|---|---|
| `roles` | organization_id, key text null (`owner`…`viewer` for system roles), name, plural_name, description, is_system bool, requires_two_step bool | unique(organization_id, id); partial unique (organization_id, key) where key is not null; unique (organization_id, lower(name)) |
| `role_permissions` | organization_id, role_id, module enum `permission_module`, action enum `permission_action` | unique(role_id, module, action); FK (organization_id, role_id) → roles cascade |
| `members` | organization_id, user_id → users, role_id, status enum `active, removed`, joined_at, removed_at null | FK (organization_id, role_id) → roles; unique(organization_id, id); partial unique (organization_id, user_id) where status = 'active'; idx user_id, idx (organization_id, status) |
| `member_entity_limits` | organization_id, member_id, entity_id | unique(member_id, entity_id); FK (org, member_id) → members cascade; FK (org, entity_id) → entities restrict |
| `invitations` | organization_id, email (check = lower(email)), role_id, invited_by_user_id → users, status enum, token_hash unique, expires_at, last_sent_at, responded_at null, accepted_user_id null | FK (org, role_id) → roles; partial unique (organization_id, email) where status = 'pending'; idx (organization_id, status) |
| `invitation_entity_limits` | organization_id, invitation_id, entity_id | unique(invitation_id, entity_id); composite FKs as above |

Permission enums: modules `land, projects, sales, finance, facility, hr, compliance, documents, analytics, settings`; actions `view, create, edit, delete, export, approve`.

**Audit (`db/schema/audit.ts`)**: `audit_events`:
- organization_id → organizations **restrict**, NOT NULL
- actor_user_id null → users restrict
- actor_name (snapshot)
- action text (validated against the shared `auditAction` list; text rather than a pg enum because it grows every brick)
- target_type, target_id uuid null, target_label null
- before jsonb null, after jsonb null, metadata jsonb null
- request_id, ip_masked, user_agent_summary
- indexes: (org, created_at desc), (org, target_type, target_id), (org, actor_user_id, created_at desc)

**Migrations**
1. `pnpm db:generate --name accounts_and_access` creates all tables. Read the SQL: there must be no `text` ids, and `default uuidv7()` must be present.
2. `pnpm --filter @vento/api exec drizzle-kit generate --custom --name access_guards` is hand-written SQL for:
   - `audit_events_append_only()`: a `BEFORE UPDATE OR DELETE … FOR EACH ROW` trigger and a `BEFORE TRUNCATE … FOR EACH STATEMENT` trigger, both `RAISE EXCEPTION 'audit events are append-only'`.
   - `members_keep_an_owner()`: a `CONSTRAINT TRIGGER … AFTER UPDATE OR DELETE ON members DEFERRABLE INITIALLY DEFERRED`, which raises if the organization of the old row has no active member holding the `owner` role.

**Safety notes**
- The database is empty, so there are no backfills.
- `uuidv7()` needs Postgres 18. Docker and CI already run 18; production must too (note in the RUNBOOK).
- Tests can no longer TRUNCATE. `apps/api/src/test/global-setup.ts` drops and recreates the `public` and `drizzle` schemas in `vento_test`, then migrates.
- Never use `drizzle-kit push`. We do **not** use `npx auth generate/migrate`. On each Better Auth upgrade, generate into a scratch file and diff it against `db/schema/auth.ts` (also guarded by a test, §8).

## 4. Contract (packages/shared, oRPC, zod v4)

**Shared errors** (`common/errors.ts`, attached with `oc.errors()` on every contract):
- `UNAUTHORIZED {reason: 'signed_out' | 'session_expired'}`
- `FORBIDDEN {reason: 'permission' | 'two_step_setup_required' | 'own_access' | 'owner_only' | 'invitation_email_mismatch', askName?: string, askRole?: string}`
- `NOT_FOUND`
- `CONFLICT {reason: 'rc_number_taken' | 'last_owner' | 'last_entity' | 'already_member' | 'already_invited' | 'already_onboarded'}`

Messages are plain-English copy from the spec.

| Procedure | Input → Output | Errors |
|---|---|---|
| `account.me` | – → `{ user{id,name,email,twoFactorEnabled}, organization{id,name} \| null, member{id, role{id,key,name}, entityIds: id[] \| null, permissions: Record<module, action[]>} \| null, nextStep: 'onboarding_organization' \| 'onboarding_entity' \| 'two_step_setup' \| 'ready', twoStepRequired }` | UNAUTHORIZED |
| `account.passwordResetInfo` (public) | `{token}` → `{email}` | NOT_FOUND |
| `account.sessions.list` | pagination → `paginated({id, device, browser, ipMasked, lastActiveAt, isCurrent})` | |
| `account.sessions.revoke` | `{id}` → `{notice}` | NOT_FOUND (not mine) |
| `account.sessions.revokeOthers` | – → `{count, notice}` ("Signed out of 3 other devices") | |
| `onboarding.createOrganization` | `{name, headOfficeState, financialYearStartMonth}` → organization | CONFLICT already_onboarded |
| `onboarding.createFirstEntity` | `entityInput` → entity | CONFLICT already_onboarded / rc_number_taken |
| `organization.get` / `organization.update` | – / `{name?, headOfficeState?, financialYearStartMonth?}` → organization | FORBIDDEN |
| `entities.list` | pagination + `{status?}` → paginated(entity), **filtered by limits** | |
| `entities.get` / `entities.update` | `{id}` / `{id, …}` → entity | NOT_FOUND (other org or outside limits), CONFLICT rc_number_taken |
| `entities.create` | `entityInput` → entity | CONFLICT |
| `entities.archivePreview` | `{id}` → `{membersOnlyThisEntity: number, isLastActive: boolean}` | NOT_FOUND |
| `entities.archive` | `{id}` → entity | CONFLICT last_entity |
| `roles.list` | – → `role[]` with permissions, requiresTwoStep, canApprove modules (≤ 50 rows; still uses the `paginated` shape) | |
| `members.list` | pagination + `{status?}` → paginated(member with name, email, role, entities, twoFactorEnabled) | |
| `members.updateAccess` | `{memberId, roleId, entityIds: id[] \| null}` → `{member, notice}` | NOT_FOUND, FORBIDDEN own_access / owner_only, CONFLICT last_owner |
| `members.remove` | `{memberId}` → `{notice}` | same |
| `members.resetTwoStep` | `{memberId}` → `{notice}` | FORBIDDEN own_access / owner_only, NOT_FOUND |
| `invitations.list` | pagination + `{status?}` → paginated(invitation, with effective status) | |
| `invitations.create` | `{items: [{email, roleId}] (1–20), entityIds: id[] \| null}` → `{sent: number, notice}` | CONFLICT already_member / already_invited (named email), FORBIDDEN owner_only |
| `invitations.resend` / `invitations.withdraw` | `{id}` → `{notice}` | NOT_FOUND, CONFLICT (not pending) |
| `invitations.preview` (public) | `{token}` → `{status, email, organizationName, inviterName, roleName, entities: string[] \| 'all', canApprove: string[], twoStepRequired, expiresOn: isoDate, hasAccount}` | NOT_FOUND |
| `invitations.accept` (authed, any membership state) | `{token}` → `{nextStep}` | FORBIDDEN invitation_email_mismatch, CONFLICT expired/withdrawn |
| `invitations.acceptAsNewUser` (public) | `{token, name, password}` → `{nextStep}`, sets the session cookie | CONFLICT (account exists → sign in), BAD_REQUEST password rules |
| `invitations.decline` (public) | `{token}` → `{notice}` | NOT_FOUND |

Notes:
- Better Auth's own endpoints (sign-up, sign-in, verify, two-factor, reset) are **not** in the oRPC contract. The web calls them through the Better Auth client. Their error codes and the extra user fields are shared from `packages/shared/src/auth/` (`fields.ts`, `error-codes.ts`, `password-rules.ts`), so neither app redeclares them.
- **Disabled Better Auth paths** (`disabledPaths`): `/sign-in/email-otp`, `/email-otp/send-verification-otp`, `/email-otp/check-verification-otp`, `/email-otp/request-password-reset`, `/email-otp/reset-password`, `/forget-password/email-otp`, `/email-otp/request-email-change`, `/email-otp/change-email`, `/change-email`, `/delete-user`, `/list-sessions`, `/revoke-session`, `/revoke-sessions`, `/revoke-other-sessions`, `/two-factor/send-otp`, `/two-factor/verify-otp`. They are either passwordless back doors that skip two-step, or unaudited duplicates of our session procedures.
- `notice` strings carry the spec's toast copy, as the spec asks ("returned by the API now").

## 5. Permissions

**Default table** (single source: `packages/shared/src/access/default-roles.ts`; seeded per organization by `syncSystemRoles(tx, organizationId)`; also the expected result in tests):
- Full = view, create, edit, delete, export, approve. Edit = view, create, edit, export. View = view. "+ approve" adds approve.
- Two-step required: owner, admin, finance, **hr** (spec open question 4, recommended; it's a `requires_two_step` column, so changing it is a data change).

| Procedure | Check | Who passes by default |
|---|---|---|
| `account.*`, `invitations.accept` | `authed` (signed in, policy OK) | anyone signed in |
| `invitations.preview / acceptAsNewUser / decline`, `account.passwordResetInfo` | public, token-gated, rate-limited | – |
| `onboarding.*` | `memberPendingTwoStep` + service rules (no org yet / owner with 0 entities) | the onboarding owner |
| `organization.get`, `entities.list/get` | `member` (any role), entities filtered by limits | all nine roles |
| `organization.update`, `entities.update` | `settings.edit` | owner, admin |
| `entities.create` | `settings.create` | owner, admin |
| `entities.archive/archivePreview` | `settings.delete` | owner, admin |
| `roles.list`, `members.list`, `invitations.list` | `settings.view` | owner, admin |
| `members.updateAccess`, `members.resetTwoStep` | `settings.edit` + owner-only and own-access rules | owner, admin (admin not for owners) |
| `members.remove`, `invitations.withdraw` | `settings.delete` | owner, admin |
| `invitations.create/resend` | `settings.create` (+ owner-only for the owner role) | owner, admin |

**Request context** (`apps/api/src/access/`):
1. **`authed`** calls `auth.api.getSession({ headers })` (cookie cache off), runs `enforceSessionPolicy`, and adds `{ session, user }`. Otherwise it throws `UNAUTHORIZED {reason}`.
2. **`member`** resolves the organization from `session.activeOrganizationId`. If that is null, or the membership is no longer active, it falls back to the user's most recent active membership and writes the choice back to the session. It then loads, in **one query** (members ⨝ roles, `array_agg` of permissions and entity limits), `{ organizationId, member: { id, roleId, roleKey, permissions: Set<'module.action'>, entityIds: string[] | null, requiresTwoStep } }`. If the role requires two-step, or `two_step_setup_required` is set, and two-step isn't on, it throws `FORBIDDEN two_step_setup_required`. `memberPendingTwoStep` skips only that check and is used by onboarding.
3. **`requirePermission(module, action, { doing: 'invite people' })`** throws `FORBIDDEN {reason: 'permission', askName, askRole}` with the message "Only owners and admins can invite people. Ask Olumide Bankole (owner)." `whoCanGrant()` lists the roles that hold the permission (plural names) and picks one active member, preferring owners. It runs only on the error path.
4. **NOT_FOUND rule:** every service lookup filters on `organization_id = ctx.organizationId` **and** `entityScope(ctx, table.entityId)` (`inArray` when limited). A missing row, another organization's row and a row outside the limits all return NOT_FOUND. Services never return FORBIDDEN for a specific id.
5. **No caching** of member or permissions, so role and limit changes apply on the next request. Expected cost: Better Auth session lookup (1–2 queries) + 1 member query, within the 200 ms p95 budget.

## 6. Better Auth configuration (`apps/api/src/auth/auth.ts`, `createAuth({ db, mailer })`)

- `basePath: '/api/auth'`, `baseURL: env.WEB_ORIGIN`, `trustedOrigins: [env.WEB_ORIGIN]`, `secret: env.BETTER_AUTH_SECRET`.
- `database: drizzleAdapter(db, { provider: 'pg', schema, usePlural: true, transaction: true })`, `advanced.database.generateId: 'uuid'`.
- `advanced`: `cookiePrefix: 'vento'`, `useSecureCookies: env.NODE_ENV === 'production'`, default `httpOnly` and `SameSite=Lax`, `ipAddress.ipAddressHeaders: ['x-vento-client-ip']`. That header is set by our Hono middleware from the socket, or from `TRUSTED_IP_HEADER` when behind a proxy, and is always stripped from incoming requests.
- `emailAndPassword`: `enabled`, `requireEmailVerification: true`, `minPasswordLength: 12`, `maxPasswordLength: 128`, `resetPasswordTokenExpiresIn: 1800`, `revokeSessionsOnPasswordReset: true`, `sendResetPassword` → mailer, `onPasswordReset` → audit + alert.
- `emailVerification`: `sendOnSignUp: true`, `sendOnSignIn: true`, `expiresIn: 1800`, `autoSignInAfterVerification: true`, `sendVerificationEmail({user, url})`. This calls `auth.api.createVerificationOTP({ body: { email, type: 'email-verification' } })` so **one** email carries both the link and the code.
- `plugins`:
  - `emailOTP({ otpLength: 6, expiresIn: 1800, allowedAttempts: 5, sendVerificationOnSignUp: false, storeOTP: 'encrypted' })`. Code verification goes through `/email-otp/verify-email`.
  - `twoFactor({ issuer: 'Vento', backupCodeOptions: { amount: 10, length: 10 }, accountLockout: { maxFailedAttempts: 5, durationSeconds: 900 }, twoFactorCookieMaxAge: 600 })`. "Trust this device" is never sent by the client.
- `session`: `expiresIn: 30 days`, `disableSessionRefresh: true` (30 days counts from sign-in, not sliding), `cookieCache: { enabled: false }`, `additionalFields`: `activeOrganizationId`, `persistent`, `lastActiveAt` (all `input: false`).
- `user.additionalFields`: `companyName` (input), `termsVersion` (input, must equal `CURRENT_TERMS_VERSION`), `termsAcceptedAt`, `lastActiveOrganizationId`, `twoStepSetupRequired` (`input: false`).
- `rateLimit`: `enabled: env.AUTH_RATE_LIMIT === 'on'`, `storage: 'database'`. Custom rules: `/sign-in/email` 10 per 60 s per IP, `/sign-up/email` 5/60 s, `/request-password-reset` 3/60 s, `/two-factor/*` keeps the plugin default of 3 per 10 s.
- `databaseHooks`:
  - `session.create.before`: `persistent = expiresAt − now > 25 h`. Better Auth gives a "don't remember" session exactly 24 h, and a test pins that. When not persistent, set `expiresAt = now + 12 h`. Also set `lastActiveAt = now`, mask `ipAddress`, and set `activeOrganizationId = user.lastActiveOrganizationId`.
  - `user.create.before`: stamp `termsAcceptedAt`.
  - `account.create.after` and `account.update.after`, when the password changed: insert into `password_histories` and prune to 5.
- `hooks.before` (`createAuthMiddleware`):
  - `/sign-up/email`, `/reset-password`, `/change-password`: `checkPasswordPolicy` (12+ characters, a digit, not in the bundled common list, then HIBP k-anonymity with a 2 s timeout that fails open and logs a warning). Reset and change also check the last 5 hashes with `ctx.context.password.verify`. For reset, the user is resolved from `reset-password:${token}`.
  - `/sign-up/email`: also requires the terms version.
  - `/sign-in/email`: refuse while a `sign_in_locks` row is active for the email: `429 {code: 'ACCOUNT_LOCKED', lockedUntil}`.
  - `/send-verification-email`: at most 1 per minute and 5 per hour per email, via `auth_attempts`.
  - `/two-factor/disable`: refused when any active membership's role requires two-step.
- `hooks.after`:
  - `/sign-in/email`: on `INVALID_EMAIL_OR_PASSWORD`, add an `auth_attempts` row. At 10 in 15 min, write a lock, an audit `auth.locked_out` and an alert email. On success without a challenge, clear the attempts and write audit `auth.signed_in`.
  - `/two-factor/verify-totp` and `/verify-backup-code`: resolve the pending user from the signed `two_factor` cookie (same calls the plugin makes). Failure → `auth.two_step_failed`. If `two_factors.locked_until` is now set → lock row, audit, alert, and rethrow as `ACCOUNT_LOCKED` with `lockedUntil`. Success → `auth.signed_in`. A backup code also triggers `two_step.backup_code_used` and the "(9 left)" email, using `auth.api.viewBackupCodes` to count.
  - `/two-factor/enable` and setup verification → `two_step.enabled`, which also clears `two_step_setup_required`. `/two-factor/disable` → `two_step.disabled` + alert. `/two-factor/generate-backup-codes` → `two_step.backup_codes_regenerated`. `/change-password` → `account.password_changed` + alert.

**Session policy** (`auth/session-policy.ts`):
- Non-persistent sessions end when `now − lastActiveAt > 30 min` or `now − createdAt > 12 h`. The row is deleted and the caller gets `UNAUTHORIZED session_expired`.
- Otherwise `lastActiveAt` is written only if it is more than 60 s old, which avoids a write per request.
- It runs in the `authed` middleware, and in a Hono middleware ahead of `/api/auth/*` when a session cookie is present, so Better Auth never serves an idle-expired session.
- The limits are named constants in `auth/policy.ts` along with the 7-day invitation expiry and the lockout counts. They are product defaults, not statutory rules.

**Request scope**: `lib/request-scope.ts` uses `AsyncLocalStorage<{ requestId, ipMasked, userAgentSummary }>`, set by a Hono middleware for every request. `recordAudit` and the Better Auth hooks read it, so audit rows carry the request id even for Better Auth endpoints.

## 7. Audit, email, seed

**`recordAudit(tx, { organizationId, action, target, before?, after?, metadata?, actor? })`** (`modules/audit/audit.service.ts`):
- The actor defaults to the context user; `actor_name` is a snapshot.
- `redact()` drops any key matching `/password|secret|token|code|backup/i` before before/after are stored.
- IPs are masked: IPv4 keeps /24 (`102.89.34.x`), IPv6 keeps /48.
- Services call it **inside their transaction**, so the event commits or rolls back with the change.
- **Account events** (sign-ins, failures, locks, password and two-step changes) are fanned out: one row per organization where the person is an active member at that moment. Owners of each organization see them (brick 4 page) and `organization_id` stays NOT NULL. If the person has no membership yet (sign-up to onboarding), only a structured log line is written, with no personal data.
- Actions are a shared list (`auditAction` in `packages/shared/src/audit/actions.ts`): `organization.created/updated`, `entity.created/updated/archived`, `invitation.sent/resent/withdrawn/accepted/declined`, `member.access_changed/removed`, `two_step.enabled/disabled/reset/backup_codes_regenerated/backup_code_used`, `account.password_changed/password_reset`, `auth.signed_in/sign_in_failed/two_step_failed/locked_out`, `session.revoked/revoked_others/revoked_by_removal`.

**Email** (`apps/api/src/email/`):
- `Mailer { send(msg: { to, subject, html, text, tag }) }`.
- `dev` transport: prints to, subject and the first link or code to the console, and writes the full JSON to `EMAIL_DEV_DIR` (`.mail/`, git-ignored) so Playwright can read it.
- `memory` transport for Vitest.
- The env schema **refuses to start in production without a real transport**. A provider (Postmark or Resend) later means one new file in `transports/` and an env value.
- Templates are plain TS functions returning `{subject, html, text}` with `escapeHtml` on every interpolated value: 600 px single column, light only, following EmailVerify, EmailReset and EmailInvite. The security alert follows the EmailReset layout (pattern). Times are formatted in `Africa/Lagos` ("10:45", "25 Nov 2026").
- Emails are sent **after commit**: services return the messages, routers send them. A send failure is logged and does not undo the change; the user can resend.

**Seed** (`pnpm db:seed` → `apps/api/src/db/seed.ts`):
- Refuses when `NODE_ENV=production`. Idempotent upserts keyed on email, organization name and RC number.
- Creates Vento Homes Ltd (Lagos, January), its three entities (Victoria Gardens Dev. Ltd holding, Parkview Residences SPV Ltd spv, Lekki Pearl Estates Ltd spv), the system roles, and these members:
  - Olumide Bankole: owner
  - Ngozi Adeyemi: land & legal
  - Kunle Ojo: project manager, limited to Parkview
  - Grace Umeh: sales
  - Aisha Bello: finance
  - Kemi Adebayo: HR
  - Ope Martins: facility
  - Tunde Ola: viewer (open question 3)
- Plus two invitations (one pending, one expired) for trying the accept screen.
- Passwords come from `SEED_PASSWORD`, hashed with `hashPassword` from `better-auth/crypto`. Emails are `@ventohomes.ng` and verified. Two-step is not enrolled, so required roles go through setup on first sign-in.

## 8. UI

**Foundations**
- **Tokens:** `apps/web/src/styles.css` gets `@import "tailwindcss"; @import "tw-animate-css";`, `@custom-variant dark (&:where(.dark, .dark *))`, `:root` and `.dark` CSS variables with every value from DESIGN-NOTES (background, card, muted, border, foreground, muted-foreground, brand, primary #5B5CE0, primary-foreground, ring = brand, destructive = rose, sidebar, selected-*, and status-{emerald,amber,blue,rose,slate} with `-fg/-bg/-border`), `--radius: 0.625rem`, and `@theme inline` mapping them to Tailwind colours plus `--font-sans: 'Inter Variable'` and `--font-heading: 'Poppins'`.
- **Theme:** an inline script in `index.html` sets `.dark` from `prefers-color-scheme` before paint. The toggle arrives in brick 3.
- **Fonts:** `@fontsource-variable/inter` and `@fontsource/poppins` (latin 500 and 600 only), imported in `main.tsx`, `font-display: swap`.
- **shadcn/ui** (CLI 4.x, Tailwind v4, `radix-ui`): `components.json`, `lib/utils.ts` (`cn`). Only these are added: button, input, label, checkbox, select, radio-group, card, alert, dialog, sonner, input-otp, field. New dependencies: `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css`, `sonner`, `input-otp`, `lucide-react`, `react-hook-form`, `@hookform/resolvers`, `better-auth` (client), and `uqr` (QR as SVG, about 3 KB, lazy-loaded on the setup route only, because the TOTP URI must not leave the browser).
- **App components** (`components/auth/`): `AuthLayout` (navy brand panel, hidden below `lg`, plus form card; footer "© 2026 Vento · Privacy · Terms · Data held in Nigeria"), `CodeInput` (wraps shadcn InputOTP; 6 boxes; paste; `autocomplete="one-time-code"`; rose error state), `PasswordInput` (show/hide), `PasswordRules` (live ticks for length and number; "not common or leaked" and "different from your last 5" tick from server error codes), `FormAlert`, `BackupCodes` (Download .txt, Copy, required "I've saved my backup codes" tick), `TotpQr`. Plus `components/session-expired-dialog.tsx`.

**Routes (TanStack file-based)**
| Route | File | Board(s) | Design exists? |
|---|---|---|---|
| `/sign-in` (password, then two-step in the same route) | `routes/_auth/sign-in.tsx` | SignIn, SignIn2FA (+ Mobile, Dark, MobileDark) | yes; departures logged |
| `/sign-up` | `routes/_auth/sign-up.tsx` | SignUp ×4 | yes |
| `/verify-email` (`?email=`, `?error=`) | `routes/_auth/verify-email.tsx` | VerifyEmail ×4 | yes |
| `/forgot-password` | `routes/_auth/forgot-password.tsx` | ForgotPassword ×4 | yes |
| `/reset-password?token=` | `routes/_auth/reset-password.tsx` | ResetPassword ×4 | yes; the "sign out others" tickbox is removed |
| `/accept-invitation/$token` | `routes/_auth/accept-invitation.$token.tsx` | AcceptInvite ×4 | yes |
| `/onboarding` (`?step=organization\|entity`, server decides) | `routes/_app/onboarding.tsx` | Onboarding, OnboardingMobile, OnboardingMobileDark | partly: no desktop dark board, built from tokens |
| `/two-step/setup` | `routes/_app/two-step.setup.tsx` | SecuritySettings (two-factor panel) inside AuthLayout | partly: pattern |
| `/` temporary signed-in page | `routes/_app/index.tsx` | none (pattern, removed in brick 3) | no |
| Session expired | `SessionExpiredDialog` in `__root.tsx` | SessionExpired ×4 (dialog over the current page, no shell yet) | yes |
| `/status` (the brick 1 health page, moved) | `routes/status.tsx` | none | – |

**Guards and states**
- **`_auth.tsx`**: layout only. Its `beforeLoad` sends an already-signed-in user whose `nextStep` is `ready` to `/`. Accept-invitation is exempt.
- **`_app.tsx`**: `beforeLoad` runs `ensureQueryData(orpc.account.me)`. `UNAUTHORIZED` redirects to `/sign-in?redirect=<path>`. Then it routes by `nextStep` to `/onboarding` or `/two-step/setup`. `redirect` passes `safeRedirect()`: same-origin paths only, no `//`.
- **Better Auth client** (`lib/auth-client.ts`): `createAuthClient({ basePath: '/api/auth', plugins: [twoFactorClient(), emailOTPClient(), inferAdditionalFields(sharedUserFields)] })`. Used for sign-up, sign-in, verify, two-factor and reset. **Never** `useSession` for guards; `account.me` is the single source.
- **Session expired:** the `QueryCache`/`MutationCache` `onError` in `lib/query-client.ts` opens the dialog on `UNAUTHORIZED session_expired`. The page underneath stays mounted, so form input survives. Signing in again (password, then code) closes the dialog and retries. "Sign in as someone else" goes to `/sign-in`.
- **Copy:** every string comes from the spec's UI copy table. Code errors map in `lib/auth-errors.ts`. Lock times show in WAT.
- **Mobile:** single column at 375 px, 44 px targets, sticky primary button.

**SCREENS.md:** the spec already added the rows. Mark them `built` when done; mark the temporary page and `/status` as not listed. **CHANGES.md:** log the spec's departure table, plus:
1. The invitation link carries a token, not the invitation id.
2. The two-step check is a step inside `/sign-in`.
3. Session expired is a dialog without the shell.
4. Onboarding has a desktop dark variant built from tokens.

## 9. Files

**packages/shared/src**
- `common/errors.ts`: shared oRPC error map and reasons
- `common/nigeria.ts`: 36 states + FCT, month list
- `common/index.ts`: export the above
- `auth/fields.ts`: Better Auth additional user fields (shared by server config and client inference)
- `auth/error-codes.ts`: password and lock error codes
- `auth/password-rules.ts` + `.test.ts`: length/number rules and `CURRENT_TERMS_VERSION`
- `access/permissions.ts`: module and action enums, levels
- `access/default-roles.ts` + `.test.ts`: the nine roles, plural names, two-step flags, permission table
- `access/schema.ts`: role, member, invitation, preview schemas
- `access/contract.ts`: roles, members, invitations contracts
- `organization/schema.ts` + `.test.ts`: organization and entity schemas, RC/TIN normalise and warn helpers
- `organization/contract.ts`: organization, entities, onboarding
- `account/schema.ts`, `account/contract.ts`: me, sessions, passwordResetInfo
- `audit/actions.ts`: `auditAction` list
- `contract.ts`, `index.ts`: register the new contracts

**apps/api**
- `package.json`: add `better-auth`, `@better-auth/drizzle-adapter`; script `db:seed`
- `src/env.ts`: new vars (§12) + production email guard
- `src/context.ts`: `BaseContext` adds `headers`, `resHeaders`
- `src/orpc.ts`: `os`, `authed`, `member`, `memberPendingTwoStep` exports
- `src/app.ts`: request-scope and client-IP middleware, `/api/auth/*` mount with session policy and body limit, `ResponseHeadersPlugin` on the RPC handler, `createAuth` injection
- `src/router.ts`: register account, onboarding, organization, entities, roles, members, invitations
- `src/lib/request-scope.ts`, `src/lib/client-ip.ts` (+ `.test.ts`)
- `src/db/columns.ts`; `src/db/schema/{auth,auth-security,organization,access,audit}.ts`; `src/db/schema/index.ts`
- `src/db/seed.ts`
- `drizzle/0000_accounts_and_access.sql` (generated), `drizzle/0001_access_guards.sql` (custom)
- `src/auth/auth.ts`: `createAuth`
- `src/auth/policy.ts`: named limits
- `src/auth/session-policy.ts` + `.test.ts`
- `src/auth/password-policy.ts` + `.test.ts`, `src/auth/common-passwords.ts` (top 10k list, MIT SecLists, attribution)
- `src/auth/hooks/{sign-in-guard,two-step-guard,password-history,audit-hooks}.ts`
- `src/auth/auth-schema.test.ts`: compares Better Auth's expected fields with our tables
- `src/access/{context,middleware,who-can-grant,entity-scope,system-roles}.ts` + tests
- `src/email/{mailer,escape}.ts`, `src/email/transports/{dev,memory}.ts`, `src/email/templates/{layout,verify-email,reset-password,invitation,security-alert}.ts` + `templates.test.ts`
- `src/modules/audit/audit.service.ts` + `.test.ts`
- `src/modules/{account,onboarding,organization,entities,roles,members,invitations}/<m>.{service,router}.ts` + `<m>.service.test.ts`
- `src/test/{db,factories,auth-client}.ts`: rollback helper, factories, signed-in HTTP helper
- `src/test/global-setup.ts`: drop and recreate schemas, then migrate
- `src/test/isolation.test.ts`, `src/test/permissions-matrix.test.ts`, `src/test/procedure-guard.test.ts`
- `src/test/e2e-fixtures.ts`: CLI for Playwright fixtures (2FA user, invitation token)
- `tsdown.config.ts`: add `src/db/seed.ts` entry

**apps/web**
- `package.json`: dependencies listed in §8; dev `@better-auth/utils` (TOTP in e2e)
- `vite.config.ts`: proxy `/api`
- `index.html`: theme script
- `components.json`
- `src/styles.css`: tokens
- `src/main.tsx`: fonts, Toaster
- `src/lib/{auth-client,auth-errors,safe-redirect,utils}.ts` (+ `safe-redirect.test.ts`)
- `src/lib/query-client.ts`: 401 handling
- `src/components/ui/*` (12 shadcn files)
- `src/components/auth/{auth-layout,code-input,password-input,password-rules,form-alert,backup-codes,totp-qr}.tsx` + `code-input.test.tsx`, `password-rules.test.tsx`
- `src/components/session-expired-dialog.tsx`
- `src/routes/__root.tsx`, `src/routes/_auth.tsx`, `src/routes/_auth/*.tsx` (6), `src/routes/_app.tsx`, `src/routes/_app/{index,onboarding,two-step.setup}.tsx`, `src/routes/status.tsx`
- Delete `src/routes/index.tsx`; move `system-status.tsx` to the status route
- `e2e/support/{mailbox,fixtures,totp}.ts`
- `e2e/onboarding/new-organization.spec.ts`, `e2e/auth/sign-in.spec.ts`, `e2e/auth/accept-invitation.spec.ts`
- `e2e/smoke.spec.ts`: sign-in page renders, `/health` ok

**Root and docs**
- `.env.example`, `.gitignore` (`.mail/`), `turbo.json` (env passthrough), `.github/workflows/ci.yml` (placeholder secret, `AUTH_RATE_LIMIT=off`, `PWNED_PASSWORDS_CHECK=off`)
- `docs/ARCHITECTURE.md`: auth in the request flow, identity tables
- `CLAUDE.md`: stack line, **owner edits** after approving 0010
- `.claude/skills/add-module/SKILL.md`: `uuid` ids with `uuidv7()` default, `organizationId: uuid()`, composite FKs, `member` + `requirePermission('sales','view')` (the skill says `read`; DOMAIN says `view`)
- Docs listed in §11

## 10. Tests

**Pattern**
- `withRollback(fn)` opens a transaction, runs `fn(tx)`, then throws a sentinel to roll back. Service tests build context with `contextFor(member)`.
- HTTP auth-flow tests (`createApp({ db, mailer: memoryMailer })` + `app.request`, cookie jar helper) run on **committed** data with unique emails, because Better Auth manages its own writes. The schema is recreated each run.
- Factories: `createUser({ twoFactor?, password? })`, `createOrganization({ owner? })` (seeds system roles), `createEntity`, `createMember(org, { role, entityIds? })`, `createInvitation(org, { role, status?, expiresAt? }) → { invitation, token }`.

**By acceptance-criteria group**
| Group | Cases |
|---|---|
| Sign up and verify | Rejects short / no-digit / common passwords (code per rule); HIBP mocked as breached → refused; HIBP down → accepted; terms version recorded; one email carries a link + 6-digit code; expired link → error redirect; resend limited to 1/min and 5/hour; unverified sign-in → EMAIL_NOT_VERIFIED |
| Onboarding | Org + owner + nine roles created atomically (failure injected → nothing remains); resume at entity step; RC/TIN warnings don't block; duplicate RC refused with entity name; second `createOrganization` → CONFLICT |
| Sign in and two-step | Same error for wrong email and wrong password; challenge always after password when enabled (also after reset); forced setup → `FORBIDDEN two_step_setup_required` on member procedures and `nextStep = two_step_setup`; backup code works once and sends the "(9 left)" email; a required role can't disable |
| Lockout | 5 bad codes → 429 with `lockedUntil`, lock row, audit, one email; 10 bad passwords in 15 min → same; locked account refuses a correct password and code; success resets the counter; unknown email also locks (no enumeration) |
| Reset | Same reply for unknown email; token works once, valid 30 min; last-5 reuse refused; other sessions deleted; alert sent |
| Sessions | Non-persistent: refused after 31 min idle and after 12 h; persistent: 30 days; `lastActiveAt` throttled; revoked session's next request → 401; list shows masked IP and the current device; revoke someone else's session id → NOT_FOUND |
| Invitations | Batch of 20 (21 refused); email names org, inviter, role, entities, expiry; expired after 7 days with spec copy; resend rotates token (old → NOT_FOUND) and gives a fresh 7 days; withdrawn status shown; already-member refused with named email; admin can't invite owner; existing user accepts and belongs to both; wrong signed-in email → mismatch; `canApprove` listed |
| Members | Role change applies on the next request (same session); own access refused; last owner can't be removed, demoted or leave (service), **and** a raw SQL update is rejected by the deferred trigger; removal → status `removed`, sessions in that org deleted, audit kept, re-invite works; two-step reset rules (owner for anyone, admin not for owners, not self) and alert |
| Permissions matrix | For each of the nine roles × each Settings procedure, the outcome equals `default-roles.ts`; the FORBIDDEN message names roles and a person |
| Limits | Kunle lists only Parkview; `get` on Victoria Gardens → NOT_FOUND, same as a random id; archive preview counts members limited to that entity only; last active entity can't be archived |
| Isolation | Table-driven: every id-taking procedure called with another organization's ids → NOT_FOUND and no rows changed; organization never read from input (an `organizationId` in the payload is rejected by zod `strict`) |
| Procedure guard | Walks the router: every procedure not on the public allow-list returns UNAUTHORIZED anonymously |
| Audit | Each listed action writes one event with before → after; UPDATE, DELETE and TRUNCATE raise; no password, code, secret or full IP in any event (scan the JSON); account events fanned out to each organization; rollback of the service rolls back the event |
| Better Auth contract | `auth-schema.test.ts` (our columns ⊇ Better Auth's fields); a non-persistent session gets 24 h from Better Auth (pins the assumption behind `persistent`) |
| Web components | PasswordRules ticks; CodeInput paste and error state; safeRedirect rejects `//evil.com` and absolute URLs |

**Playwright** (desktop and mobile projects)
- `onboarding/new-organization.spec.ts`: sign up → read code from `.mail/` → onboarding steps 1–2 → forced two-step setup (QR key + TOTP) → backup codes ticked → signed-in page.
- `auth/sign-in.spec.ts`: fixture user with 2FA → wrong code shows rose state → correct code → signed in; "Sign out everywhere".
- `auth/accept-invitation.spec.ts`: fixture invitation token → new user name and password → two-step setup → signed-in page as Finance.

## 11. Build order

1. **Shared first (half a day, blocks both tracks):** errors, enums, default roles table, schemas and contracts, auth fields and error codes.
2. **In parallel:**
   - **Backend A:** columns + schema + migrations + global setup → `createAuth`, mount, request scope, session policy → access middleware + audit → services (onboarding, entities, members, invitations, account) → Better Auth hooks (locks, history, alerts) → email → seed → tests.
   - **Frontend B:** tokens, fonts, shadcn init → AuthLayout, CodeInput, PasswordRules, BackupCodes → static screens from the boards (light, dark, 375 px) → wire to the Better Auth client and oRPC once A's mount and `account.me` land (about day 3) → guards, session-expired dialog.
3. **Then:** e2e fixtures CLI (needs A's factories) → Playwright journeys → docs.

## 12. Environment (`.env.example`)
```
# Better Auth signing secret, 32+ random chars: openssl rand -base64 32 (never commit a real one)
BETTER_AUTH_SECRET=
# dev = console + files in EMAIL_DEV_DIR; memory = tests only. Production refuses to start until a provider exists.
EMAIL_TRANSPORT=dev
EMAIL_FROM="Vento <no-reply@localhost>"
EMAIL_DEV_DIR=.mail
# on | off. Off only in CI/e2e.
AUTH_RATE_LIMIT=on
# on | off. Breached-password check (Have I Been Pwned, k-anonymity). Off in tests.
PWNED_PASSWORDS_CHECK=on
# Header holding the client IP when behind a trusted proxy (e.g. x-forwarded-for). Empty = socket address.
TRUSTED_IP_HEADER=
# Password for seeded demo users (pnpm db:seed, development only)
SEED_PASSWORD=
```

## 13. Docs to change (the implementer commits these)
- **Journeys:**
  - J-ONB-01: steps 1–5 → `built`, test path.
  - J-ONB-02: step 4 → `built`; invitation link carries a token.
  - J-ONB-04: session expired is a dialog that also asks for the code; two-step turn-off asks for the password in 2a.
  - Update the `README.md` index statuses.
- **DOMAIN.md:**
  - Add **System role** (built-in, can't be edited; copy to customise in brick 3).
  - Add **Sign-in lock** (`locked → none` after 15 min; from 10 bad passwords or 5 bad codes).
  - Under **Audit event**: account events are recorded once per organization the person belongs to.
  - Once approved, the rules section: 7-day invitations, session lengths, lockouts, roles requiring two-step.
- **SCREENS.md / CHANGES.md:** as §8.
- **Help:** `docs/help/set-up-your-organization.md`, `sign-in-and-two-step.md`, `join-your-team.md`.
- **CHANGELOG:** "Sign up, verify your email, set up your organization and first company, sign in with two-step, reset your password, and accept an invitation."
- **ARCHITECTURE.md:** auth mount, middleware chain, identity tables, schema recreated in tests.

### Decision record 0010
```
# 0010 · Better Auth for identity; organizations and access are ours

- **Date:** 2026-11-25
- **Status:** proposed

## Context
Brick 2a needs sign-in, two-step, sessions, invitations, roles stored as data, entity limits, soft removal of members, owner-only rules, and an audit event in the same transaction as every access change. Better Auth's organization plugin stores members without a status (removal deletes the row), keeps roles as text with its own permission model, has no entity limits, and exposes its own /api/auth/organization/* endpoints that would change access outside our audited, permission-checked services.

## Decision
Better Auth (1.7) owns identity only: users, accounts, sessions, verifications, two-factor and rate limits, with the twoFactor and emailOTP plugins. Vento owns organizations, entities, roles, role permissions, members, invitations and their limits in its own Drizzle tables, served by oRPC procedures behind requirePermission. Better Auth's tables are written by hand in Drizzle with uuid ids (Postgres uuidv7()), plural snake_case names. These identity tables belong to a person, not an organization, so they carry no organization_id; every other domain table still does. The active organization is a field on our session row. Unused or unaudited Better Auth endpoints are switched off with disabledPaths.

## Consequences
- One API surface for access, typed by the shared contract, audited in the same transaction.
- Brick 3 custom roles and organization switching need no schema change.
- We maintain the Better Auth table definitions ourselves and diff them against `npx auth generate` on every upgrade (guarded by a test).
- Hooks rely on a few Better Auth internals (two-factor cookie, reset token lookup); upgrades must run the auth test suite.
- CLAUDE.md's stack line and decision 0003's "(Better Auth organization)" now mean "our organization table"; the meaning of 0003 is unchanged.

## Alternatives considered
- Organization plugin with extra fields and its endpoints disabled: keeps its tables and constraints but none of its value, and splits access logic across two models.
- Organization plugin as-is: hard deletes on removal, no entity limits, a second unaudited write path.
- Write authentication ourselves: password hashing, TOTP and session handling are where home-grown code goes wrong.
```

### Decision record 0011
```
# 0011 · Audit events: one append-only table, written in the caller's transaction

- **Date:** 2026-11-25
- **Status:** proposed

## Context
Decision 0006 requires an append-only audit trail with before and after values. Every brick will write to it, owners must trust it, and events about a person's account must be visible to the owners of each organization they belong to.

## Decision
One audit_events table, organization_id NOT NULL. Services call recordAudit(tx, …) inside their own transaction, so a change and its event commit or roll back together. Postgres triggers reject UPDATE, DELETE and TRUNCATE on the table. Secrets, codes and passwords are stripped before writing, and IP addresses are stored masked. Account-level events (sign-ins, lockouts, password and two-step changes) are written once for each organization the person is an active member of at that moment; before a person has any organization, they go to the structured log only. Better Auth endpoints write their events from hooks, after Better Auth's own commit.

## Consequences
- A missing event is a code bug, visible in review; nothing can quietly edit history.
- Tests can't truncate; the test database schema is recreated per run.
- Production should also run the app as a role without UPDATE/DELETE on the table (devops, before first deploy).
- Brick 4's audit log page reads one table per organization with simple indexes.

## Alternatives considered
- REVOKE only: the app currently connects as the table owner, so a trigger is the guarantee that holds today.
- Separate account-events table with a nullable organization: breaks the organization_id rule and complicates every read.
- Logging only: not queryable per record, and logs are not tamper-evident.
```

### Decision record 0012
```
# 0012 · Database-generated UUID v7 ids and same-organization foreign keys

- **Date:** 2026-11-25
- **Status:** proposed

## Context
Non-negotiable 7 asks for UUID v7 ids. Better Auth leaves ids to the database on Postgres when configured for uuid. Separately, a member's role, an invitation's entities and similar references must never point into another organization, and a service check alone can be missed.

## Decision
Every table's id is `uuid primary key default uuidv7()` (native in Postgres 18), declared once in db/columns.ts. Organization-scoped tables expose unique (organization_id, id), and references between them use composite foreign keys (organization_id, x_id) → x(organization_id, id), so a cross-organization reference fails in the database.

## Consequences
- One id strategy for our tables and Better Auth's; no JS uuid dependency.
- Production must run Postgres 18 or later.
- New organization-scoped tables add the unique (organization_id, id) pair and composite foreign keys (in the add-module skill).
- Better Auth's single-use verification rows may get deterministic v5-shaped ids; they are never exposed through our API.

## Alternatives considered
- uuidv7 generated in JS: works, but Better Auth would still need database defaults for its tables.
- Single-column foreign keys plus service checks: one forgotten check leaks data between organizations.
```

## 14. Risks and open questions

**Risks**
- **Better Auth internals in hooks:** the two-factor cookie lookup, the `reset-password:` identifier and `createVerificationOTP`. Mitigation: pin `1.7.28` exactly, keep the auth flow tests, and add an upgrade checklist in ARCHITECTURE.md.
- **Hand-written auth schema drift:** guarded by `auth-schema.test.ts`.
- **Lockout as denial of service:** anyone can lock a known email for 15 minutes with 10 bad passwords. This is accepted by the spec. Alerts tell the person, and locking unknown emails too avoids enumeration.
- **Sign-up reveals existing accounts:** the spec's "An account already uses this email" contradicts the forgot-password privacy rule. Better Auth's default replies generically. See question 2.
- **Rate limits in the database** add one write per auth request. Fine at this scale; move to Redis secondary storage if needed.
- **Persistent-session detection** relies on Better Auth giving 24 h to "don't remember" sessions. Pinned by a test.
- **Web bundle:** Better Auth client + Radix + input-otp on auth routes. All route-split. Check against the 200 KB first-load budget and record the numbers in the PR.
- **Two-step reset is account-wide:** an owner of org A resetting a person's two-step also affects that person's access to org B (one account). It is audited and alerted in both orgs.
- **Rework risk for bricks 3–4 is low:** custom roles = rows in `roles` / `role_permissions`; org switching = update `sessions.active_organization_id`; project limits = `member_project_limits` built like the entity limits; approval rules read `role_permissions` for `approve`; the audit page reads `audit_events`. Removing a value from `permission_module` / `permission_action` later needs a planned migration.

**Open questions for the owner (each changes the build)**
1. **Own tables instead of Better Auth's organization plugin** (decision 0010). Do you approve? It means changing the stack line in `CLAUDE.md` and how 0003's "(Better Auth organization)" is read. *Recommended: yes.*
2. **Duplicate email at sign-up.** Option A, as in the spec: show "An account already uses this email". Option B: reply "Check your email" as usual and email the existing account a "someone tried to sign up with your email; sign in or reset" notice. *Recommended: B*, which matches the forgot-password rule that nobody can find out who has an account.
3. **Seed has 8 people for 9 roles.** Tunde Ola (accountant) as **viewer** and no seeded admin (admin is covered by test factories), or add a ninth fictional admin? *Recommended: Tunde = viewer, no seeded admin.*
4. **HR requires two-step** (spec question 4). Built as recommended (owner, admin, finance, HR). Confirm.
5. **Turning two-step off.** 2a uses Better Auth's password confirmation. The spec says "a current code"; adding the code comes with the My security screen in brick 3. Confirm.
6. **"Keep me signed in" = 30 days from sign-in** (not extended by use). Confirm, or choose sliding 30 days.

Sources: [Better Auth 1.7 release notes](https://better-auth.com/blog/1-7), [Better Auth 1.6 release notes](https://better-auth.com/blog/1-6), [Database concepts](https://better-auth.com/docs/concepts/database), [Drizzle adapter](https://better-auth.com/docs/adapters/drizzle), [Session management](https://better-auth.com/docs/concepts/session-management), [Two-factor plugin](https://better-auth.com/docs/plugins/2fa), [npm better-auth](https://www.npmjs.com/package/better-auth). Version numbers and plugin behaviour (lockout defaults, `generateId: 'uuid'` on pg, the 24 h "don't remember" session, the haveIBeenPwned plugin failing closed, the organization plugin deleting members) were checked against the published `better-auth@1.7.28`, `@better-auth/core@1.7.28` and `@better-auth/drizzle-adapter@1.7.28` packages.
