# Plan: My security and passkeys (brick 3d)

- **Status:** for review (owner). 14 plan questions at the end, each with a recommendation.
- **Spec:** [docs/specs/my-security.md](../specs/my-security.md) (approved, all 16 recommendations, 26 Nov 2026)
- **Journeys:** J-ONB-04 (changed), J-ONB-09 and J-ONB-10 (new, draft), J-ONB-06 (changed)
- **Branch:** `brick/03d-security`, cut from `main` after 3b and 3c. **One pull request**, audited by the security agent before it's opened (app-shell owner's decision 1).
- **Decision records:** [0019 Passkeys count as two-step](../decisions/0019-passkeys-count-as-two-step.md) and [0020 Approximate place from an offline IP database](../decisions/0020-approximate-place-from-an-offline-ip-database.md) (both committed with this plan, status *proposed* until the owner approves the plan)
- **Written by:** the architect agent on 26 Nov 2026, against the code on `brick/03d-security` (3c merged: Better Auth 1.7.28, oRPC 1.16.5, Drizzle, TanStack Router 1.170)

## Summary (plain English)
Everyone gets one personal page, **My security**, at `/settings/security`, reachable from the user menu, More and ⌘K whatever their role.

- **What it shows, top to bottom:** your name (click to edit), how you sign in (password, two-step, backup codes), your **passkeys**, and every device you're signed in on, with an approximate place such as "Lekki, Lagos".
- **Passkeys:** sign in with Face ID or a fingerprint, with no password and no code. A passkey counts as two-step. Anyone who is *required* to use two-step keeps the authenticator app as the fallback for a lost phone.
- **Owners** get one switch on *Settings → Organization*: **Require two-step sign-in for everyone**. People without two-step see a banner at once and must set it up at their next sign-in, when they switch into that organization, or within 7 days, whichever comes first.
- **Admin reset** of someone's two-step now also deletes their passkeys, so a stolen phone can't sign in afterwards.
- **New security emails:** a sign-in from a browser not seen in 90 days, a passkey added or removed, and (to every owner) the organization switch turned off.
- **A gap closed:** today Better Auth would let anyone signed in change their own name (and photo, and company name) through its own endpoint without an audit entry. 3d switches that endpoint off; names change through our audited procedure.
- **New code we depend on:** Better Auth's passkey plugin (MIT) and a small reader for an offline IP database (MIT). The IP database itself (DB-IP Lite, CC BY 4.0) is downloaded by devops at deploy, never committed.

---

## 1. Summary (technical)
- **Schema (migration `0009_my_security`, generated, plus `0010_passkey_guards`, custom):**
  - new identity table `passkeys` (Better Auth model `passkey`, plural) plus Vento's `last_used_at`;
  - new identity table `known_devices`;
  - `sessions`: `place`, `reauthenticated_at`, `organization_entered_at`;
  - `organizations`: `two_step_required_for_everyone`, `two_step_required_changed_at`, `two_step_required_changed_by_user_id`;
  - custom: a guard trigger capping passkeys at 10 per person, and a backfill of `organization_entered_at`.
- **Better Auth:** `passkey()` plugin with `rpID` = host of `WEB_ORIGIN`, `origin` = `WEB_ORIGIN`, `residentKey` and `userVerification` both `required`; `session.freshAge: 0` (our 5-minute rule replaces it); `/update-user` and the plugin's list, update and delete endpoints switched off; new before- and after-hooks for the four passkey endpoints; turn-off now needs a code; wrong passwords on signed-in endpoints count towards the lock.
- **One sign-in finisher** (`apps/api/src/auth/hooks/after-sign-in.ts`) runs after every successful sign-in (password without two-step, code, backup code, passkey): audit, clear failures, place lookup is already on the session, new-device check and email, device cookie.
- **Two-step gate** becomes a pure function (`apps/api/src/access/two-step-gate.ts`) of person, membership, organization setting and session: `ok`, `grace` (banner with deadline) or `required`. Used by `memberMiddleware`, `account.me`, `switchOrganization` and invitation acceptance.
- **New procedures:** `account.security`, `account.confirmPassword`, `account.updateName`, `account.passkeys.rename`, `account.passkeys.remove` (personal); `organization.security`, `organization.setTwoStepRequired` (organization).
- **Changed procedures:** `account.me` (`twoStepRequiredBy`, `twoStepSetupBy`), `account.sessions.list` (`place`), `members.resetTwoStep` (deletes passkeys), `team.list` (`passkeyCount`, reset offered with passkeys), `roles.list` and `roles.get` (`requiredForEveryone`), `invitations.preview` (setting counts).
- **Web:** the My security page with four cards and six dialogs, the passkey offer after sign-in, the two-step banner and an in-page setup sheet, the Organization *Security* card, passkey sign-in on the sign-in page and the Session expired dialog, and settings routing for people without Settings access. All WebAuthn code is lazy. Home's first load stays about where it is (190.0 KB; budget 200).
- **New dependencies:** `@better-auth/passkey@1.7.28` (api and web) and `mmdb-lib@3.0.5` (api). Licences and sizes in §11.

## 2. Domain model

```
User (identity, no organizationId)
 ├─1─* Passkey      credentialId (unique), publicKey, counter, name, aaguid, lastUsedAt   ≤ 10 per user
 ├─1─* KnownDevice  deviceHash (sha-256 of the cookie), firstSeenAt, lastSeenAt           pruned after 90 days unseen
 ├─1─* Session      + place, reauthenticatedAt, organizationEnteredAt
 └─0..1 TwoFactor   (2a; "two-step on")

Organization
 └─ twoStepRequiredForEveryone (bool) + …ChangedAt + …ChangedByUserId
```
**Ownership:** passkeys, known devices and sessions belong to a person (identity tables, decision 0010), not an organization and not an entity. The organization setting is organization-scoped. Nothing in 3d belongs to an entity.

### What "two-step required" means (per organization)
```
requiredBy(person, org) =
  role         when the member's role requires it (2a, 3c lock)
  organization when org.twoStepRequiredForEveryone (and the role doesn't)
  reset        when users.twoStepSetupRequired (an admin's reset; applies everywhere, 2a)
  none
```

### The gate (one pure function, `twoStepGate`)
Inputs: `user.twoFactorEnabled`, `user.twoStepSetupRequired`, `member.roleRequiresTwoStep`, `org.twoStepRequiredForEveryone`, `org.changedAt`, `session.organizationEnteredAt` (null reads as `session.createdAt`), `now`.

```
two-step on (app set up)                                  → ok
reset or role requires it                                 → required
org requires it:
    session entered this org after the switch was turned on → required   (next sign-in, next switch in)
    now ≥ changedAt + 7 days                                 → required   (the deadline)
    otherwise                                                → grace { deadline: changedAt + 7 days }
nothing requires it                                        → ok
```
- `required` → member procedures answer `FORBIDDEN two_step_setup_required` (as today); `me.nextStep = 'two_step_setup'`.
- `grace` → everything works; `me.twoStepSetupBy` carries the deadline for the banner.
- **A passkey sign-in never sets "two-step on".** A person whose requirement arrived after they added a passkey signs in with it, then hits `required` and sets up the app first (spec).

### Session entry time
`sessions.organization_entered_at` is set to `now()` whenever a session's active organization is set to a *different* organization: at session creation (sign-in), `switchOrganization`, invitation acceptance, onboarding and the fallback write-back in `writeBackActiveOrganization`. It's the only new fact the gate needs to tell "next sign-in or switch" from "already in when it was turned on".

### Passkey lifecycle
```
(options: signed in, feature available, confirmed ≤ 5 min, < 10)  → challenge (5 min, single use)
challenge ─verify (UV required, discoverable)─▶ live (name defaulted from authenticator + device)
live ─rename (1–40 chars)─▶ live
live ─remove (by owner)─▶ gone          live ─two-step reset (by owner/admin)─▶ gone
live ─sign in─▶ live (counter, lastUsedAt)
```

### Invariants
| Rule | Where |
|---|---|
| `credential_id` unique across Vento | DB unique index (a credential belongs to one person) |
| ≤ 10 passkeys per person | before-hook on both registration steps (friendly), DB trigger (backstop for two tabs) |
| Passkey name 1–40 characters when set | DB check, shared zod for rename |
| A personal procedure acts only on the session's person; another person's session or passkey ID is "not found" | every query is `where id = $1 and user_id = session.user` |
| The organization setting is changed only for the session's organization, by an owner | `organization.setTwoStepRequired` on `member`, owner check in service, org row locked |
| `two_step_required_changed_at` is set whenever the setting has ever been changed | DB check: `not two_step_required_for_everyone or two_step_required_changed_at is not null` |
| Turning two-step off is refused while any active membership requires it (role or setting) | before-hook on `/two-factor/disable` |
| A two-step reset deletes every passkey of the person, in the reset's transaction | `resetMemberTwoStep` |
| Passkey sign-in refused while `passwordResetRequired`, and when `platform.passkeys` is available in none of the person's organizations | passkey after-hook (deletes the session it just made) |
| Full IP never stored; place stored as text only | session create hook |

## 3. Database

### Migration `0009_my_security` (generated)
| Table | Column | Type | Notes |
|---|---|---|---|
| `passkeys` (new) | `id` | uuid pk `uuidv7()` | decision 0012 |
| | `user_id` | uuid not null → `users.id` on delete cascade | index `passkeys_user_id_idx` |
| | `name` | text null | check `name is null or char_length(name) between 1 and 40` |
| | `public_key` | text not null | |
| | `credential_id` | text not null | unique `passkeys_credential_id_unique`. Drizzle property **`credentialID`** (Better Auth's field name) with the column name given explicitly, so casing can't turn it into `credential_i_d` |
| | `counter` | integer not null | |
| | `device_type` | text not null | `singleDevice` / `multiDevice` |
| | `backed_up` | boolean not null | |
| | `transports` | text null | comma list |
| | `aaguid` | text null | authenticator model, used for the default name |
| | `last_used_at` | timestamptz null | Vento's; written by our after-hook |
| | `created_at`, `updated_at` | timestamptz | `timestamps` helper |
| `known_devices` (new) | `id` | uuid pk | |
| | `user_id` | uuid not null → `users.id` cascade | |
| | `device_hash` | text not null | hex sha-256 of the cookie value; the cookie itself is never stored |
| | `first_seen_at`, `last_seen_at` | timestamptz not null default now() | |
| | `created_at`, `updated_at` | | unique `(user_id, device_hash)`; index `(user_id, last_seen_at)` for pruning |
| `sessions` | `place` | text null | "Lekki, Lagos" / "London, United Kingdom" |
| | `reauthenticated_at` | timestamptz null | the 5-minute window |
| | `organization_entered_at` | timestamptz null | see §2; null reads as `created_at` |
| `organizations` | `two_step_required_for_everyone` | boolean not null default false | |
| | `two_step_required_changed_at` | timestamptz null | check above |
| | `two_step_required_changed_by_user_id` | uuid null → `users.id` on delete set null | for "Olumide Bankole changed this a moment ago" |

All `sessions` and `organizations` additions are nullable or defaulted: no rewrite, no lock beyond the brief `ALTER`. `passkeys` and `known_devices` are identity tables with **no `organization_id`** (decision 0010); add both to the identity list in `auth-schema.test.ts` and to the schema-diff check against `npx auth generate`.

### Migration `0010_passkey_guards` (custom SQL, `db-migration` skill)
- `passkeys_limit` trigger, `before insert` on `passkeys`: `pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0))`, then raise `check_violation` with message `PASSKEY_LIMIT` when the person already has 10. Two tabs adding at once can't make 11.
- Backfill: `update sessions set organization_entered_at = created_at where organization_entered_at is null` (sessions live ≤ 30 days; tiny).

### Better Auth additional session fields
Add `place`, `reauthenticatedAt` and `organizationEnteredAt` to `authSessionFields` (`packages/shared/src/auth/fields.ts`), all `input: false`, **no `defaultValue`** (same reason as `persistent`: Better Auth would apply defaults over a rotated session).

## 4. Better Auth integration (`apps/api/src/auth/auth.ts` and `hooks/`)

### 4.1 Plugin configuration
```ts
passkey({
  rpID: new URL(env.WEB_ORIGIN).hostname,      // 'localhost' · staging host · production host
  rpName: 'Vento',
  origin: env.WEB_ORIGIN,                       // no trailing slash
  authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  registration: { requireSession: true, afterVerification: defaultPasskeyName },
  advanced: { webAuthnChallengeCookie: 'passkey_challenge' },   // → vento.passkey_challenge
})
```
- **Origins per environment** (decision 0009, one origin each): dev `http://localhost:5173` (rpID `localhost`), e2e `http://localhost:5193` locally and `:5173` in CI (`localhost`), staging and production their own `https://` host. Web and API share the origin, so the browser's origin is `WEB_ORIGIN` in every case. WebAuthn needs a secure context: `env.ts` refuses to start in production unless `WEB_ORIGIN` is `https:` (localhost is exempt by browsers).
- **Never 127.0.0.1:** an IP address can't be an rpID. `.env.example` and the e2e config already use `localhost`; a comment in `.env.example` says why.
- **`userVerification: 'required'`** makes the plugin pass `requireUserVerification: true` to both verifiers, so a response without UV is refused (pinned by an e2e test with a virtual authenticator that skips UV).
- **`residentKey: 'required'`** makes every passkey discoverable, so it works from the email field's suggestions.
- **`session.freshAge: 0`.** The plugin puts `freshSessionMiddleware` on both registration endpoints: with the default (1 day) anyone with a "Keep me signed in" session older than a day couldn't add a passkey. Our own 5-minute confirmation replaces it. `freshAge` is otherwise read only by `/delete-user`, which is switched off. A test pins that registration works on a 3-day-old session after confirming.
- **Real endpoint paths** (the spec used the client method names): `GET /passkey/generate-register-options`, `POST /passkey/verify-registration`, `GET /passkey/generate-authenticate-options`, `POST /passkey/verify-authentication`.
- **Switched off** (added to `DISABLED_AUTH_PATHS`): `/passkey/list-user-passkeys`, `/passkey/update-passkey`, `/passkey/delete-passkey` (our audited oRPC procedures replace them, plan question 2) and **`/update-user`** (plan question 1).
- **Rate limits** (`customRules`): the four passkey paths 10 a minute per IP each.

### 4.2 Default passkey name (`apps/api/src/auth/passkey-names.ts`)
`afterVerification` returns `{ name }` built from a small AAGUID table and the request's device (`requestScope().userAgent`): "iCloud Keychain · iPhone", "Google Password Manager · Android phone", "Windows Hello · Windows PC", "1Password · Mac", "Samsung Pass · Android phone"; unknown or all-zero AAGUID (Apple under `attestation: 'none'` often sends zeros, so Apple devices fall back by user agent to "iCloud Keychain") → "Passkey · Chrome on Mac". Truncated to 40 characters. The before-hook on `verify-registration` drops any client `name` (a client-supplied name would win).

### 4.3 Before-hooks (new cases)
| Path | Checks, in order |
|---|---|
| `/passkey/generate-register-options` and `/passkey/verify-registration` | Session present (plugin). `platform.passkeys` available to the session's active organization (`passkeysAvailableHere`) else `404 PASSKEYS_UNAVAILABLE`. Session `reauthenticatedAt` within 5 minutes else `403 REAUTH_REQUIRED` (options step only: the verify step is bound to a challenge issued under the window). Fewer than 10 passkeys else `409 PASSKEY_LIMIT`. Strip `name` from the verify body. |
| `/passkey/generate-authenticate-options` | `platform.passkeys` stage is `off` (kill switch, read from the in-memory snapshot) → `404 PASSKEYS_UNAVAILABLE`. Nothing user-specific is checked here (sign-in happens before we know who). |
| `/passkey/verify-authentication` | Read `x-vento-remember: 1` into `requestScope().auth.rememberMe` (the plugin's session creation ignores `rememberMe`; see §4.5). **No `assertNotLocked`** (owner's decision 8). |
| `/two-factor/disable` | `firstTwoStepRequirement(db, userId)` (replaces `roleRequiresTwoStep`): role *or* organization setting, across active memberships; refusal names it (copy in §5.6). Then **require a code**: body `code` (TOTP) or `backupCode` — see §4.6. |
| `/two-factor/enable`, `/two-factor/generate-backup-codes` | Unchanged: Better Auth itself requires and verifies the password in the body (plan question 3). |

### 4.4 After-hooks (new and changed cases)
| Path | On success | On failure |
|---|---|---|
| `/passkey/verify-authentication` | Look up the person (`findUserById`). **`passwordResetRequired`** → delete the session just made, `setNewSession(null)`, `403 PASSWORD_RESET_REQUIRED` (2a message). **No active membership** → same deletion, `401 PASSKEY_NOT_RECOGNISED` (reveals nothing). **`platform.passkeys` available in none** of their organizations (`passkeysAvailableForUser`, §4.7) → deletion, `403 PASSKEYS_UNAVAILABLE`. Else `passkeys.last_used_at = now()` (by the credential id in the response) and `afterSignIn(method: 'passkey')`. | `PASSKEY_NOT_FOUND`, `AUTHENTICATION_FAILED`, challenge missing or expired → mapped by the web; nothing counted towards a lock. |
| `/passkey/verify-registration` | Audit `passkey.added` (target `passkey`, label = name); alert email "passkey added". | Limit trigger → `409 PASSKEY_LIMIT`. |
| `/sign-in/email` (no two-step) | `onPasswordSuccess` → now calls `afterSignIn(method: 'password')` | unchanged |
| `/two-factor/verify-totp`, `/verify-backup-code` (sign-in mode) | `afterTwoStepVerify` → `afterSignIn(method)` | unchanged |
| `/change-password`, `/two-factor/enable`, `/two-factor/disable`, `/two-factor/generate-backup-codes` | `/two-factor/enable` and `/generate-backup-codes` and `/change-password` stamp `reauthenticatedAt` on the (possibly new) session: the password was just proven | `INVALID_PASSWORD` → `onPasswordFailure(user.email)` (counts towards 10 in 15 minutes, plan question 11); a lock returns `lockedResponse` |

### 4.5 Session creation hook (`databaseHooks.session.create.before`)
- `SIGN_IN_PATHS` gains `/passkey/verify-authentication`. For that path `persistent = requestScope().auth.rememberMe === true` (header set by the web at request time); the plugin always asks for a 30-day session, which the hook trims to 12 hours when not persistent, as today.
- **New, non-rotated sessions** also get:
  - `place = lookupPlace(requestScope().ip)` (§7), before the address is masked;
  - `organizationEnteredAt = now`;
  - `reauthenticatedAt = now` **only** for `/sign-in/email`, `/two-factor/verify-totp` and `/two-factor/verify-backup-code` (a password was just typed, so the passkey offer right after sign-in doesn't ask again). Never for a passkey sign-in: confirming is by password only (spec "Out of scope").
- **Rotated sessions** (two-step turned on, change password) carry `place`, `organizationEnteredAt` and `reauthenticatedAt` over, as `persistent` and the masked IP already are.

### 4.6 The code on turn-off (`apps/api/src/auth/hooks/turn-off-guard.ts`)
2a decision 11 promised it with this screen. The guard first checks the password itself (credential hash, `ctx.context.password.verify`; wrong → `INVALID_PASSWORD`, counted), so a wrong password never consumes a backup code. It then calls Better Auth's own verifier in-process with the request's headers, so the secret never leaves the plugin:
- TOTP: `api.verifyTOTP({ body: { code }, headers })`. With a live session the plugin verifies and returns without making a new session.
- Backup code: `api.verifyBackupCode({ body: { code, disableSession: true }, headers })` (consumes it, as any use does).
- `requestScope().auth.twoStepMode = 'turn_off'` so our verify after-hook skips its own bookkeeping; the guard does it instead: a wrong code → `auth.two_step_failed` audit and `400 INVALID_CODE`; the plugin's 5-in-a-row lock (`two_factors.locked_until`) → `lockAccount(reason: 'two_step')`, **delete all the person's sessions** and `429 ACCOUNT_LOCKED` (spec: lock, sign out, email).
- If the nested call proves brittle in the build (risk R4), the fallback is to decrypt the secret with `symmetricDecrypt` from `better-auth/crypto` and check it with `createOTP` from `@better-auth/utils/otp` (already in the tree), backup codes still through the plugin.

### 4.7 Availability helpers (`apps/api/src/auth/passkey-availability.ts`)
`createAuth` gains a `features: FeatureStore` option (`createApp` passes its store; tests default to the live store).
- `passkeysAvailableHere(db, store, session)`: the session's active organization's availability (`organizationAvailability(snapshot, plan, now).has('platform.passkeys')`).
- `passkeysAvailableForUser(db, store, userId)`: one query for every active membership's organization plan (`organization_plans` left join), then any of them `has('platform.passkeys')`. No query beyond that one; the snapshot is in memory.

### 4.8 `afterSignIn` (`apps/api/src/auth/hooks/after-sign-in.ts`)
One function for every successful sign-in, so the paths can't drift:
1. `clearAttempts('password_failure', email)`.
2. Audit `auth.signed_in` with `method: 'password' | 'totp' | 'backup_code' | 'passkey'`.
3. **New-device check:** read cookie `vento.device` (`ctx.getCookie(createAuthCookie('device').name)`). Missing or unknown hash for this person → insert `known_devices` and, unless the request is a first sign-in (below), send the "new sign-in" alert (device, browser, place, time). Known → update `last_seen_at`. Always prune this person's rows unseen for 90 days. When there was no cookie, set one: 32 random bytes base64url, `httpOnly`, `secure` in production, `sameSite: 'lax'`, path `/`, max-age 400 days (browsers' cap).
4. **First sign-in, no email:** `/verify-email` (sign-up's automatic sign-in) and invitation acceptance (the invitations router sets `requestScope().auth.firstSignIn = true` before its server-side `signInEmail`). The device is recorded silently.

Emails are sent after Better Auth commits, through `sendAll` (never throws; failures logged by tag and code only, 3b).

## 5. Contract (`packages/shared`)

### 5.1 New shared schemas (`packages/shared/src/account/security.ts`)
```ts
personName = z.string().trim().min(2).max(80).refine(noHiddenCharacters)       // "Enter your name"
passkeyName = z.string().trim().min(1, 'Enter a name').max(40)
twoStepRequirement = z.object({
  organizationName: z.string(),
  reason: z.enum(['role', 'organization', 'reset']),
  roleName: z.string().nullable(),          // for "Required for your role (Finance)"
})
passkeyItem = z.object({ id, name: z.string(), createdAt: iso, lastUsedAt: iso.nullable() })
securityOverview = z.object({
  name: z.string(), email: z.string(),
  passwordChangedAt: iso.nullable(),         // null = "Set when you joined"
  twoStep: z.object({
    enabled: z.boolean(),
    requiredBy: twoStepRequirement.nullable(),   // first one, active organization first
    backupCodesLeft: z.number().int().min(0).max(10).nullable(),   // null when off
  }),
  passkeys: z.object({
    available: z.boolean(),                  // platform.passkeys in the active organization
    items: z.array(passkeyItem),             // newest first; [] when unavailable (the card is hidden)
    limit: z.literal(10),
  }),
  reauthenticatedUntil: iso.nullable(),      // the web skips "Confirm it's you" before this
})
orgSecurity = z.object({
  required: z.boolean(),
  changedAt: iso.nullable(), changedByName: z.string().nullable(),
  withTwoStep: z.number().int(), people: z.number().int(),         // "9 of 12 people have two-step on"
  withoutTwoStep: z.object({ names: z.array(z.string()).max(3), others: z.number().int() }),
  canChange: z.boolean(),                    // owners only
})
```
`passwordChangedAt`: the newest `password_histories.created_at` when the person has more than one row, else null (the first row is the sign-up password).

### 5.2 `accountContract` additions (all `platform`, no feature in meta: decision 0016 forbids gating personal procedures; availability is checked in the service)
| Procedure | Input | Output | Errors |
|---|---|---|---|
| `account.security` | – | `securityOverview` | – |
| `account.confirmPassword` | `{ password: z.string().min(1).max(PASSWORD_MAX_LENGTH) }` | `{ reauthenticatedUntil: iso }` | `BAD_REQUEST wrong_password` "That's not your password."; `TOO_MANY_REQUESTS` (10 a minute per person, and the 2a lock) |
| `account.updateName` | `{ name: personName }` | `{ name, notice: 'Name updated' }` | `BAD_REQUEST` "Enter your name" |
| `account.passkeys.rename` | `{ id, name: passkeyName }` | `notice` | `NOT_FOUND` (not yours, gone, or passkeys unavailable here) |
| `account.passkeys.remove` | `{ id }` | `notice` | `NOT_FOUND` "That passkey was already removed. The list is up to date." |
| `account.sessions.list` | unchanged | `sessionItem` gains `place: z.string().nullable()` | – |
| `account.sessions.revoke` | unchanged | unchanged | `NOT_FOUND` gains the message "That device is already signed out. The list is up to date." |
| `account.me` | – | adds `twoStepRequiredBy: twoStepRequirement.nullable()` and `twoStepSetupBy: iso.nullable()` (the grace deadline; null outside grace) | – |

### 5.3 `organizationContract` additions
| Procedure | Input | Output | Errors |
|---|---|---|---|
| `organization.security` | – | `orgSecurity` | permission (settings view) |
| `organization.setTwoStepRequired` | `{ required: z.boolean(), seenChangedAt: iso.nullable() }` | `orgSecurity` plus `notice` and `changedByOther: z.string().nullable()` | `FORBIDDEN owner_only` "Only owners can change this." |

`updateOrganizationInput` stays a `strictObject` without the new fields, so `organization.update` can never change the setting (schema test).

### 5.4 Other output changes
- `team.list` member rows: `passkeyCount: z.number().int()`; `can.resetTwoStep` also true when `passkeyCount > 0`; `twoStep` reads `setup_required` when the organization setting is on and two-step is off.
- `roles.list` and `roles.get`: `requiredForEveryone: z.boolean()` (top level).
- `invitations.preview`: `twoStepRequired` also true when the inviting organization's setting is on.

### 5.5 Error codes (`packages/shared/src/auth/error-codes.ts`)
New: `PASSKEYS_UNAVAILABLE`, `PASSKEY_NOT_RECOGNISED`, `PASSKEY_LIMIT`, `REAUTH_REQUIRED`, `TWO_STEP_REQUIRED_BY_ORGANIZATION`, `CODE_REQUIRED`. Better Auth's listed for mapping: `PASSKEY_NOT_FOUND`, `AUTHENTICATION_FAILED`, `CHALLENGE_NOT_FOUND`, `FAILED_TO_VERIFY_REGISTRATION`, `TWO_FACTOR_NOT_ENABLED` (stale "Make new codes": "Two-step is off now. The page is up to date.").

### 5.6 Shared helper (`packages/shared/src/account/two-step-copy.ts`)
`twoStepRefusal(req)` → "Two-step is required for your role (Finance) in Vento Homes Ltd, so it can't be turned off." / "Vento Homes Ltd requires two-step for everyone, so it can't be turned off." and `twoStepRequiredLine(req)` → "Required for your role (Finance)" / "Required by Vento Homes Ltd". The server's refusal and the page's line can't drift.

### 5.7 Audit actions (`packages/shared/src/audit/actions.ts`)
Append `passkey.added`, `passkey.renamed`, `passkey.removed`, `account.name_changed`. Metadata never holds a credential id, public key, challenge, password, code or full IP. `auth.signed_in` metadata `method` gains `passkey`; `two_step.reset` gains `passkeysRemoved`; `organization.updated` covers `twoStepRequiredForEveryone` (before → after).

## 6. Permissions and procedure guards

| Procedure | Built on | Permission | Notes |
|---|---|---|---|
| `account.security`, `confirmPassword`, `updateName`, `passkeys.rename`, `passkeys.remove`, `sessions.*` | `authed` | none (personal) | Add the five new paths to **`PERSONAL_PROCEDURES`** in `apps/api/src/test/procedure-guard.test.ts`: they read no organization data, so the tab guard doesn't apply. The walk proves they declare `feature: null`. Each takes no person ID. |
| `organization.security` | `member` | `settings.view` | Organization-wide (tab guard applies) |
| `organization.setTwoStepRequired` | `member` | `settings.edit` + `requireAllEntities()` + **owner** (`member.roleKey === 'owner'`, checked in the service after locking the org row, so a demotion meanwhile is seen via `lockViewer`) | Owners always have every company, so `requireAllEntities` only guards odd data |
| `members.resetTwoStep` | unchanged (`settings.edit`) | | now also deletes passkeys |

- **Preview:** personal procedures run with the real person, so a previewing admin sees their own account (spec). Nothing on My security reads the previewed role.
- **Forced setup:** personal procedures aren't gated by two-step setup (a person must be able to sign out a lost phone). The web keeps My security unreachable while `nextStep = two_step_setup` (spec).
- **Maker-checker:** none (spec): personal changes can't be approved by someone else; the organization setting is owners-only, audited, and turning it off emails every owner.

## 7. Services (apps/api)

### 7.1 `apps/api/src/modules/account/security.service.ts` (new; `account.service.ts` stays for me, switch and sessions)
- **`getSecurity(db, auth, user, session, store)`**: `runQueries` in parallel: password histories (count, newest), `firstTwoStepRequirement` (active organization first), backup codes left (`auth.api.viewBackupCodes({ body: { userId } }).backupCodes.length` when on), passkeys newest first (only when available here), session's `reauthenticatedAt`.
- **`confirmPassword(db, auth, user, session, password, rateLimiter)`**: per-person limit `confirm:${userId}` 10 a minute; refuse while `activeLockUntil(email)`; read the credential hash from `accounts` and check with `(await auth.$context).password.verify`. Wrong → `onPasswordFailure(email)` (may lock and email), `wrong_password`. Right → `clearAttempts`, `sessions.reauthenticated_at = now()`, return now + 5 min. Not audited (it changes nothing; the action that follows is).
- **`updateName(db, user, name)`**: transaction: `update users set name`, `recordAccountEvent(account.name_changed, before → after)` in every organization. Past audit rows keep their actor name (they store it). Unchanged name → no write, same notice.
- **`renamePasskey` / `removePasskey(db, store, user, session, …)`**: availability check for rename (unavailable → `NOT_FOUND`); remove works whatever the flag (a person can always delete their own key). Transaction: `update/delete … where id = $1 and user_id = $2 returning name`; none → `NOT_FOUND`; audit `passkey.renamed` / `passkey.removed`. Remove's alert email goes after commit (router).
- **Constant:** `REAUTH_WINDOW_MS = 5 * MINUTE` in `apps/api/src/auth/policy.ts`, beside the other security defaults (product policy, not statutory: stays in code).

### 7.2 `apps/api/src/access/two-step-gate.ts` (new, pure)
`twoStepGate(input, now)` as §2, plus `twoStepRequirementOf(...)` for `requiredBy`. `context.ts`:
- `loadMembership` and `lockViewer` select `o.two_step_required_for_everyone`, `o.two_step_required_changed_at`; `MemberContext` gains `organizationTwoStep: { required: boolean; since: Date | null }`. `requiresTwoStep` keeps meaning *the role's* value (roles and manage rules use it).
- `twoStepRequired(user, member)` is replaced at its three call sites (`memberMiddleware`, `nextStepFor` in `account.service.ts`, `nextStepAfterAccept` in `invitations.service.ts`) by the gate; `AuthSession` gains `organizationEnteredAt`.
- `setActiveOrganization` sets `organization_entered_at = now()` on the session when the organization changes.

### 7.3 `apps/api/src/auth/security-store.ts`
- `roleRequiresTwoStep` → `firstTwoStepRequirement(db, userId, preferOrganizationId?)`: one query over active memberships joining roles and organizations, `where r.requires_two_step or o.two_step_required_for_everyone`, ordered active organization first, then name; returns `twoStepRequirement | null`.
- `findUserById` stays; add `passkeyCountFor(db, userId)` and `knownDevice` helpers (`apps/api/src/auth/known-devices.ts`).

### 7.4 Organization service (`organization.service.ts`)
- **`getOrganizationSecurity(ctx)`**: setting row, changer's name, and in one query over active members joined to users: count with `two_factor_enabled`, total, and the first three names without it (by name) plus the rest as a count. Active members only (plan question 10).
- **`setTwoStepRequired(ctx, input)`**: transaction: `lockOrganization`, `lockViewer` (owner check on the live role → `owner_only`). If the value already equals `input.required` → no write; `changedByOther` = the changer's name when `changedAt ≠ seenChangedAt`. Else update the three columns, `recordAudit(organization.updated, { twoStepRequiredForEveryone: was } → { …: now })`. Turning **off** returns `emails`: one "no longer required" alert to every active owner, sent by the router after commit. Turning **on** sends nothing (the banner and Team do the telling; plan question 13).

### 7.5 Members and team
- `resetMemberTwoStep`: `delete from passkeys where user_id = target returning id` in the same transaction, before the session deletion; metadata `passkeysRemoved`. Reset confirm copy reads the count from the row (`passkeyCount`).
- `manage-rules.ts` `memberRowRights`: `resetTwoStep` when `target.twoStep === 'on' || target.passkeyCount > 0` (and the existing rules).
- `team.service.ts` member query: `(select count(*) from passkeys p where p.user_id = m.user_id)::int as passkey_count`; `twoStepOf` gets `requiresTwoStep: role or organization setting`.
- `roles.service.ts`: `requiredForEveryone` from the organization row (already read for the list).
- `invitations.service.ts` preview: `twoStepRequired: role.requiresTwoStep || org.twoStepRequiredForEveryone`; the invitation email template already takes the boolean.

### 7.6 Place lookup (`apps/api/src/lib/place.ts`)
- `mmdb-lib`'s `Reader` over `readFileSync(env.GEOIP_DB_PATH)`, opened lazily on the first lookup and kept; any error (no file, bad file) logs once (`place_lookup_unavailable`) and returns null forever until restart.
- `lookupPlace(ip)`: null for private, loopback and invalid addresses. Nigeria: "City, State" ("Lekki, Lagos"; the state without " State"); elsewhere "City, Country" ("London, United Kingdom"); no city → the region or country alone.
- Never logs the IP or the result. Unit test with a tiny fixture MMDB built in the test (`mmdb-lib` reads any valid file; the fixture is generated, so no third-party data in the repo).
- `env.ts`: `GEOIP_DB_PATH` optional string; `.env.example` documents it (blank = no places).

### 7.7 Emails (`apps/api/src/email/templates/security-alert.ts`)
New: `newSignInAlert({ device, place, at, on, securityUrl })`, `passkeyAddedAlert({ name, at, on, securityUrl, resetUrl })`, `passkeyRemovedAlert(...)`, `twoStepNoLongerRequiredAlert({ byName, organizationName, at, on, organizationUrl })` (copy in the spec's UI copy table). All tag `security_alert`, can't be muted, sent after commit, failures logged by tag and code only. `templates.test.ts` gains a snapshot each and a check that no IP-looking string appears.

## 8. Web (apps/web)

### 8.1 Routing and entry points
- **Settings layout guard moves down.** `routes/_app/_shell/settings.tsx` drops `beforeLoad: moduleGuard('settings')`; each organization section (`organization.tsx`, `companies.tsx`, `team.tsx`, `roles.tsx`) gains it, so they keep the 403 before any loader. The layout itself now renders for everyone.
- **New route** `routes/_app/_shell/settings/security.tsx`: `staticData: { orgWide: true }` (company switcher hidden), no module guard, `component` lazy (route split).
- `features/settings/sections.ts`: new section `{ key: 'security', label: 'My security', group: 'personal', to: '/settings/security', can: () => true, keywords: ['password', 'passkey', 'two-step', 'sessions', 'devices', 'sign out', 'backup codes'] }`, always last. `showsSettingsNav` counts sections as today, so a sales agent (one section) gets no sub-navigation and `/settings` redirects to `/settings/security`. `settings-nav.tsx` and `settings-mobile-list.tsx` draw a divider before the `personal` group. Sidebar: Settings stays hidden for people without settings view (unchanged `nav.ts`).
- **User menu** (`components/shell/user-menu-panel.tsx`) and **More** (`more-sheet.tsx`): **My security** under the name and email, above Theme.
- **⌘K** (`features/shell/use-shell-actions.ts`): "Go to My security", "Change password", "Add a passkey" (when available and the browser supports it), "Turn on two-step" (when off). Each opens the page with `?do=change-password|add-passkey|turn-on`, which the page reads once and clears.

### 8.2 The page (`features/security/`, all lazy with the route)
| File | What |
|---|---|
| `security-page.tsx` | Header (avatar, `name-field.tsx`, email, muted line), then the four cards; `max-w-3xl`, single column; skeleton of the cards in final sizes |
| `security-queries.ts` | `orpc.account.security` and `orpc.account.sessions.list` (pageSize 50: one page is everyone's reality) as separate queries, so each card fails and retries on its own; refetch on window focus (two-tab rule) |
| `name-field.tsx` | Click-to-edit, Enter saves, Esc cancels, blur saves; `personName` from shared; toast "Name updated"; invalidates `me` |
| `sign-in-card.tsx` | Password, two-step (badge, `twoStepRequiredLine`, Turn on / Turn off), backup codes row (amber at ≤ 3) |
| `passkeys-card.tsx` | List with ⋯ (Rename in place, Remove), add button states (none / some / limit / unsupported), required note, shared-device hint; hidden when `passkeys.available` is false |
| `sessions-card.tsx` | Rows (`session-row.tsx`: "Chrome on Mac", place · masked IP, relative last active via `features/team/last-active.ts`), This device tag, Sign out (no confirm), Sign out other devices; foot line "IP geolocation by DB-IP" (plan question 6) |
| `use-reauth.ts` | `ensureConfirmed()`: resolves at once while `reauthenticatedUntil > now`, else opens Confirm it's you and resolves after `account.confirmPassword`; server `REAUTH_REQUIRED` also opens it and retries once |
| `dialogs/confirm-password-dialog.tsx` | Confirm it's you |
| `dialogs/change-password-dialog.tsx` | `authClient.changePassword({ revokeOtherSessions: true })`, reuses `components/auth/new-password-fields.tsx`; toast count from the sessions list's other rows read just before |
| `dialogs/turn-off-dialog.tsx` | Password + code (`components/auth/code-input.tsx`) or "Use a backup code"; sends `{ password, code }` or `{ password, backupCode }` to `/two-factor/disable` |
| `dialogs/new-codes-dialog.tsx` | Password → `authClient.twoFactor.generateBackupCodes` → `components/auth/backup-codes.tsx` with the saved tick |
| `dialogs/turn-on-sheet.tsx` | `features/two-step/two-step-setup.tsx` and `use-two-step-setup.ts` in a sheet, then backup codes; also used by the banner (§8.4) |
| `dialogs/remove-passkey-dialog.tsx`, `dialogs/sign-out-others-dialog.tsx` | Confirms on `components/confirm-dialog.tsx` |
| `passkey-actions.ts` | `addPasskey()`: `ensureConfirmed()` → `const { passkeyClient } = await import('@/lib/passkey-client')` → `passkey.addPasskey()`; maps errors (cancelled: nothing shown; `InvalidStateError`: "This device already has a passkey for your account."; others: "Passkey not added. Try again, or use another device."); toast with **Rename** |

Dialogs open as full-height sheets under 768 px (existing sheet pattern), main button above the keyboard (`use-visual-viewport.ts`). On *Session expired* over an open dialog, password fields clear and say so (spec).

### 8.3 Passkey client, lazy (`lib/passkey-client.ts`, new)
A second Better Auth client with only `passkeyClient()` from `@better-auth/passkey/client`, same `baseURL`/`basePath`, created inside the module. Imported only by dynamic `import()` from: the sign-in page, the Session expired dialog (already lazy), `passkey-actions.ts` and the passkey offer. `lib/passkey-support.ts` (tiny, no imports) answers "can this browser make passkeys" with `window.PublicKeyCredential`, `isUserVerifyingPlatformAuthenticatorAvailable()` and `isConditionalMediationAvailable()`, so no WebAuthn library is needed to decide what to show. **bundle-check** `FORBIDDEN` gains `@simplewebauthn/browser`, `@better-auth/passkey` and `features/security/`.

### 8.4 Sign-in, Session expired, offer, banner
- **Sign-in** (`routes/_auth/sign-in.tsx`, `features/auth/password-step.tsx`, `use-sign-in.ts`): email input `autoComplete="username webauthn"`; on mount, when conditional mediation is available, start `signIn.passkey({ autoFill: true })`; **Sign in with a passkey** (secondary, under **Sign in**) when `PublicKeyCredential` exists. `fetchOptions.onRequest` sets `x-vento-remember` from the checkbox **at request time**, so ticking it after the autofill started still counts. Errors via `lib/auth-errors.ts` (new codes, cancelled → muted "Passkey sign-in was cancelled."). Lost-phone line updated. After success the same `me`-driven redirect as a password sign-in.
- **Session expired** (`components/session-expired-dialog.tsx`): **Sign in with a passkey** beside the password; the page underneath stays.
- **Passkey offer** (`features/security/passkey-offer.tsx`, lazy, mounted by `_shell` only when the last sign-in was by password): after a password(+code) sign-in, the sign-in page sets `sessionStorage['vento-offer-passkey'] = '1'`; the shell shows the dialog once when `platform.passkeys` is available, the browser has a platform authenticator, the person has no passkey *named for this device*, and `localStorage['vento-passkey-offer-seen:{userId}']` isn't set. Either button sets it. **Add a passkey** skips Confirm (the sign-in stamped `reauthenticatedAt`).
- **Banner** (`components/shell/two-step-banner.tsx`, pattern of `preview-banner.tsx`): shown when `me.twoStepSetupBy` is set; last day copy from the deadline; **Set up two-step** opens `turn-on-sheet.tsx` lazily over the page.
- **Deadline mid-work:** `shell-route-error.tsx` and the query error handler today redirect on `two_step_setup_required`; inside the shell they now open the same setup sheet over the page instead (the setup route stays for sign-in and switching, where `nextStep` sends people).

### 8.5 Organization, Team and Roles
- `features/organization/profile/security-card.tsx` (new, lazy within the Organization page): switch, line, count, read-only note; turn-on and turn-off confirms; race toast from `changedByOther`. Query `organization-queries.ts` gains `organization.security`.
- Team: `member-sheet.tsx` fact "2 passkeys"; `team-confirms.tsx` reset copy with the count; `team-cells.tsx` badge already maps `setup_required`.
- Roles: `roles-table.tsx` two-step column "Required" with tooltip when `requiredForEveryone`; `two-step-field.tsx` locked with "Required for everyone in {org}. Change this on Organization."

### 8.6 Performance
Home's first load is 190.0 KB today. 3d adds to it only: the sections entry (a few bytes), the user-menu entry (the panel is already lazy), the banner (≈ 0.6 KB, shown from `me`) and the `me` fields. Estimate +1 KB. Everything else is in lazy route or dialog chunks; the WebAuthn browser library (≈ 5 KB gz) loads only on a passkey action or the sign-in page. My security's own chunk target: ≤ 25 KB gz, usable within 1 s on a repeat visit over slow 3G (the two queries in parallel, no waterfall).

## 9. Files

### packages/shared
- `src/account/security.ts` (new) — schemas in §5.1 · `security.test.ts` (new)
- `src/account/two-step-copy.ts` (new) — refusal and line copy · `two-step-copy.test.ts`
- `src/account/contract.ts` — five procedures, `sessionItem.place`, `me` fields (`schema.ts`)
- `src/organization/contract.ts`, `schema.ts` — `organization.security`, `setTwoStepRequired`, `orgSecurity`
- `src/team/schema.ts` — `passkeyCount`; `src/access/schema.ts` — `requiredForEveryone`
- `src/auth/fields.ts` — three session fields; `src/auth/error-codes.ts` — new codes
- `src/audit/actions.ts` — four actions

### apps/api
- `src/db/schema/auth.ts` — `passkeys`, `sessions` columns; `src/db/schema/auth-security.ts` — `knownDevices`; `src/db/schema/organization.ts` — three columns
- `drizzle/0009_my_security.sql` (generated), `drizzle/0010_passkey_guards.sql` (custom)
- `src/auth/auth.ts` — plugin, `freshAge`, disabled paths, rate limits, hook cases, `features` option
- `src/auth/hooks/after-sign-in.ts` (new) — finisher; `known-devices.ts` (new, beside `security-store.ts`)
- `src/auth/hooks/passkey-hooks.ts` (new) — before/after for the four passkey paths
- `src/auth/hooks/turn-off-guard.ts` (new) — the code on turn-off
- `src/auth/hooks/sign-in-guard.ts`, `two-step-guard.ts` — call `afterSignIn`; `turn_off` mode
- `src/auth/hooks/audit-hooks.ts` — passkey added (and alert)
- `src/auth/passkey-names.ts` (new), `passkey-availability.ts` (new)
- `src/auth/security-store.ts` — `firstTwoStepRequirement`, `passkeyCountFor`
- `src/auth/policy.ts` — `REAUTH_WINDOW_MS`, `KNOWN_DEVICE_TTL_MS`, `PASSKEY_LIMIT`
- `src/lib/request-scope.ts` — `auth.rememberMe`, `auth.firstSignIn`, `twoStepMode: 'turn_off'`
- `src/lib/place.ts` (new) — place lookup
- `src/env.ts` — `GEOIP_DB_PATH`; https check for production `WEB_ORIGIN`
- `src/app.ts` — pass `features` to `createAuth`
- `src/access/two-step-gate.ts` (new); `context.ts` — membership fields, `organizationEnteredAt`; `middleware.ts` — the gate
- `src/access/manage-rules.ts` — reset offered with passkeys
- `src/modules/account/security.service.ts` (new), `account.router.ts`, `account.service.ts` (`me`, sessions `place`)
- `src/modules/organization/organization.service.ts`, `organization.router.ts`
- `src/modules/members/members.service.ts` — delete passkeys on reset
- `src/modules/team/team.service.ts`, `roles/roles.service.ts`, `invitations/invitations.service.ts`, `invitations.router.ts` (`firstSignIn`)
- `src/email/templates/security-alert.ts` — four templates
- `src/db/seed.ts` — §12
- `package.json` — `@better-auth/passkey` 1.7.28, `mmdb-lib` 3.0.5 (exact pins)

### apps/web
- `src/routes/_app/_shell/settings.tsx` (guard removed), `settings/{organization,companies,team,roles}.tsx` (guard added), `settings/security.tsx` (new)
- `src/features/settings/sections.ts`, `settings-nav.tsx`, `settings-mobile-list.tsx`
- `src/features/security/*` (new, §8.2), `passkey-offer.tsx`
- `src/lib/passkey-client.ts`, `passkey-support.ts` (new); `auth-errors.ts` (codes and copy)
- `src/features/auth/password-step.tsx`, `use-sign-in.ts`; `src/routes/_auth/sign-in.tsx`
- `src/components/session-expired-dialog.tsx`
- `src/components/shell/user-menu-panel.tsx`, `more-sheet.tsx`, `two-step-banner.tsx` (new), `app-shell.tsx` (banner, offer)
- `src/components/errors/shell-route-error.tsx` — setup sheet over the page
- `src/features/shell/use-shell-actions.ts` — ⌘K actions
- `src/features/organization/profile/security-card.tsx` (new), `organization-page.tsx`, `organization-queries.ts`
- `src/features/team/member-sheet.tsx`, `team-confirms.tsx`; `src/features/roles/roles-table.tsx`, `two-step-field.tsx`
- `scripts/bundle-check.mjs` — forbidden list
- `package.json` — `@better-auth/passkey` 1.7.28
- `e2e/support/webauthn.ts` (new), specs in §10

### Repo
- `.env.example` — `GEOIP_DB_PATH`, rpID note; `docs/RUNBOOK.md` (devops) — monthly DB-IP refresh

## 10. Tests

### Service (Vitest, real Postgres, `withRollback`)
- **Gate:** table test of `twoStepGate` for every row of §2 (role, reset, org before/after deadline, entered after switch, two-step on, nothing).
- **Middleware:** member procedure in grace works; after 7 days refused `two_step_setup_required`; a new session after the switch refused; switching into a requiring organization sets `organizationEnteredAt` and is then refused; Lekki (not required) works for the same person.
- **Turn off:** refused when a role requires it, when *another* organization's setting requires it (message names it), allowed after removal from the only requiring organization; refused without a code (`CODE_REQUIRED`); wrong code audited; 5 wrong codes → lock, email, every session deleted; backup code accepted and consumed.
- **Confirm password:** right → window set, `reauthenticatedUntil` ≈ now + 5 min; wrong → counted (10th locks and emails); per-person limit.
- **Update name:** trims, refuses hidden characters, audits before → after in every organization; `/update-user` answers 404 (disabled) for `name`, `image` and `companyName`.
- **Passkeys (oRPC):** rename/remove own; another person's id → `NOT_FOUND` with zero writes; rename refused when unavailable here, remove allowed; audit rows hold name only.
- **Reset two-step:** deletes passkeys, sessions, two-step in one transaction; metadata `passkeysRemoved`; a passkey sign-in afterwards fails (no passkey) and the race path (passkey kept by an injected row) is refused with `PASSWORD_RESET_REQUIRED`.
- **Organization setting:** owner turns on/off; admin `owner_only` with no write; no-op returns `changedByOther`; off emails every active owner; `organization.update` refuses the field (strict schema); `organization.security` counts active members only.
- **Team/roles/invitations:** `passkeyCount`; reset offered with passkeys and two-step off; `setup_required` under the setting; `requiredForEveryone`; preview says required.
- **Known devices:** first sign-in after verify-email and invitation acceptance sends nothing; a new cookie sends one alert; a known one updates `last_seen_at`; rows unseen 90 days are pruned.
- **Place:** fixture MMDB: Lagos IP → "Lekki, Lagos" style, foreign → "City, Country", private → null; missing file → null and one log line; the full IP appears nowhere in `sessions`, `audit_events` or the log capture.
- **Limit trigger:** 11th insert in SQL raises `PASSKEY_LIMIT`.

### Auth endpoint tests (`apps/api/src/auth/passkeys.test.ts`, through `app.request`)
Using `@simplewebauthn/server` test helpers is not enough for end-to-end signatures, so these build responses with a software authenticator (`apps/api/src/test/soft-authenticator.ts`: P-256 key via `node:crypto`, CBOR from `@levischuck/tiny-cbor`, already a transitive dependency; add it as a dev dependency of api):
- registration refused without confirmation (`REAUTH_REQUIRED`), when unavailable, at 10; refused when UV flag is 0; accepted with UV; default name set; client name ignored; `passkey.added` audited and alert sent.
- registration works on a 3-day-old "Keep me signed in" session after confirming (`freshAge: 0` pin).
- sign-in: works during a sign-in lock; refused with `PASSWORD_RESET_REQUIRED` (session row deleted); refused when unavailable everywhere; unknown credential → `PASSKEY_NOT_FOUND` mapped; challenge reused → refused; **no two-step challenge** (pins the plugin's behaviour, decision 0019); `x-vento-remember: 1` → persistent 30-day session, else 12-hour; `auth.signed_in` method `passkey`; `last_used_at` set.
- kill switch: stage `off` → authenticate options 404; passkeys rows untouched.
- `/passkey/list-user-passkeys`, `/update-passkey`, `/delete-passkey` → 404 (disabled).

### Isolation and guards
- `procedure-guard.test.ts`: the five new personal paths join `PERSONAL_PROCEDURES`; `organization.security` and `setTwoStepRequired` join the tab-guard walk automatically; `setTwoStepRequired` joins the all-companies walk.
- `organization-guard.test.ts` / isolation: `organization.security` of org A never counts org B's people; `setTwoStepRequired` from a tab showing B while the session is in A → `organization_changed`.
- Personal: Kemi's session cannot read, rename or remove Tunde's passkey or session (each `NOT_FOUND`, zero writes).
- `auth-schema.test.ts`: `passkeys` and `known_devices` have no `organization_id`; `passkey` model matches the plugin's schema.

### Component (Vitest + Testing Library)
`sign-in-card` (states: off, on, required by role / organization, ≤ 3 codes), `passkeys-card` (empty, list, limit, unsupported, unavailable hidden, required note), `sessions-card` (this device first, no sign-out on it, place missing), `name-field` (Enter, Esc, blur, invalid), `use-reauth` (window open skips; `REAUTH_REQUIRED` opens and retries once), `security-card` (owner vs admin read-only, both confirms, race toast), `two-step-banner` (last-day copy), `sections` (sales sees only My security, `/settings` lands there; owner sees divider), password step has `autocomplete="username webauthn"`.

### E2E (Playwright, Chromium)
**Virtual authenticator** (`e2e/support/webauthn.ts`):
```ts
const cdp = await page.context().newCDPSession(page)
await cdp.send('WebAuthn.enable')
const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
  protocol: 'ctap2', transport: 'internal', hasResidentKey: true,
  hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } })
// UV off: cdp.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified: false })
// Inspect: cdp.send('WebAuthn.getCredentials', { authenticatorId })
```
The authenticator belongs to the page's target, so the spec keeps one page for register → sign out → sign in. The origin is `http://localhost:<port>` (rpID `localhost`). Conditional UI (autofill) can't be driven reliably in headless Chromium: e2e uses the button; a component test pins the `autocomplete` value. WebKit and Firefox projects skip the passkey specs (no CDP).
- `e2e/auth/passkeys.spec.ts` (**J-ONB-04**): add a passkey from My security (Confirm it's you once), sign out, **Sign in with a passkey** → Home with no code; "Keep me signed in" honoured; UV off → refused with the message; removed passkey → refused; lock (10 wrong passwords) then passkey works; Session expired dialog → passkey.
- `e2e/settings/my-security.spec.ts` (**J-ONB-09**): sales agent opens My security from the user menu and `/settings` lands there; `/settings/team` 403; rename name; turn two-step on (4 clicks), new codes, turn off with code; change password (other device's next request → Session expired, using a second context); sign out one device and all others; passkey offer after password sign-in appears once and **Not now** sticks; axe at 375 px light and dark.
- `e2e/settings/require-two-step.spec.ts` (**J-ONB-10**): owner turns it on (confirm names people), Grace sees the banner and keeps working, sets up from the banner over the page; Grace's next sign-in forces setup; admin sees it read-only; turning off emails owners (dev mailbox); Roles shows "Required".
- `e2e/settings/manage-members.spec.ts` (**J-ONB-06**, extended): member with a passkey and two-step off gets **Reset two-step**; confirm says "their 1 passkey will be removed"; their passkey sign-in then fails.

## 11. New dependencies
| Package | Version | Where | Licence | Size | Why |
|---|---|---|---|---|---|
| `@better-auth/passkey` | 1.7.28 (exact; peer of `better-auth` 1.7.28) | api, web | MIT | 83 KB unpacked | The plugin itself; keeps WebAuthn inside Better Auth's sessions and hooks |
| ↳ `@simplewebauthn/server` | ^13.3.2 (13.3.3 today) | api (transitive) | MIT | 684 KB + `@peculiar/*` ASN.1/X.509 (MIT, ≈ 0.4 MB) | Verification |
| ↳ `@simplewebauthn/browser` | ^13.3.0 | web (transitive, lazy chunk) | MIT | 199 KB unpacked, ≈ 5 KB gz in the chunk | `navigator.credentials` wrapper |
| `mmdb-lib` | 3.0.5 (exact) | api | MIT | 36 KB, no dependencies | Reads the MMDB file; we need one lookup per sign-in, not `maxmind`'s cache |
| DB-IP IP to City Lite (data, not a package) | monthly | API host, `GEOIP_DB_PATH` | CC BY 4.0 (attribution link required) | 121 MB MMDB | Places (decision 0020) |

Peers `nanostores` 1.5.5 and `@better-fetch/fetch` 1.3.3 are already installed. `@better-auth/passkey` 1.7.28 was published on 24 Nov 2026; it's the only version matching our pinned `better-auth`, so pin it exactly and read its lockfile diff in review (risk R1).

## 12. Seed (`apps/api/src/db/seed.ts`, idempotent)
- **Aisha Bello**: one **display-only** passkey "iCloud Keychain · iPhone", added 20 days ago, last used yesterday, with a random credential id and a throwaway public key (a comment says it can't sign in; no real device holds its key). Shows the card, Team's "1 passkey" and the reset copy. Real passkey sign-in in demos: add one on your own device.
- **Lekki Partners Ltd**: **Require two-step for everyone** on, changed by Bisi Lawal 2 days ago. Femi Adeoye (sales, no two-step) sees the banner with 5 days left; a new sign-in as Femi forces setup. Vento Homes Ltd stays off, so the golden-thread logins aren't interrupted.
- Seed sessions get `organization_entered_at = created_at` and a `place` ("Lekki, Lagos") so the sessions card has something to show.

## 13. Build order
**Step 0 (backend, half a day, blocks both tracks):** shared schemas, contract, error codes and audit actions (§5); migration and schema (§3). The frontend codes against the contract with MSW-free fakes in component tests.

| Backend track | Frontend track |
|---|---|
| B1 Plugin config, disabled paths, `freshAge`, rate limits, availability helpers (§4.1, 4.7) | F1 Settings routing: guard moves, `security` section, divider, user menu, More, ⌘K (§8.1) |
| B2 `afterSignIn`, known devices, place lookup, session hook fields (§4.5, 4.8, 7.6) | F2 Page skeleton, name field, Sign-in card, sessions card against the contract (§8.2) |
| B3 Passkey before/after hooks, default names, limit trigger (§4.2–4.4) | F3 Dialogs: confirm, change password, turn on sheet, turn off, new codes (§8.2) |
| B4 Turn-off guard; wrong-password counting on signed-in endpoints (§4.6) | F4 Lazy passkey client, passkeys card, add/rename/remove, passkey offer (§8.3, 8.4) |
| B5 Personal procedures (§7.1); `me` and sessions changes | F5 Sign-in page and Session expired passkey paths; error mapping (§8.4) |
| B6 Gate, membership fields, middleware, `organizationEnteredAt` writes (§7.2) | F6 Banner, setup sheet over the page, `shell-route-error` change (§8.4) |
| B7 Organization setting procedures and emails; reset deletes passkeys; team/roles/invitations outputs (§7.4–7.7) | F7 Organization Security card, Team and Roles changes (§8.5) |
| B8 Seed | F8 bundle-check forbidden list, budget run |

Then: tester (service, auth endpoint, isolation, e2e with the virtual authenticator) → reviewer + ui-designer (My security at 375 px, dark) → **security agent audit** of §4 before the PR → docs → commit. `platform.passkeys` stays `internal` until the audit passes, then `pilot` (release plan).

## 14. Docs (in the same PR)
- Journeys J-ONB-04, 06, 09, 10 to `built` and matching the build; J-ONB-09 and 10 get help articles in `docs/help/` (`getting-started/my-security.md`, `require-two-step.md`).
- `SCREENS.md`: My security, dialogs, passkey offer, banner, Organization Security card, sign-in and Session expired rows → `built`. `CHANGES.md`: the spec's departures table, plus plan departures (questions 1, 3, 4, 5, 6).
- `DOMAIN.md`: done with this plan (spec's "Domain changes"); if plan question 3 is approved, the "Sensitive personal changes" rule becomes "adding a passkey asks for the password unless confirmed in the last 5 minutes; turning two-step on and making new backup codes always ask for it".
- Decision records 0019 and 0020 → *accepted*.
- `CHANGELOG.md`: My security, passkeys, require two-step for everyone, new security emails.
- `docs/RUNBOOK.md` (devops): fetch DB-IP Lite at deploy, `GEOIP_DB_PATH`, monthly refresh, memory note; the production host name is the passkey domain (decision 0019).
- Privacy notice (when written): "IP geolocation by DB-IP" credit.

## 15. Risks
- **R1 Brand-new plugin release.** `@better-auth/passkey` 1.7.28 is two days old. Pin exactly, read the lockfile diff, and keep our tests on its endpoint paths, body shapes and behaviours (no two-step challenge, UV enforcement, ownership) so an upgrade that changes them fails loudly.
- **R2 Plugin behaviours we rely on.** Session creation ignores `rememberMe` (we use the header); registration uses `freshSessionMiddleware` (we set `freshAge: 0`); authentication doesn't bind the challenge to a user (fine: discoverable credentials, and our after-hook runs every check). Each is pinned by a test in §10.
- **R3 Safari and user activation.** `addPasskey` fetches options before `navigator.credentials.create`; WebKit can refuse a create that isn't close enough to a tap. The Confirm dialog's **Continue** is the tap, and the options fetch is fast, but it needs a hands-on check on an iPhone and a Mac during the owner's review. Fallback: fetch options first, then show a one-tap "Use Face ID" button.
- **R4 Nested verify on turn-off** (§4.6). Calling the plugin's verifiers inside our before-hook re-enters our hooks; the `turn_off` mode keeps bookkeeping single. Fallback named in §4.6.
- **R5 Memory for the place database** (~120 MB resident once loaded). Fine on a 1 GB instance; if the host is smaller, devops swaps in the country file (decision 0020).
- **R6 Domain lock-in.** Passkeys are bound to the production host name; moving domains invalidates them (decision 0019). Choose the production host before `platform.passkeys` reaches `on`.
- **R7 Gate regressions.** The gate replaces `twoStepRequired` at three call sites; a missed site would let someone past the deadline or block someone in grace. The table test plus the middleware tests cover all three.
- **R8 Admin-reset race.** A passkey added between the reset's delete and commit can't happen (the person's sessions are deleted in the same transaction and registration needs a session), and the `passwordResetRequired` check on passkey sign-in guards anything else.

## 16. Plan questions (recommendations in bold)
1. **Name changes.** The spec says limit Better Auth's `/update-user` to `name`. It also accepts `image` and our `companyName` field and writes outside our transaction and audit. *Recommended:* **switch `/update-user` off entirely and change names through `account.updateName`** (audited in the same transaction). Nothing in the web calls it today.
2. **Passkey list, rename and remove.** *Recommended:* **through our oRPC procedures; switch the plugin's three endpoints off**, as 2a did for sessions. One place for audit, "not found" for someone else's id, and the alert email after commit. Registration and sign-in stay on the plugin's endpoints.
3. **"Confirm it's you" for turning two-step on and new backup codes.** Better Auth requires the password in those requests for anyone who has one, with no password-free path. *Recommended:* **those two always ask for the password (inside their own dialog, so the click counts in the spec hold), and a correct one opens the 5-minute window**; the window then skips the question for adding a passkey. The alternative, re-implementing backup-code generation outside Better Auth, means copying its encryption internals.
4. **Removed vs unknown passkey message.** The spec has both "That passkey was removed" and, for unknown *or removed*, "That passkey isn't recognised". Telling them apart needs a record of removed keys. *Recommended:* **one message, "That passkey isn't recognised. Sign in with your password."**, no extra table.
5. **Masked IP format.** The spec shows "IP 102.89.••.14"; 2a stores only the first three parts ("102.89.34.x") and never the last. *Recommended:* **show what's stored, as "IP 102.89.34.x"**. Showing the last part would mean storing more of the address.
6. **DB-IP credit.** DB-IP asks for a link on pages that show its results. *Recommended:* **a muted "IP geolocation by DB-IP" link at the foot of *Where you're signed in*, plus the privacy notice.**
7. **Place database size.** *Recommended:* **the city database (121 MB, kept in memory after the first sign-in)**; if the host's memory is tight, the country-only file and "Nigeria" instead of "Lagos". Devops confirms the instance size.
8. **Organization setting procedure.** *Recommended:* **its own procedure, `organization.setTwoStepRequired` (owners), not a field on `organization.update`** (which admins can call). The update input stays strict so it can't sneak in.
9. **Forced setup flag.** The spec's notes say reuse `users.twoStepSetupRequired`. That flag is per person, so it would force setup in *every* organization, against the multi-organization rule. *Recommended:* **don't set it; compute the requirement from the organization setting and the session's entry time** (§2). The flag keeps meaning "an admin reset you".
10. **Who counts in "9 of 12 people have two-step on".** *Recommended:* **active members only**; pending invitations are told at acceptance.
11. **Wrong passwords while signed in** (Confirm it's you, Change password, turning two-step on or off, new codes). *Recommended:* **count towards the 10-in-15-minutes lock; at the 10th, sign-in is locked and emailed and further confirmations are refused, but this session isn't ended** (5 wrong *codes* on turn-off do end every session, per the spec).
12. **The passkey offer's "no passkey on this device" check.** The browser can't tell us which passkeys it holds without a prompt. *Recommended:* **offer once per device per person (remembered locally), and only to someone whose passkey list has none named for this kind of device** ("· Mac" on a Mac). Simple, and wrong at worst by one dismissible dialog.
13. **Turning the setting on: email the people without two-step?** The spec sends no email (banner and next sign-in do the telling). *Recommended:* **no email**; it would be one more unread message, and the banner is in front of them on their next visit.
14. **Seeded passkey.** A seeded key can't sign in because no device holds it. *Recommended:* **seed one display-only passkey for Aisha** so the card and Team look real in demos, clearly commented; e2e registers its own with the virtual authenticator.
