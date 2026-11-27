# Plan: Vento Real Estate console, slice 1 (console core)

- **Status:** built on `feat/admin-console` (shared 3444e03, screens 40bdcd6, API e4ab676, break-glass 04b2c85; docs with the e2e specs), awaiting review, the security audit and merge. Approved by the owner on 26 Nov 2026, with both §16 recommendations: `@simplewebauthn/server` and `/browser` imported directly for passkey re-proof, and the Projects column and limit hidden until the projects module counts them.
- **Spec:** [docs/specs/admin-console.md](../specs/admin-console.md) (approved 26 Nov 2026; its "Owner's decisions" are final and not reopened here)
- **Builds on:** [feature-flags](feature-flags.md) (operations, previews, audit, snapshot) and [my-security](my-security.md) (passkeys, in-process code checks, session fields)
- **Journeys:** J-ADM-01, J-ADM-02 (changed: console first, commands as break-glass), J-ADM-03 (new). J-ADM-04 and J-ONB-11 are slice 2 and not planned here.
- **Branch:** `feat/admin-console`, cut from `main` after brick 3d (#8). One branch; §14 splits it into reviewable steps. The **security** agent audits it before the pull request opens (sign-in, console window, passkey check, break-glass).
- **Decision record:** new **0021 · The console is a separate area on the same origin, behind fresh two-step** (full text in §15). It updates the trust-model section of 0015.
- **Domain:** `realestate.ventoerp.com/console` (host renamed in 1b, decision 0022). Restricting super-admins to an email domain is deferred (owner's decision 8). *(1b: super-admins are staff accounts that join by invitation, decision 0023; slice 1's "any existing account with two-step on" no longer holds.)*
- **Written by:** the architect agent on 26 Nov 2026, against `feat/admin-console` at `af849c1` (oRPC 1.16.5, Better Auth 1.7.28 with `@better-auth/passkey` 1.7.28, TanStack Router 1.170, Drizzle 0.45)

## Summary (plain English)
Vento staff get one place, **`/console`**, to do everything the `pnpm flags | plans | superadmin` commands do today, signed in as themselves.

- **Who can get in:** only active super-admins with two-step on. To everyone else, `/console` simply doesn't exist: they get the normal *Not found* page, and their browser never downloads any console code.
- **How they get in:** from the user menu or ⌘K (**Vento console**). If they proved a passkey or an authenticator code in the last 5 minutes (for example, they just signed in), the console opens at once. Otherwise *Confirm it's you* asks for a passkey or a code; the password alone is never enough. The console then stays open on that browser for **15 minutes without console activity or 8 hours**, whichever comes first. If it closes mid-change, the same dialog appears over the page, and the change goes through after the proof, with the typed reason kept.
- **What they can do:** see every organization (plan, trial, add-ons, overrides, and for every feature *why* it is or isn't available), change a plan, start or end a trial, add AI or change its budget in one step, change a release group, add or clear an override, move a feature through its stages or switch it off for everyone, publish a new plan version, add or remove super-admins, and read Vento's activity trail.
- **Same rules as the commands:** every change calls the same function the command calls, shows the same preview lines and warnings, needs a reason, and writes the same audit entries; customers still read "Vento moved your organization to Growth". If two staff change the same thing at once, the second is told who changed it and asked to check again. A dropped connection never applies a change twice.
- **No more `--by`:** the activity trail records the signed-in person, plus "console · Chrome on Mac · 102.89.34.x" (device and masked network). The commands stay only as **break-glass**: they refuse unless run with `--break-glass`, and every break-glass change emails all other super-admins at once.
- **New code we depend on:** the WebAuthn library the passkey plugin already uses (`@simplewebauthn/server` and `/browser`, MIT, already in the lockfile), now imported directly so a passkey can confirm "it's you" without starting a new sign-in. See §12 and question 1.

---

## 1. Summary (technical)
- **Schema (`0011_console`, generated, additive):** `sessions` gains `second_factor_at`, `console_opened_at`, `console_active_at`; `platform_audit_events` gains `channel` (`console | command | scheduled`, nullable for pre-console rows) and `idempotency_key` (partial unique); `platform_admins` gains `last_console_at`. No new tables.
- **Fresh second factor:** Better Auth records nothing about *which* factor made a session. We stamp `sessions.second_factor_at` whenever a code, backup code or passkey is verified (sign-in, two-step set-up, and the console's *Confirm it's you*). `reauthenticatedAt` (password only) never opens the console.
- **Console window:** two columns on the session, checked in memory from the session Better Auth already loads. One `UPDATE sessions` by primary key per console request records activity.
- **API:** a separate contract, `@vento/shared/console` (a package subpath, so the customer bundle can't import it), implemented as `router.console` on the same `/rpc` handler. Every console procedure is built on `consoleWindow` = `authed → superAdmin → consoleWindow → platformErrors`, never on `member`. `console.access.*` (status, open, passkey options, confirm) is built on `superAdmin` without the window.
- **Operations reused:** `apps/api/src/platform/operations/*` stays the single implementation. It gains shared `preview*` functions for every change (the CLI prints the same lines), an optional `expected` before-state checked under the row lock, `PlatformActor.channel` and `idempotencyKey`, and the new `changeAddOnBudget`. `CommandError` becomes `PlatformError` with a kind (`refused | stale | not_found`) and an optional `next` step, so no operation message names a command flag.
- **Break-glass:** change commands refuse without `--break-glass`; with it they run as today, tagged `channel: command`, and email every other active super-admin. A parity registry maps every change command to its console procedure; the parity test fails if one is missing or writes different audit rows.
- **Web:** a root-level route `src/routes/console.tsx` whose `beforeLoad` (in the main chunk, importing only `meQuery`) throws the standalone 404 unless `me.console` is set; everything else under `/console` is split and lazy, with its own shell, its own oRPC client (no tab-organization header) and a link interceptor that opens *Confirm it's you* and retries. Customers' Home first load does not change (bundle check gains forbidden paths).
- **Customer side:** `account.me` gains `console` (null unless an active super-admin) and `nextStep: 'console'` for a super-admin with no organization; user menu and ⌘K entries; My security shows "Required because you're a Vento super-admin".

## 2. Domain model

```
User ─0..1─ PlatformAdmin (active row: revoked_at null)          + last_console_at
 └─1─* Session  + second_factor_at   (last passkey / code / backup-code proof on this session)
                + console_opened_at  (window opened)  + console_active_at (last console request)
PlatformAuditEvent  + channel (console | command | scheduled; null = before the console)
                    + idempotency_key (one per confirmed change)
Organization ── facts only in slice 1: owner name and email, counts, dates, plan rows
```
**Ownership:** nothing new is organization- or entity-scoped. Session columns belong to a person (identity, decision 0010); platform columns are platform configuration (decision 0015). No permission is limited by entity or project: the console has no organization context at all, and an organization is always named by ID in the input.

### Console window (per session)
```
            proof ≤ 5 min old (open)  or  confirm(passkey | code | backup code)
  closed ─────────────────────────────────────────────────────────────────▶ open
    ▲  ▲                                                                      │ console request
    │  └── 15 min since console_active_at, or 8 h since console_opened_at ◀───┤ (active_at = now)
    │        (decided at read time, no write)                                  │
    └── revoked (op clears console_opened_at on all their sessions) ◀─────────┘
  gone: sign-out, session expired or revoked (row deleted); two-step reset (checked per request)
```
```ts
// apps/api/src/access/console-window.ts (pure)
consoleWindow(s, now):
  s.consoleOpenedAt == null                                  → closed
  now − s.consoleOpenedAt ≥ CONSOLE_MAX_MS (8 h)             → closed
  now − (s.consoleActiveAt ?? s.consoleOpenedAt) ≥ 15 min    → closed
  otherwise → open { closesAt: min(openedAt + 8 h, activeAt + 15 min) }
proofIsFresh(s, now) = s.secondFactorAt ≠ null ∧ now − s.secondFactorAt ≤ 5 min
```

### A console change
```
preview(input) ─▶ { lines, expected }      (same preview* function the command prints)
apply(input + expected + reason + idempotencyKey)
   ├─ key already used by this person ─▶ replay: same message, nothing written
   ├─ state ≠ expected (checked under the lock) ─▶ stale: CONFLICT "Sales moved to pilot a moment ago (by Ada)…"
   ├─ operation refuses ─▶ refused: CONFLICT with the operation's own message (+ next step)
   └─ applied ─▶ one platform audit row (channel console) + org notice where the CLI writes one
```

### Super-admin
```
none ──add (target has two-step on)──▶ active ──remove (by another super-admin)──▶ revoked ──add──▶ active
```

### Invariants
- **DB:** `platform_audit_events_idempotency_unique` partial unique on `idempotency_key where idempotency_key is not null`; CHECK `channel is distinct from 'console' or actor_user_id is not null` (a console change always has a person); existing `platform_admins_user_active_unique` (one active row per person); append-only triggers on `platform_audit_events` unchanged.
- **Service:** console procedures carry no organization from the session; the tab-organization header is ignored. `second_factor_at` is written only after a verified passkey, TOTP or backup code; never by a password (test pins it). A super-admin can't remove themselves, so one always remains. Adding needs two-step on the target. Two-step can't be turned off while someone is a super-admin. Every change needs a reason (trimmed, 3–500 characters).

## 3. Database

### Migration `0011_console` (generated)
| Table | Column | Type | Notes |
|---|---|---|---|
| `sessions` | `second_factor_at` | timestamptz null | last verified passkey, code or backup code on this session |
| | `console_opened_at` | timestamptz null | window opened (8-hour limit) |
| | `console_active_at` | timestamptz null | last console request (15-minute idle) |
| `platform_audit_events` | `channel` | `platform_channel` enum null (`console`, `command`, `scheduled`) | null = written before the console; read as `scheduled` when `actor_name = 'Vento (scheduled)'`, else `command` |
| | `idempotency_key` | uuid null | partial unique `platform_audit_events_idempotency_unique` |
| | – | – | index `platform_audit_events_actor_idx (actor_user_id, created_at desc)` for Activity's person filter; CHECK above |
| `platform_admins` | `last_console_at` | timestamptz null | "Last console activity" on Super-admins; written at most once a minute |

**Better Auth fields:** add `secondFactorAt`, `consoleOpenedAt`, `consoleActiveAt` to `authSessionFields` (`packages/shared/src/auth/fields.ts`), all `input: false`, **no `defaultValue`** (same reason as `persistent`: a default would overwrite a rotated session). Update `auth-schema.test.ts`.

**Migration safety**
- Additive and nullable: no rewrite, only the brief `ALTER` lock. Old code ignores the columns.
- `platform_audit_events` is append-only: no backfill (an `UPDATE` would hit the trigger and rewrite history). Pre-console rows keep `channel` null and are labelled at read time (above).
- `ALTER TABLE … ADD COLUMN` fires no row trigger, so the append-only triggers don't block the migration. `vento_app` keeps only `SELECT, INSERT` on the table (RUNBOOK §1).
- No custom SQL migration is needed.

## 4. Sign-in, the fresh second factor and the window

### 4.1 What Better Auth records today, and what we add
| Moment | Today | Added |
|---|---|---|
| Password sign-in, no two-step | session created; `reauthenticatedAt = now` | nothing (`second_factor_at` stays null) |
| Code or backup code at sign-in (`/two-factor/verify-totp`, `/verify-backup-code`) | session created; `reauthenticatedAt = now` | `second_factor_at = now` in `databaseHooks.session.create.before` |
| Passkey sign-in (`/passkey/verify-authentication`) | session created; `reauthenticatedAt` null | `second_factor_at = now` |
| Two-step set up (verify in setup mode, session rotated) | rotated session carries fields | `second_factor_at = now` (a valid code was just entered) |
| Change password (rotated) | carries `place`, `reauthenticatedAt` | carries `second_factor_at`; **not** the console window (`console_*` null: re-prove) |
| `account.confirmPassword` | `reauthenticatedAt = now` | nothing: a password never opens the console |
| Console *Confirm it's you* | – | `second_factor_at = now`, `console_opened_at = console_active_at = now` |

Rule in code (`auth.ts`): a path set `SECOND_FACTOR_PATHS = {'/two-factor/verify-totp', '/two-factor/verify-backup-code', '/passkey/verify-authentication'}` next to `PASSWORD_SIGN_IN_PATHS`.

### 4.2 Policy constants (`apps/api/src/auth/policy.ts`)
`CONSOLE_PROOF_FRESH_MS = 5 min` · `CONSOLE_IDLE_MS = 15 min` · `CONSOLE_MAX_MS = 8 h` · `CONSOLE_ADMIN_ACTIVITY_WRITE_MS = 1 min` (for `platform_admins.last_console_at` only; `console_active_at` is written on every console request, so the 15 minutes are exact). These are security policy approved by the owner (decision 6), so they live in code like the session rules.

### 4.3 Confirming it's you in the console (`apps/api/src/platform/console/access.service.ts`)
- **Code or backup code:** reuses the turn-off guard's in-process check. Extract from `auth/hooks/turn-off-guard.ts` into `apps/api/src/auth/second-factor.ts`: `verifyCodeInPlace(deps, headers, input)` (calls `api.verifyTOTP` / `api.verifyBackupCode({ disableSession: true })` with the request headers; with a live session neither makes a session), `twoStepLockedUntil`, `recordWrongCode` and `onWrongCodeLock` (lock, delete every session, email, as today). `requestScope().auth.twoStepMode` value `'turn_off'` becomes `'in_place'` so our verify hooks stay out of both callers. Five wrong codes in a row lock sign-in exactly as on the sign-in page (DOMAIN access rules); a wrong code writes `auth.two_step_failed` with `during: 'console'`.
- **Passkey, without a new sign-in:** the plugin's `/passkey/verify-authentication` always creates a session (checked in `@better-auth/passkey` 1.7.28: `internalAdapter.createSession` then `setSessionCookie`), which would rotate the cookie under every open tab, add a second "device" to My security and write a second `auth.signed_in`. So the console verifies the assertion itself with the same library and settings:
  - `console.access.passkeyOptions`: `generateAuthenticationOptions({ rpID, allowCredentials: this person's passkeys, userVerification: 'required', timeout: 60 s })`; the challenge goes into Better Auth's `verifications` table as `console-passkey:{sessionId}`, 2 minutes. NOT_FOUND when `platform.passkeys` is switched off (`passkeysSwitchedOff`) or the person has no passkey.
  - `console.access.confirm({ method: 'passkey', response })`: consume the challenge (delete … returning), find the credential **by id and user id**, `verifyAuthenticationResponse` with `expectedOrigin`/`expectedRPID` from the new `apps/api/src/auth/webauthn-settings.ts` (also used by the plugin config, so they can't drift) and `requireUserVerification: true`; update `counter` and `last_used_at`; on a counter failure run the existing `reportSuspectedClone` (exported from `passkey-hooks.ts`). A failed passkey never counts towards a lock (owner's decision in 3d).
- **Then:** `UPDATE sessions SET second_factor_at = now, console_opened_at = now, console_active_at = now WHERE id = session.id`, account audit `console.opened` (method), return the status.
- **Rate limit:** `rateLimiter.hit('console-confirm:' + userId, 10)` a minute, on top of the lock.

### 4.4 Where it's enforced (`apps/api/src/access/console-middleware.ts`)
```
os (implement apiContract)
 → authedMiddleware          UNAUTHORIZED as everywhere (session expired → the Session expired dialog)
 → superAdminMiddleware      1 query: platform_admins (revoked_at null) ⋈ users.two_factor_enabled
                               no row → NOT_FOUND (plain, no data)
                               two-step off → NOT_FOUND { reason: 'console_two_step_required' }
   ── console.access.* stop here (status reports the two-step state instead of refusing) ──
 → consoleWindowMiddleware   consoleWindow(session, now) in memory (fields from getSession, no query)
                               closed → NOT_FOUND { reason: 'console_window_closed' }
                               open → UPDATE sessions.console_active_at; platform_admins.last_console_at (≤ 1/min)
 → platformErrorsMiddleware  PlatformError → ORPCError (§6.1), so handlers have no try/catch
 → handler                   context: { user, session, admin: { userId, name }, actor: PlatformActor }
```
- The reasons on NOT_FOUND are only ever given to an active super-admin, who already knows they are one; customers and revoked super-admins get the plain NOT_FOUND, indistinguishable from a missing record.
- Anonymous callers get UNAUTHORIZED like every non-public procedure (the existing walk expects 401). That is what lets a super-admin whose session ended mid-task get the *Session expired* dialog. On the web, `/console` still shows *404* to signed-out people (§9.1).
- **Revocation:** `revokeSuperAdmin` sets `console_opened_at = null` on all the person's sessions in the same transaction; the middleware's per-request lookup refuses them anyway. Their customer sessions carry on.
- **Two-step reset** of an active super-admin by a customer owner or admin (`members.resetTwoStep`) is **refused** ("Vento staff reset two-step with Vento."), changed after the security audit: a reset followed by a fresh set-up would otherwise let whoever controls the inbox open the console. New backup codes and new passkeys for a super-admin also need a code or passkey proven in the last 5 minutes (`SECOND_FACTOR_REQUIRED`), and an authenticator code is accepted only once (migration `0012_second_factor_guards`).

### 4.5 Super-admins with no organization, and two-step that can't be turned off
- `account.me.nextStep` (`account.service.ts`, `nextStepFor`): no membership and an active super-admin → `'two_step_setup'` when two-step is off, else `'console'` (new value; web path `/console`). Everyone else unchanged.
- Passkey sign-in (`afterPasskeySignIn`): "no active membership" refuses only when the person is also not an active super-admin. `passkeysAvailableForUser` returns true for an active super-admin unless the kill switch is on.
- `firstTwoStepRequirement` (`auth/security-store.ts`) checks `platform_admins` first and returns `{ reason: 'super_admin', organizationName: 'Vento', roleName: null }`. `twoStepRefusal` → "Two-step is required because you're a Vento super-admin, so it can't be turned off."; `twoStepRequiredLine` → "Required because you're a Vento super-admin". The turn-off guard, My security and `me.twoStepRequiredBy` all read it, so no extra code path.
- Not in this slice: a super-admin with no organization can't reach My security (it lives in a workspace), so they manage passkeys from an organization or use the authenticator app. Follow-up in §16.

## 5. Contract (`packages/shared`)

### 5.1 Where it lives
- New subpath export in `packages/shared/package.json`: `"./console": "./src/console/index.ts"`. **Not** re-exported from `src/index.ts`: the customer web imports `@vento/shared`, so console schemas can't reach its bundle even by accident (bundle check, §11).
- `apps/api/src/api-contract.ts`: `export const apiContract = { ...contract, console: consoleContract }`; `apps/api/src/orpc.ts` implements `apiContract` instead of `contract`. The customer `Contract` type is unchanged.
- `ProcedureMeta` gains `area?: 'console'`. `src/console/contract.ts` defines `const staff = base.meta({ feature: null, area: 'console' })`; every console procedure is built from it (the walk in §8 checks both directions).

### 5.2 Shared pieces (`src/console/schema.ts`)
```ts
reason = z.string().trim().min(3, 'Add a reason so the activity says why.').max(500)
change = { reason, idempotencyKey: z.uuid() }
previewLine = z.object({ text: z.string(), tone: z.enum(['info', 'warning', 'danger']) })
previewOf = <E>(expected: E) => z.object({ lines: z.array(previewLine), expected })
done = z.object({ message: z.string() })                 // the toast; the operation's own sentence
aiBudget = money.refine(gt 0, 'Enter a monthly budget above ₦0')     // naira, decimal string
trialDays = z.number().int().min(1).max(90)              // "A trial lasts 1 to 90 days"
until = isoDate.optional()                               // server re-checks "today or later" in Lagos
limitValue = z.union([z.number().int().min(0).max(9_999_999), z.literal('unlimited')])
```
Each change is a pair `{ preview, apply }`: `preview` takes the fields and returns `previewOf(expected)`; `apply` takes the same fields plus `expected`, `reason` and `idempotencyKey`, and returns `done`.

### 5.3 Procedures (`consoleContract`)
| Procedure | Input | Output | Errors |
|---|---|---|---|
| **access** (on `superAdmin`, no window) | | | |
| `access.status` | – | `consoleStatus { window: 'open' \| 'closed' \| 'two_step_required', closesAt, freshProof: boolean, methods: { passkey: boolean } }` | NOT_FOUND (not an active super-admin) |
| `access.open` | – | `consoleStatus` (opens only when the last proof is ≤ 5 min old) | as above |
| `access.passkeyOptions` | – | `{ options: json }` | NOT_FOUND (no passkey, or passkeys switched off) |
| `access.confirm` | `{ method: 'code', code: /^\d{6}$/ } \| { method: 'backup_code', code } \| { method: 'passkey', response: json ≤ 8 KB }` | `consoleStatus` | BAD_REQUEST `wrong_code` / `passkey_failed`; TOO_MANY_REQUESTS (lock or rate) |
| **organizations** | | | |
| `organizations.summary` | – | `{ organizations, people, newThisMonth, onTrial, trialsEndingThisWeek, pilot, overLimit }` | – |
| `organizations.list` | `paginationInput + { filter: 'all' \| 'trial' \| 'pilot' \| 'internal' \| 'over_limit', search? }` | `paginated(orgRow)` sorted by last active | – |
| `organizations.get` | `{ id }` | `orgDetail` (header, plan card with limits and use and newer version, trial, add-ons, live overrides, ended count, release group) | NOT_FOUND |
| `organizations.features` | `{ id }` | `featureWhy[] { key, label, module, available, reason, overrideIds }` (every catalog feature) | NOT_FOUND |
| `organizations.endedOverrides` | `{ id }` | list (the collapsed "3 ended") | NOT_FOUND |
| `organizations.changePlan.{preview,apply}` | `{ organizationId, planKey, version? }` | expected `{ planVersionId: id \| null }` | CONFLICT `platform_refused` / `platform_stale` |
| `organizations.startTrial.{…}` | `{ organizationId, planKey, days }` | expected `{ trialId: null }` | same; refused carries `next: 'end_trial'` |
| `organizations.endTrial.{…}` | `{ organizationId }` | expected `{ trialId }` | same |
| `organizations.addAi.{…}` | `{ organizationId, budget }` | expected `{ addOnId: null }` | same; `next: 'change_ai_budget'` |
| `organizations.changeAiBudget.{…}` | `{ organizationId, budget }` | expected `{ addOnId, budget }` | same |
| `organizations.removeAi.{…}` | `{ organizationId }` | expected `{ addOnId }` | same |
| `organizations.changeReleaseGroup.{…}` | `{ organizationId, group }` | expected `{ releaseGroup }` | same |
| `organizations.setOverride.{…}` | `{ organizationId, kind: 'release' \| 'feature' \| 'limit', key, value: 'on' \| 'off' \| limitValue, until? }` | expected `{ overrideId: id \| null }` | same |
| `organizations.clearOverride.{…}` | `{ organizationId, kind, key }` | expected `{ overrideId }` | same |
| **releases** | | | |
| `releases.list` | `{ filter: 'all' \| 'off' \| 'internal' \| 'pilot' \| 'on' \| 'in_no_plan' }` | `{ items: releaseRow[], staleKeys: string[] }` (whole catalog, ~45 rows, not paginated) | – |
| `releases.get` | `{ key: featureKey }` | `releaseDetail` (stage, since/by/reason, needs, plans, holders by group, live overrides, last 10 changes) | NOT_FOUND |
| `releases.setStage.{…}` | `{ key, stage }` | expected `{ stage }` | CONFLICT |
| **plans** | | | |
| `plans.list` | – | `planRow[]` (latest version, organizations per version, default tag) | – |
| `plans.get` | `{ key }` | versions newest first with features, limits, organization counts | NOT_FOUND |
| `plans.publish.{…}` | `planDefinition` (existing zod: refuses core and add-on keys) `+ { isNew: boolean }` | expected `{ latestVersion: int \| null }` | CONFLICT |
| **superAdmins** | | | |
| `superAdmins.list` | – | `{ id, name, email, since, grantedByName, lastConsoleAt, isYou }[]` | – |
| `superAdmins.add.{…}` | `{ email }` | expected `{}` (the operation refuses duplicates) | CONFLICT (no account, no two-step, already one) |
| `superAdmins.remove.{…}` | `{ userId }` | expected `{}` | CONFLICT ("You can't remove yourself…") |
| **activity** | | | |
| `activity.list` | `paginationInput + { actorUserId?, organizationId?, featureKey?, kind?: 'release' \| 'plan' \| 'trial' \| 'add_on' \| 'override' \| 'super_admin', from?, to? }` | `paginated(activityRow { at, actorName, channel, operator, summary, organization, featureKey, change: 'internal → pilot', reason })` | – |
| `activity.people` | – | everyone who appears as an actor (for the filter) | – |

Every list is server-paginated with `{ items, page, pageSize, total }` except the two whole-catalog reads (releases, features), which are bounded by the catalog.

### 5.4 Changes to shared schemas
- `common/errors.ts`:
  - `NOT_FOUND.data`: `z.object({ reason: z.enum(['console_window_closed', 'console_two_step_required']) }).optional()`.
  - `conflictReason`: `platform_refused`, `platform_stale`; `CONFLICT.data` gains `next: z.enum(['end_trial', 'change_ai_budget']).optional()` (`changedByName` already exists).
  - `badRequestReason`: `wrong_code`, `passkey_failed`.
- `account/schema.ts`: `me.console: z.object({ twoStepOn: z.boolean() }).nullable()` (null unless an active super-admin); `nextStep` gains `'console'`.
- `account/security.ts`: `twoStepRequirement.reason` gains `'super_admin'`; `two-step-copy.ts` adds its two sentences.
- `audit/actions.ts`: `plan.add_on_changed` (organization trail, "Vento changed your AI budget to ₦250,000 a month") and `console.opened` (account trail).
- `auth/fields.ts`: the three session fields (§3).

## 6. Reusing the operations (`apps/api/src/platform/operations`)

### 6.1 `PlatformError` (rename of `command-error.ts` → `platform-error.ts`)
```ts
class PlatformError extends Error {
  constructor(message: string, readonly kind: 'refused' | 'stale' | 'not_found' = 'refused',
              readonly extra: { next?: 'end_trial' | 'change_ai_budget'; changedByName?: string } = {})
}
```
- CLI (`cli/run.ts`) prints `message` and, for `next`, its own step ("End it first with `plans trial "…" --end`.").
- Console (`platformErrorsMiddleware`): `refused` → CONFLICT `platform_refused` with the message and `next`; `stale` → CONFLICT `platform_stale` with `changedByName`; `not_found` → NOT_FOUND.

**Messages that name a flag today, reworded for both channels:**
| Where | Today | Operation now says | CLI adds |
|---|---|---|---|
| `common.findPlanVersion` | `No plan "x". Run plans list to see them.` | `No plan "x".` (`not_found`) | "Run plans list to see them." |
| `common.untilToExpiry` | `Write --until as YYYY-MM-DD…` / `--until must be today or later.` | "Write the end date as YYYY-MM-DD, e.g. 2027-01-31." / "The end date must be today or later." | – |
| `common.requireReason` | `Add --reason so the audit trail says why.` | moves to `cli/context.ts` (CLI only; the console uses the zod `reason`) | – |
| `plans.startTrial` days | `--days must be a whole number from 1 to 90.` | "A trial lasts 1 to 90 days." | – |
| `plans.startTrial` existing | `…already has a trial ending 2 Jan 2027. End it first with plans trial "…" --end.` | "Lekki Partners Ltd already has a trial ending 2 Jan 2027." `next: 'end_trial'` | "End it first with plans trial "…" --end." (console: **End trial** link) |
| `plans.startTrial` race | `…Run the command again.` | "…got a new override while the trial was being set up. Try again." | – |
| `plans.addAddOn` | `…already has AI. Remove it first to change it.` | "Lekki Partners Ltd already has AI." `next: 'change_ai_budget'` | "Remove it first with --remove." |
`grantSuperAdmin`'s bootstrap refusal and `NOT_SUPER_ADMIN` are reachable only from the CLI and keep their wording. A unit test greps every `PlatformError(` message in `operations/` for `--` and `Run ` and fails on a hit.

### 6.2 Shared previews (same lines in both channels)
New or extended in `operations/*`, each returning `PreviewLine[]` (the CLI prints `text`; the console colours by `tone`). Inline preview strings move out of `cli/flags.ts` and `cli/plans.ts` into these:
| Preview | Lines (in order) |
|---|---|
| `previewStage` (exists) | organizations by group; "in no plan" (warning); records that drop out of view (danger); "already at that stage" becomes a `refused` |
| `previewGroup` (new) | "moves from standard to pilot"; features gained and lost by name; internal warning |
| `previewReleaseOverride` (new) | the change; missing prerequisites (`missingPrerequisites`, exists); kill-switch note when the stage is `off` |
| `previewAssign` (extended) | the move; over a limit (exists); features gained and lost by name; records out of view; trial ends now (exists) |
| `previewTrialStart` / `previewTrialEnd` (new) | end date and "Owners get an email 7 days and 1 day before it ends" / features that stop and records out of view |
| `previewAddOn` / `previewAddOnBudget` / `previewRemoveAddOn` (new) | budget; "Owners can then switch AI features on in Settings → AI" / AI features that stop |
| `previewFeatureOverride` / `previewLimitOverride` / clear (new) | the change; prerequisites; what applies after a clear ("Projects limit goes back to Growth's 5") |
| `previewPublish` (new) | features added and removed vs the latest version; limits changed; "47 organizations stay on Growth v2 until you move them" |
| `previewGrant` / `previewRevoke` (new) | the change; on the fourth: "This is the fourth super-admin. The owner asked for a second approver from now on; that's not built yet." |
"Gained, lost, out of view" share one helper, `operations/impact.ts`: `simulate(snapshot, orgPlan, change)` builds the before and after `organizationAvailability` (the trick `previewStage` already uses), diffs `list()`, and counts lost features' records with `FEATURE_RECORD_COUNTERS`. Each preview also returns the `expected` value it was computed from.

### 6.3 Before-state, idempotency, attribution
- **`expected`:** each change operation takes an optional `expected` and compares it **after** taking its existing lock (`lockOrganizationPlan`, `feature_releases … FOR UPDATE`, the add-on or trial row `FOR UPDATE`, `plans … FOR UPDATE`). A mismatch throws `PlatformError(kind 'stale')` whose message is built from the newest platform audit event on that target by `describePlatformEvent`: "Sales moved to pilot a moment ago (by Ada). Check the preview and try again." The CLI passes nothing (unchanged behaviour).
- **Idempotency:** `PlatformActor` gains `idempotencyKey?`. `recordPlatformAudit` writes it, and `metadata.done` = the operation's return sentence. Before running an operation, the console looks the key up (`findByIdempotencyKey`): same person → return the stored message, nothing runs; another person → CONFLICT `platform_refused`. Two identical requests at once: the second hits `platform_audit_events_idempotency_unique`, its transaction rolls back, and it returns the stored result. Each operation writes exactly one platform audit row, so one key = one change.
- **`PlatformActor`:** `{ userId, name, channel: 'console' | 'command' | 'scheduled', operator, idempotencyKey? }`. The console builds it in `platform/console/actor.ts` from the session: `operator = "console · " + requestScope().userAgentSummary + " · " + requestScope().ipMasked`, i.e. "console · Chrome on Mac · 102.89.34.x" (our existing `maskIp`, see §16). The CLI sets `channel: 'command'` and keeps `operatorIdentity()`; `SCHEDULED_ACTOR` and `SETUP_ACTOR` get `scheduled` and `command`.
- **`describePlatformEvent(event)`** (`operations/describe.ts`): action + before/after → "Moved Sales to pilot", "Moved Lekki Partners Ltd to Growth v2", "Set projects limit to 8". Used by Activity, the stale message and the break-glass email subject, so all three say the same thing.

### 6.4 New operation: change the AI budget
`changeAddOnBudget(db, actor, { organization, addOn: 'ai', budget, reason, expected? })` in `operations/plans.ts`, one transaction:
1. `lockOrganizationPlan`; the active add-on row `FOR UPDATE` (none → refused "Lekki Partners Ltd doesn't have AI."; same budget → refused "AI is already ₦150,000 a month.").
2. Cancel the row (`cancelled_at = now`) and insert a new one with the new `limit_increases.ai_budget` and `starts_at = now`. Each row's terms never change, so billing later reads clean periods. The add-ons card shows "since" the current row's start.
3. **One** platform audit event `plan.add_on_changed` (before → after budget) and **one** organization notice "Vento changed your AI budget to ₦250,000 a month".

It's console-only: there's no new command (break-glass can still remove and add). The parity test is one-directional by spec (every command has a console procedure).

## 7. Commands after the console

### 7.1 Break-glass
- `cli/context.ts`: `parse` gains `break-glass` (boolean); `authorise(deps, parsed, command: ChangeCommandId)` refuses first, before `--by` and `--reason`: **"Make this change in the Vento console. If the console is down, add --break-glass."** With the flag it runs as today (`--by` an active super-admin with two-step on, `--reason`, confirm), with `channel: 'command'` and a generated `idempotencyKey`.
- **Needs `--break-glass`:** `flags stage | group | override`, `plans publish | assign | trial | trial --end | addon | addon --remove | override feature | override limit` (including `clear`), `superadmin grant | revoke`, and `plans bootstrap` **once any super-admin exists** (it publishes plans; on an empty environment it runs as today).
- **Unchanged:** `flags list | show`, `plans list | show`, `superadmin list`, `plans bootstrap` and `superadmin grant --bootstrap` on an empty environment, `plans notify-trials` from cron (`VENTO_CRON=1`, channel `scheduled`). A manual `notify-trials` keeps needing `--by` (it's the scheduled job's catch-up, not a change command).
- **Email** (`cli/break-glass.ts`): after the transaction commits, read the audit row by its key and send every **other** active super-admin "Sales moved to off from the command line" / "Ada Okafor moved Sales to off on api-1 at 21:14 on 26 Nov 2026. Reason: Receipt allocation bug. If you didn't expect this, check the Activity page." (`sendAll`, failures logged without addresses). The host comes from the operator string.

### 7.2 Parity registry (`apps/api/src/platform/cli/change-commands.ts`)
```ts
export const CHANGE_COMMANDS = {
  'flags stage':              { sample: ['stage', 'documents', 'pilot'], console: 'releases.setStage.apply' },
  'flags group':              { …, console: 'organizations.changeReleaseGroup.apply' },
  'flags override':           { …, console: 'organizations.setOverride.apply' },      // on | off
  'flags override clear':     { …, console: 'organizations.clearOverride.apply' },
  'plans publish':            { …, console: 'plans.publish.apply' },
  'plans assign':             { …, console: 'organizations.changePlan.apply' },
  'plans trial':              { …, console: 'organizations.startTrial.apply' },
  'plans trial --end':        { …, console: 'organizations.endTrial.apply' },
  'plans addon':              { …, console: 'organizations.addAi.apply' },
  'plans addon --remove':     { …, console: 'organizations.removeAi.apply' },
  'plans override feature':   { …, console: 'organizations.setOverride.apply' },
  'plans override limit':     { …, console: 'organizations.setOverride.apply' },
  'plans override … clear':   { …, console: 'organizations.clearOverride.apply' },
  'plans bootstrap':          { …, console: 'plans.publish.apply' },
  'superadmin grant':         { …, console: 'superAdmins.add.apply' },
  'superadmin revoke':        { …, console: 'superAdmins.remove.apply' },
} as const satisfies Record<string, { sample: string[]; console: ConsoleProcedurePath }>
export type ChangeCommandId = keyof typeof CHANGE_COMMANDS
```
`authorise` takes a `ChangeCommandId`, so a new change command can't refuse correctly without a registry entry, and the entry can't name a console path that doesn't exist (`ConsoleProcedurePath` is derived from the console router type).

## 8. Permissions and guards
| Procedure | Built on | Who | Limits |
|---|---|---|---|
| `console.access.*` | `superAdmin` (authed → super-admin) | active `platform_admins` row; `status` also answers a super-admin without two-step | none: no organization context |
| every other `console.*` | `consoleWindow` (authed → super-admin with two-step → window → errors) | active super-admin, two-step on, window open | organization only by ID in input; never from the session |
| `account.me` (`console`, `nextStep`) | `authed` (personal, unchanged) | everyone; `console` non-null only for active super-admins | – |
| customer procedures | unchanged | being a super-admin changes nothing | – |
| `pnpm flags/plans/superadmin` changes | CLI | `--break-glass` + `--by` active super-admin with two-step on + `--reason`; host access by devops | – |

There is one platform role (super-admin) with no module × action matrix: the spec rules out lesser platform roles in slice 1. No maker-checker: owner settled "no second approver below four super-admins".

**Walks (`apps/api/src/test/procedure-guard.test.ts` and `apps/api/src/platform/console-access.test.ts`):**
- The existing anonymous walk already covers `console.*` (401).
- The tab-guard walk excludes paths starting `console.`; the console walk checks the header is ignored.
- **Area walk:** every `console.*` path has `meta.area === 'console'` and `feature: null`; no other path has `area`.
- **Access walk**, for each console procedure:
  - customer owner of an organization → NOT_FOUND with no data, and a `countingDb` shows one `select` (the super-admin lookup) and no writes;
  - revoked super-admin → same;
  - super-admin without two-step → NOT_FOUND `console_two_step_required`;
  - super-admin with the window closed (never opened, idle 15 min + 1 s, opened 8 h ago) → NOT_FOUND `console_window_closed` with no writes (except `access.*`, which answer).

## 9. Web (`apps/web`)

### 9.1 Route tree and code-splitting
```
src/routes/console.tsx                       beforeLoad only in the main chunk; component split
src/routes/console/index.tsx                 Organizations (console home)
src/routes/console/organizations.$organizationId.tsx
src/routes/console/releases.index.tsx        src/routes/console/releases.$key.tsx
src/routes/console/plans.index.tsx           src/routes/console/plans.$planKey.tsx
src/routes/console/super-admins.tsx          src/routes/console/activity.tsx
src/routes/console/$.tsx                     404 inside the console shell
```
- `console.tsx` sits at the root, **not** under `_app`: `_app` binds the tab to an organization (decision 0013), runs `nextStep` redirects and previews, and none of those apply here.
- `beforeLoad`: `ensureQueryData(meQuery())`. UNAUTHORIZED → `throw notFound({ routeId: rootRouteId })` (standalone 404, not the sign-in page, as the spec asks). `me.console === null` → the same. Otherwise `return { me }`. This file imports only `meQuery` and router helpers, which are already in the main chunk. With `autoCodeSplitting`, `component`, `pendingComponent` and `errorComponent` live in split chunks that are never requested on a 404.
- Search params (chips, search, page, filters) are hand-validated as in `_shell.tsx` (no zod in the route file).
- **Console client** (`src/features/console/api.ts`): its own `RPCLink` to `/rpc` typed as `ContractRouterClient<{ console: ConsoleContract }>` from `@vento/shared/console`. No organization header. Interceptors: network failure → `connection.reportNetworkFailure()` (existing), UNAUTHORIZED → the existing Session expired flow (root `useSessionExpired`), NOT_FOUND `console_window_closed` → `consoleGate.prove()` (opens *Confirm it's you*), then calls `next()` once more with the same input (same idempotency key, so a retry can't apply twice), and `console_two_step_required` → the set-up state.
- **Preload:** the user-menu and ⌘K entries use `<Link to="/console" preload="intent">` and are rendered only when `me.console` is set, so only super-admins ever fetch the chunk.
- **Bundle:** `scripts/bundle-check.mjs` `FORBIDDEN` gains `features/console/`, `packages/shared/src/console/` and `@simplewebauthn/server`. Report Home's first load before and after (currently 190.0 KB of 200; the route tree adds about 0.3 KB of route stubs). Console route chunks stay within 80 KB each; the WebAuthn browser code loads only on **Use passkey**.

### 9.2 Shell (`src/features/console/shell/`)
- `console-shell.tsx`: navy sidebar (`bg-sidebar` tokens) with `VentoMark`, the fixed amber label **Vento staff · all customers** (warning tokens, visible at every width; on phones it sits in the top bar), and nav **Organizations · Releases · Plans · Activity · Super-admins**. No organization or company switcher, no customer modules, no checklist, no preview, no customer ⌘K.
- `console-mobile-tabs.tsx`: Organizations, Releases, Plans, More (sheet: Activity, Super-admins, Back to {organization}, Sign out). It reuses `components/ui/sheet.tsx` and the 3a tab styles.
- `console-user-menu.tsx`: name and email, **Back to {organization}** (from `me.organization`, only when set), theme (reuses `ThemeSegments`), **Sign out** (reuses `features/account/sign-out.ts`).
- Page titles: `usePageTitle` gains an option `{ suffix: 'Vento console', recent: false }`, giving "Organizations · Vento console" (the spec's "Vento console · {page}" order is flipped to match every other tab title in the app; logged in CHANGES).

### 9.3 Access gate (`src/features/console/access/`)
- `console-gate.tsx` (in the console layout): `access.status` → `open` renders the page; `closed` with `freshProof` → `access.open` silently (just signed in, no prompt); `closed` → *Confirm it's you* as a page-level card; `two_step_required` → "Set up two-step to use the Vento console." with **Set up two-step** (to `/settings/security` with the turn-on intent, `use-security-intent.ts`; `/two-step/setup` for a super-admin with no organization).
- `confirm-its-you-dialog.tsx`: title "Confirm it's you", "Use your passkey or a code from your authenticator app to open the Vento console.", **Use passkey** (shown when `methods.passkey`; WebAuthn via `@simplewebauthn/browser` `startAuthentication`, lazy) and **Use a code instead** (`components/auth/code-input.tsx`, with the backup-code toggle the sign-in page uses). Mid-task the dialog opens over the open sheet; the sheet keeps its fields and reason. Copy on expiry: "Your console session timed out. Confirm it's you to carry on. Your change is still here."
- Passkey cancel is silent (`isPasskeyCancel`); wrong code and lock reuse `lib/auth-errors.ts` copy.

### 9.4 The change pattern (`src/features/console/changes/`)
One component drives all 13 changes: `change-sheet.tsx` (fields → **Review**) → `preview-lines.tsx` (tones: info muted, warning amber, danger rose) → `reason-field.tsx` (label "Reason", helper "Kept in Vento's activity. The customer doesn't see it.", error "Add a reason so the activity says why.") → primary button naming the change ("Move Sales to pilot"), disabled until the reason is valid.
- `use-change.ts` creates the `idempotencyKey` (`crypto.randomUUID()`) when the confirm step opens and keeps it until success or close. It sends `expected` from the preview, keeps the dialog and reason on failure ("Couldn't reach Vento. Your change wasn't made. Try again."), and on `platform_stale` shows the message, refetches the page and the preview, and stays open. On `platform_refused` it shows the operation's message; `next: 'end_trial'` adds an **End trial** link that opens that sheet. On success: toast `message`, invalidate the console queries.
- Defaults: Change plan preselects the current plan and latest version ("Use an older version" under More options); Start trial preselects the next plan up and 30 days; AI prefills ₦150,000; Add override from a Features row is prefilled with kind and key.

### 9.5 Screens
| Screen (SCREENS.md §15 row) | Design | Built from | States |
|---|---|---|---|
| Console shell (sidebar, label, tabs, user menu) | [AdminOrgs](../design/claude-design/AdminOrgs.dc.html) sidebar | `VentoMark`, `ui/sheet`, 3a tab styles | – |
| *Confirm it's you* (console) and "Set up two-step…" | – pattern (My security dialogs) | `features/security/dialogs/dialog-frame.tsx`, `components/auth/code-input.tsx` | idle, verifying, wrong code, locked, passkey unavailable |
| Organizations list | [AdminOrgs](../design/claude-design/AdminOrgs.dc.html), [AdminOrgsMobile](../design/claude-design/AdminOrgsMobile.dc.html) (+Dark) | `PageHeader`, `StatCard` (filters on click), `FilterChips`, `SearchField`, team table and cards pattern (`features/team/team-table.tsx`, `team-cards.tsx`, `team-pagination.tsx`, `use-team-search.ts` for URL sync), `StatusBadge`, `EmptyState` | loading skeleton, empty "No organizations yet…", filtered empty with **Clear filters**, error |
| Organization detail (Plan, Trial, Add-ons, Overrides, Features "why", Activity) | [AdminOrgDetail](../design/claude-design/AdminOrgDetail.dc.html) (layout) | `ui/card`, `StatusBadge`, `FilterChips` (All · Available · Not available), `ui/dropdown-menu` | no plan (amber, **Choose a plan**), internal ("Internal: every feature, no limits"), over a limit (rose), no overrides copy |
| Organization change sheets and confirms (8 changes) | – | §9.4 | preview loading, stale, refused, network |
| Releases list and feature detail, stage control, **Turn off for everyone** | – needs-design (list and detail archetypes) | `FilterChips`, `ui/radio-group` as a segmented stage control, `ConfirmDialog` (destructive) for the kill switch | stale-keys banner, "Off for everyone since…" line |
| Plans list, plan detail, **Publish new version** (stepped sheet) | – needs-design | `ui/checkbox` grouped by module, `ui/input` with "Unlimited" `ui/switch`, §9.4 | review step diff, "New plan" (same sheet with key and name) |
| Super-admins | – pattern | team table pattern, `ConfirmDialog` | own row without **Remove**, the "fewer than 4" line |
| Activity | – pattern ([AuditLog](../design/claude-design/AuditLog.dc.html)) | table pattern, filters as `NativeSelect` and date inputs, rose **Command line** / slate **Console** `StatusBadge` | empty, filtered empty |
| User menu and ⌘K **Vento console**; My security super-admin line | – | `user-menu-panel.tsx` group under My security; `command-results.tsx` "Open Vento console" | – |
| Emails: break-glass, super-admin added and removed | – | `email/templates/layout.ts` | – |

**Design deviations** (to `docs/design/CHANGES.md`): the four in the spec, plus:
- The **Projects** column, the Projects limit line and "Projects" in **Over a limit** are hidden until the projects module registers `LIMIT_USAGE.projects` (no placeholder numbers; question 2).
- The tab title is "{page} · Vento console".
- The masked IP reads "102.89.34.x" (the product's one masking rule) instead of the spec's "102.89.••.14".

**Accessibility and layout:** WCAG 2.2 AA in light and dark, usable at 375 px (cards below `md`), focus returns to the trigger after each sheet, the kill switch is always visible at the foot of feature detail (never in a menu), and every badge has text as well as colour.

### 9.6 API reads behind the screens (performance)
- `organizations.list`: one query: `organizations` ⟕ `organization_plans` ⟕ `plan_versions` ⟕ `plans`, plus lateral subqueries for the first owner (role key `owner`, earliest), active members, active entities, `max(members.last_active_at)` and the live trial. Search: `ilike` on name or owner email with `lib/like.ts` escaping. Paginate 25; `EXPLAIN ANALYZE` on 2,000 seeded organizations, p95 ≤ 200 ms.
- **Over a limit** (stat and chip): two grouped counts (members, entities) over all organizations plus `organizationAvailability` in memory per organization → id set → `inArray`. Fine to a few thousand organizations; revisit (materialised usage) beyond that.
- `releases.list`: snapshot plus `allOrganizationPlans` once, `holders()` per key in memory (45 keys × N organizations).
- **Facts only:** services select owner name and email, counts and dates. No query in `platform/console/` touches buyers, money, documents or KYC tables (a grep rule in `review-checklist`).

### 9.7 The "why" explainer (`apps/api/src/platform/explain.ts`)
`explainFeature(snapshot, orgPlan, key, now) → { available, reason }` walks the same order as `organizationAvailability`:
1. stage `off` → "Off for everyone"
2. not released: "At internal; this organization is standard" (or "At pilot…")
3. released by override: "Released through an override until 31 Jan 2027"
4. not entitled: "Not in Starter; in Growth and Enterprise" (latest plans) or "With the AI add-on"
5. entitled by a trial override: "From the Enterprise trial (ends 2 Jan 2027)"
6. prerequisite missing: "Needs Sales and Finance"
7. core: "Core: in every plan"
8. available through stage pilot or internal: "Early access (pilot)"; otherwise "In Growth" / "Internal organization"

`available` must equal `has(key)`: a test runs it against every row of the `availability.test.ts` truth table (spec acceptance).

## 10. Files

**packages/shared**
- `package.json`: `exports["./console"]`
- `src/console/index.ts`: exports contract and schemas (subpath only)
- `src/console/contract.ts`: `staff` builder (`area: 'console'`), `consoleContract`
- `src/console/schema.ts` + `schema.test.ts`: reason, change, preview, rows, details, status, confirm input
- `src/common/errors.ts`: `ProcedureMeta.area`, NOT_FOUND data, conflict and bad-request reasons, `next`
- `src/account/schema.ts`: `me.console`, `nextStep 'console'`
- `src/account/security.ts`, `src/account/two-step-copy.ts` + test: `super_admin`
- `src/audit/actions.ts`: `plan.add_on_changed`, `console.opened`
- `src/auth/fields.ts`: three session fields
- `src/auth/error-codes.ts`: console confirm codes for the web's copy map

**apps/api**
- `package.json`: `@simplewebauthn/server` `13.3.3` (exact, as the plugin)
- `drizzle/0011_console.sql` (generated) + `drizzle/meta`
- `src/db/schema/platform.ts`: `platformChannel` enum, two columns, index, CHECK; `platform_admins.last_console_at`
- `src/db/schema/auth.ts`: three `sessions` columns
- `src/api-contract.ts`: `apiContract`
- `src/orpc.ts`: implement `apiContract`; export `superAdmin`, `consoleWindow`
- `src/router.ts`: `console: consoleRouter`
- `src/access/console-window.ts` + test: pure window and freshness rules
- `src/access/console-middleware.ts`: `superAdminMiddleware`, `consoleWindowMiddleware`, `platformErrorsMiddleware`
- `src/access/middleware.ts`: `authenticate` maps the three session fields
- `src/access/context.ts`: `AuthSession` gains them
- `src/auth/policy.ts`: console constants
- `src/auth/auth.ts`: `SECOND_FACTOR_PATHS`, stamping and carry-over, plugin config from `webauthn-settings.ts`
- `src/auth/webauthn-settings.ts`: rpID, origin, user verification (one source)
- `src/auth/second-factor.ts` + test: code checks extracted from the turn-off guard; `verifyConsolePasskey`
- `src/auth/hooks/turn-off-guard.ts`: uses `second-factor.ts`
- `src/auth/hooks/passkey-hooks.ts`: no-organization super-admin allowed; export `reportSuspectedClone`
- `src/auth/passkey-availability.ts`: super-admin case
- `src/auth/security-store.ts`: `firstTwoStepRequirement` checks super-admin first
- `src/lib/request-scope.ts`: `twoStepMode 'in_place'`
- `src/platform/platform-error.ts` (renamed from `command-error.ts`; every import updated)
- `src/platform/platform-audit.ts`: `PlatformActor.channel/idempotencyKey`, `plan.add_on_changed`, `findByIdempotencyKey`
- `src/platform/super-admins.ts`: `activeSuperAdmin(db, userId)`, `otherSuperAdminEmails`
- `src/platform/explain.ts` + `explain.test.ts`
- `src/platform/operations/common.ts`: reworded messages, `assertExpected`, `staleError`
- `src/platform/operations/impact.ts` + test: simulate, gained, lost, out of view
- `src/platform/operations/describe.ts` + test: event → words
- `src/platform/operations/release.ts`: `previewGroup`, `previewReleaseOverride`, `expected`, `unknownKeysInData` (moved from `cli/flags.ts`)
- `src/platform/operations/plans.ts`: previews, `expected`, `changeAddOnBudget`, `previewPublish`
- `src/platform/operations/super-admin.ts`: previews, clear console windows on revoke, notices returned
- `src/platform/operations/notify-trials.ts`, `src/platform/seed-plans.ts`: actor channels
- `src/platform/operations/messages.test.ts`: no flag names in operation messages
- `src/platform/console/actor.ts`: actor from session and request scope
- `src/platform/console/access.service.ts` + test
- `src/platform/console/organizations.service.ts` + test
- `src/platform/console/releases.service.ts` + test
- `src/platform/console/plans.service.ts` + test
- `src/platform/console/super-admins.service.ts` + test (emails returned, sent after commit)
- `src/platform/console/activity.service.ts` + test
- `src/platform/console/console.router.ts`: wires procedures to services and operations (idempotency replay, `sendAll`)
- `src/platform/console-access.test.ts`: access walk, window, proof (spec-named path)
- `src/platform/console-parity.test.ts`: registry and audit-row parity
- `src/platform/cli/change-commands.ts`: the registry
- `src/platform/cli/context.ts`: `--break-glass`, `authorise(…, commandId)`, `requireReason` moved here
- `src/platform/cli/flags.ts`, `cli/plans.ts`, `cli/superadmin.ts`: registry ids, shared previews, break-glass email, help text
- `src/platform/cli/break-glass.ts`: email to other super-admins
- `src/platform/flags-cli.test.ts`, `src/platform/plans-cli.test.ts`: `--break-glass` in every change case; refusal cases
- `src/email/templates/platform-notices.ts` + cases in `templates.test.ts`: break-glass, "You're now a Vento super-admin", removed, notice to others
- `src/modules/account/account.service.ts`: `me.console`, `nextStepFor` for super-admins
- `src/test/router-client.ts`: session options `secondFactorAt`, `consoleOpenedAt`, `consoleActiveAt`; `consoleClientAs(db, user, { window: 'open' | 'closed' | 'idle' | 'expired' })`
- `src/test/factories.ts`: `createSuperAdmin({ revoked, twoFactorEnabled, organization })`
- `src/test/procedure-guard.test.ts`: exclude `console.*` from the tab walk; area walk
- `src/test/isolation.test.ts`: console reads of organization A never carry B's rows; facts-only JSON scan
- `src/test/e2e-fixtures.ts`: `super-admin <state>`, `age-console <email> idle|max`, `age-second-factor <email>`, `flag-stage <key> <stage>` (restore), `platform-activity <email>`
- `src/db/seed.ts`: super-admins `ada@ventoerp.com` (viewer in Vento Homes) and `tunde@ventoerp.com` (no organization, lands on the console)

**apps/web**
- `package.json`: `@simplewebauthn/browser` `13.3.0` (exact, as the plugin)
- `src/routes/console.tsx` and the nine `src/routes/console/*.tsx` files (§9.1)
- `src/features/console/api.ts`: client, interceptors, query keys
- `src/features/console/shell/{console-shell,console-sidebar,console-top-bar,console-mobile-tabs,console-more-sheet,console-user-menu,console-not-found}.tsx`
- `src/features/console/access/{console-gate,confirm-its-you-dialog,two-step-missing}.tsx`, `use-console-proof.ts`, `passkey-proof.ts` + tests
- `src/features/console/changes/{change-sheet,preview-lines,reason-field}.tsx`, `use-change.ts` + tests
- `src/features/console/organizations/{organizations-page,organizations-table,organizations-cards,organization-stats,organization-page,plan-card,trial-card,add-ons-card,overrides-card,features-card,activity-card}.tsx`, `use-organizations-search.ts`
- `src/features/console/organizations/sheets/{change-plan,start-trial,end-trial,ai-add-on,release-group,override,clear-override}.tsx`
- `src/features/console/releases/{releases-page,release-page,stage-control,kill-switch}.tsx`
- `src/features/console/plans/{plans-page,plan-page,publish-sheet}.tsx`
- `src/features/console/super-admins/{super-admins-page,add-super-admin-sheet}.tsx`
- `src/features/console/activity/{activity-page,activity-filters}.tsx`
- `src/components/shell/user-menu-panel.tsx`: **Vento console** group
- `src/features/shell/command-results.tsx`: "Open Vento console"
- `src/features/account/api.ts`: `NEXT_STEP_PATH.console = '/console'`
- `src/features/shell/use-page-title.ts`: `suffix` option
- `scripts/bundle-check.mjs`: forbidden paths
- `e2e/console/{access,organizations,releases,plans,super-admins}.spec.ts`
- `e2e/support/fixtures.ts`: super-admin and console helpers

**Root:** nothing new in `.env.example` or `turbo.json` (no new variables).

## 11. Tests

**Shared:** console schemas (reason trimming and length, budget > 0, days 1–90, `until` format, limit value); `two-step-copy` super-admin lines; `me` schema with `console`.

**API (Vitest, real Postgres, `withRollback`)**
| Area | Cases |
|---|---|
| Second factor (`auth/sign-in.test.ts`, `passkeys.test.ts`) | Password-only sign-in: `second_factor_at` null; code sign-in, backup-code sign-in and passkey sign-in: set; `account.confirmPassword` never sets it; change password carries it and clears the console window |
| Window (`console-window.test.ts`) | Truth table on a fake clock: never opened; 14:59 vs 15:00 idle; 7:59:59 vs 8:00:00 max; activity extends idle but not max; fresh proof 4:59 vs 5:01 |
| Access (`console-access.test.ts`) | The walk (§8) for every console path. `access.open` with a fresh proof opens it, with an old one doesn't. Confirm with a right code opens it and writes `console.opened`; a wrong code writes `auth.two_step_failed`, and the 5th locks, deletes sessions and emails (memory mailer). Backup code works once. Passkey: valid assertion opens it; another person's credential, a replayed challenge, an expired challenge, or a missing user verification are refused; passkeys switched off → `methods.passkey` false. Revoke closes the window on the next request and leaves customer procedures working. Two-step reset → `two_step_required`. The tab header is ignored |
| Explainer (`explain.test.ts`) | `available === has()` on every truth-table row; each of the 8 reasons pinned on a named row |
| Operations | `expected` mismatch → `stale` naming the last actor; replay with the same key → same message, one audit row; concurrent identical keys (two pool clients, committed) → one change; `changeAddOnBudget` writes one platform event and one notice, cancels and inserts; previews: gained and lost by name, out-of-view counts with a registered test counter, fourth super-admin note, publish diff; message grep (no `--`, no "Run ") |
| Console services | Organizations list: filters, search by owner email, sort by last active, owner shown and other members' names never present (JSON scan), over-limit after a downgrade; detail cards for no plan, internal, trial, AI, live and ended overrides; Releases: holders by group, in-no-plan, stale keys, off line; Plans: counts per version, "is available" after publish, publishing moves nobody; Super-admins: add refused for no account and no two-step, self-remove refused, emails to the person and the others; Activity: every filter, legacy rows labelled command or scheduled, channel console rows show operator |
| Parity (`console-parity.test.ts`) | Every registry path exists and is a console procedure. Each command's `sample` without `--break-glass` → exit 1, the refusal copy, no rows. Each command with `--break-glass` vs its console procedure on identical fresh fixtures → the same platform audit `action`, `target_type`, `target_key`, `before`, `after` and the same organization notice; channels `command` vs `console`; break-glass emails every other active super-admin and not the actor |
| Commands | Existing CLI tests gain `--break-glass`; `plans bootstrap` with super-admins needs it, without them doesn't; `notify-trials` from cron unchanged with channel `scheduled` |
| Customer side | `me.console` null for an owner, a revoked super-admin and anonymous; set for a super-admin; `nextStep` `console` and `two_step_setup` for a super-admin with no organization; a super-admin who is a viewer gets FORBIDDEN on `members.updateAccess` like any viewer; turn-off refused with the super-admin copy |
| Isolation | Console changes on organization A leave B's `me.features`, limits and audit trail untouched; the organization trail gets the plain sentence with actor "Vento", no staff name and no reason |

**Web units:** console gate state machine; `use-change` (key stable across retries, new after close, reason kept on failure, stale refetch); confirm dialog (code vs backup toggle, passkey cancel silent); preview tones; stage control; nav at 375.

**Playwright** (desktop and mobile unless noted; fixtures never touch stages used by other specs)
| Spec | Checks |
|---|---|
| `e2e/console/access.spec.ts` | Owner and revoked super-admin: no menu or ⌘K entry; `/console` and `/console/releases` → 404; **no console code loaded** (every JS response body is checked not to contain "Vento staff · all customers"). Signed out → 404. Super-admin signs in with a code → **Vento console** → opens without a prompt. `age-second-factor` → prompt → code. Virtual authenticator → **Use passkey**. `age-console idle` while a Start trial sheet is open → dialog over the sheet, reason kept, trial starts after the code. Super-admin with no organization lands on the console after sign-in. Two-step reset → "Set up two-step…". Label visible at 375. axe in light and dark |
| `e2e/console/organizations.spec.ts` | J-ADM-02: search "Lekki" → detail → Features **Not available** shows "Not in Starter; in Growth and Enterprise" (2 clicks); Change plan (4 clicks) with over-limit line; Start trial; Add override (projects 8); Change AI budget is one step; the organization's audit rows read "Vento moved your organization to Growth" (checked through a fixture read) |
| `e2e/console/releases.spec.ts` | J-ADM-01 on `analytics.board_pack` (desktop only, serial): stage to pilot in 3 clicks with the preview line; kill switch on `documents.contracts` (mobile, 4 taps); concurrent change from a fixture → the stale message; `flag-stage` restores both after |
| `e2e/console/plans.spec.ts` | Publish a new Growth version through the stepped sheet; the review diff and "stay on v… until you move them"; an organization on the old version shows "Growth v… is available" |
| `e2e/console/super-admins.spec.ts` | J-ADM-03: add Tunde (3 clicks), no **Remove** on your own row, remove Tunde; Activity filtered by person shows both with **Console** tags; a break-glass fixture row shows the rose **Command line** tag |

## 12. New dependencies
| Package | Version | Where | Why | Licence and size |
|---|---|---|---|---|
| `@simplewebauthn/server` | 13.3.3 (exact) | api | Verify a passkey for *Confirm it's you* without the plugin making a new session (§4.3) | MIT; already in the lockfile under `@better-auth/passkey`, so no new code is downloaded |
| `@simplewebauthn/browser` | 13.3.0 (exact) | web | `startAuthentication` with our own options | MIT; already in the lockfile; about 4 KB gzip, lazy in the console only |
Both are pinned to the versions the plugin resolves; Renovate groups them with `@better-auth/passkey`. RUNBOOK §7 (release age) is satisfied, since both have been in the tree since 3d.

## 13. Seed and fixtures
- Seed: `ada@ventoerp.com` (viewer in Vento Homes, super-admin, two-step and TOTP secret printed once, as today) and `tunde@ventoerp.com` (super-admin, no organization). Existing seed addresses on the old domain in docs move to `ventoerp.com`.
- e2e fixtures (§10) never change global stages except the two keys `releases.spec.ts` owns, which it restores.
- Production bootstrap (RUNBOOK §4) is unchanged; step 3 gains "then sign in at `/console` and confirm it opens before relying on it; the commands need `--break-glass` from now on".

## 14. Build order (reviewable steps)
Break-glass lands **last**, so there's never a moment when the commands refuse and the console can't yet do the change.

1. **Shared (½ day; blocks both tracks).** The console subpath, schemas, contract, error map, `me`, two-step copy, audit actions, session fields. Commit 1.
2. **In parallel:**
   - **Backend (4–5 days)**
     - B1. Migration, Better Auth fields, `second_factor_at` stamping and carry-over, `webauthn-settings.ts`; auth tests. *Commit 2.*
     - B2. `PlatformError`, reworded messages, `PlatformActor` channel and key, `describe.ts`, shared previews, `impact.ts`, `expected`, `changeAddOnBudget`. The CLI switches to the shared previews (CLI tests still green, no break-glass yet). *Commit 3.*
     - B3. Console middleware, `console-window.ts`, `second-factor.ts` extraction, `access.service.ts` (code, backup code, passkey), access walk. *Commit 4: security agent reviews this one early.*
     - B4. Services and router: organizations (with `explain.ts`), releases, plans, super-admins (with emails), activity; isolation. *Commit 5.*
     - B5. Customer side: `me.console`, `nextStepFor`, passkey sign-in and availability for super-admins, the super-admin two-step requirement. *Commit 6.*
     - B6. Seed and e2e fixtures. *Commit 7.*
   - **Frontend (4–5 days; works against B1–B4 types, with a mocked client until B4)**
     - F1. Route tree, `beforeLoad` guard, console client and interceptors, shell, bundle check. *Commit 8.*
     - F2. Access gate, *Confirm it's you* (code, backup code, passkey), mid-task retry.
     - F3. Organizations list and detail cards (Features "why").
     - F4. Change sheet pattern and the eight organization sheets.
     - F5. Releases list, detail, stage control, kill switch.
     - F6. Plans list, detail, publish sheet.
     - F7. Super-admins and Activity.
     - F8. Customer entries: user menu, ⌘K, `NEXT_STEP_PATH`.
     - *Commits 9–12, one or two features each.*
3. **Then (1–2 days).** Break-glass, the parity registry and tests, the break-glass email (*commit 13*); e2e specs (*commit 14*); docs (*commit 15*). Then reviewer, ui-designer (every console screen, at 375 and in dark) and the security audit; fixes; pull request.

If the owner prefers smaller PRs: PR A = steps 1, B1–B3, F1–F2 (console opens; nothing changes yet); PR B = B4–B6, F3–F8; PR C = break-glass, parity, e2e, docs.

## 15. Docs (the implementer commits these)
- **`docs/decisions/0021-the-console-is-a-separate-area-behind-fresh-two-step.md`** (text below), a row in `docs/decisions/README.md`, and 0015's section "Trust model until the console" renamed **"Trust model"**: "Host access stays limited to super-admins, but day-to-day changes need a real sign-in in the Vento console (decision 0021). The commands refuse changes without `--break-glass`; a break-glass change is attributed by `--by` and the operator as before and emails every other super-admin."
- **`docs/DOMAIN.md`:** exactly the spec's "Changes to DOMAIN.md" for slice 1 (add *Vento console*, *Break-glass change*; change *Vento super-admin* and *Platform audit event*; the *Console window* access rule). Slice 2 terms wait.
- **`docs/design/SCREENS.md` §15:** the slice-1 rows from the spec's table, replacing "Organizations list and detail…", "Feature flags: stage per flag…" and "Plans: contents, limits, versions"; status `built` as each lands; the §0 user-menu and My security rows mention the console line. **`docs/design/CHANGES.md`:** the deviations in §9.5.
- **`docs/journeys/12-vento-admin.md`:**
  - header trust paragraph → "signed in with fresh two-step";
  - J-ADM-01 and J-ADM-02 steps become the console flows (3 clicks for a stage, 4 for the kill switch and a plan change) with the commands as `--break-glass` fallback;
  - new J-ADM-03 (add and remove a super-admin, review activity);
  - **Test** lines: `e2e/console/releases.spec.ts`, `organizations.spec.ts`, `plans.spec.ts`, `super-admins.spec.ts`, `apps/api/src/platform/console-access.test.ts`, `console-parity.test.ts`;
  - the spec's assumptions (`/console`, 30 and 90 days, ₦150,000, 3 characters) recorded as settled;
  - status `built` when merged.
- **`docs/RUNBOOK.md`:** §3 (host access for break-glass only; `--break-glass` and the email; `VENTO_OPERATOR` still required); §4 step 3 as in §13; §1 note that `vento_app` still has only `SELECT, INSERT` on `platform_audit_events` after `0011`; deploy note for `0011` (additive).
- **`docs/ARCHITECTURE.md`:** layout (`platform/console/`, `access/console-*`, `@vento/shared/console`); request flow gains the console chain (§4.4); the commands row in Build and run gains break-glass; Data gains the new columns.
- **`docs/specs/README.md`:** admin-console `approved` → `in build`, then `shipped`.
- **`CHANGELOG.md` → Security:** "Changes Vento makes to your plan or features now require a Vento staff member's two-step sign-in and are recorded with who made them." (Customers see nothing else new.)
- **`docs/help/README.md`:** a line saying Vento-staff journeys (J-ADM-*) are documented in `RUNBOOK.md` and the journey file, not in the customer help centre, so there's no help article for them.
- **Skills:**
  - `add-module`: console procedures are built on `consoleWindow` from `@vento/shared/console`, never on `member`, and take the organization by ID;
  - `testing-patterns`: `consoleClientAs`, `createSuperAdmin({ revoked })`, and "console e2e restores any stage it changes";
  - `review-checklist`: grep that `platform/console/` never imports buyer, finance or document tables, and that every `console.*` path is on `staff`.

### Decision record 0021
```markdown
# 0021 · The console is a separate area on the same origin, behind fresh two-step

- **Date:** 2026-11-26
- **Status:** proposed

## Context
Vento super-admins change releases, plans, trials, add-ons, overrides and super-admins through commands on the API host, attributed by a typed `--by` email (decision 0015's trust model): anyone with a shell can type any super-admin's address, and a kill switch needs a laptop and host access. The owner approved a web console (docs/specs/admin-console.md) at realestate.ventoerp.com/console, on the web app's own origin so passkeys work there (decision 0019 binds them to that host), with its own shell, fresh two-step to enter, and the commands kept only for when the console is down.

## Decision
The console is a separate route tree (/console) in the same web app and a separate contract (`@vento/shared/console`, not exported from the package root) implemented as `router.console` on the same API. Every console procedure is built on its own chain (session, then an active super-admin with two-step on, then an open console window), never on `member`, carries no organization from the session, and names an organization only by ID in its input. To anyone who isn't an active super-admin every console procedure answers NOT_FOUND, and the web shows /console as 404 without downloading its code. Entering needs a passkey, an authenticator code or a backup code proven within the last 5 minutes (`sessions.second_factor_at`, never set by a password). The window lives on the session (`console_opened_at`, `console_active_at`) and closes after 15 minutes without console activity or 8 hours. A passkey proof is verified in place with the WebAuthn library the passkey plugin uses, so no new session is made. Console changes call the same platform operations as the commands, with the same previews and audit events, the before-state they were previewed against, and an idempotency key; the actor comes from the session and the platform trail records channel `console`, device and masked IP. Change commands refuse unless run with `--break-glass`, and every break-glass change emails all other super-admins.

## Consequences
- Every platform change is tied to a real two-step sign-in; `--by` remains only for break-glass, with other super-admins told at once.
- One deploy and one origin; passkeys work without a new relying-party decision. Customers never download console code (enforced by the bundle check and an e2e test).
- Each console request writes one session row (activity), which is cheap at staff volume.
- New console procedures must use the console builder; walk tests fail otherwise. Operation messages must not name command flags; each channel adds its own next step.
- A super-admin with no organization can use the console but can't manage passkeys until they join one (My security lives in a workspace).

## Alternatives considered
- A separate host name (admin.ventoerp.com): a second deploy, and passkeys would need a new relying party or related origins; rejected by the owner (decision 1).
- Putting the console inside the customer shell behind a role: mixes Vento staff power with customer workspaces and their tab guard, and ships staff code to customers.
- A per-action code instead of a window: safer per click but kills the 4-tap kill switch; confirmation dialogs with a reason are the per-action safeguard.
- Re-proving a passkey through the plugin's sign-in endpoint: always creates a new session, rotating the cookie under every open tab and adding a phantom device; verified in place instead.
- A `console_grants` table: gives a history of windows, but the account trail already records each opening, and columns on the session end with it at sign-out.
```

## Shared files touched (coordination with brick 4)
Brick 4 (approvals and audit) builds after this merges and edits some of the same files. Here is exactly what this plan changes in each one; everything else lives in new console files.

| File | This plan's change | Size |
|---|---|---|
| `packages/shared/src/audit/actions.ts` | Appends two actions to `AUDIT_ACTIONS`: `plan.add_on_changed` (organization trail, "Vento changed your AI budget to ₦250,000 a month") and `console.opened` (the person's account trail). Every other organization-side entry the console writes reuses an action already declared by feature flags (`plan.assigned`, `plan.trial_started`, `plan.trial_cancelled`, `plan.add_on_added`, `plan.add_on_removed`, `plan.feature_overridden`, `plan.limit_overridden`, `plan.override_cleared`, `release.group_changed`, `release.override_set`, `release.override_cleared`), so brick 4 can label them all from this file. Slice 2's "Vento support viewed your account" will be declared here too when slice 2 is planned. | 2 lines |
| `packages/shared/src/account/schema.ts` | `me.console` (nullable object) and `'console'` added to the `nextStep` enum | ~6 lines |
| `apps/api/src/access/middleware.ts` | `authenticate()` copies the three new session fields (`secondFactorAt`, `consoleOpenedAt`, `consoleActiveAt`) into `AuthSession`. No new middleware here: the console chain lives in the new `access/console-middleware.ts`, so brick 4's `requireOwner()` doesn't collide. | 3 lines |
| `apps/api/src/router.ts` | One key, `console: consoleRouter`. `PUBLIC_PROCEDURES` is unchanged. | 2 lines |
| `packages/shared/src/contract.ts` | **Not changed.** The console contract is the `@vento/shared/console` subpath; the server composes `apiContract` in the new `apps/api/src/api-contract.ts`. | – |
| `packages/shared/src/access/role-rules.ts` | **Not changed.** | – |
| `apps/api/src/platform/cli/main.ts` | **Not changed.** `--break-glass` is parsed in `cli/context.ts` and enforced in `authorise()`. | – |
| `apps/api/src/modules/audit/*` | **Not changed.** Organization notices keep going through `recordOrganizationNotice` → `recordAudit` as today. | – |

Other shared files this plan touches, all outside brick 4's list: `packages/shared/src/common/errors.ts`, `account/security.ts`, `account/two-step-copy.ts`, `auth/fields.ts`, `auth/error-codes.ts` and `package.json` (the subpath export). Whichever branch merges second rebases; the overlaps are append-only lines.

## 16. Risks, decisions and questions

**Owner's answers (26 Nov 2026): both recommendations approved.**
1. **Two direct dependencies for passkey re-proof.** *Recommended:* import `@simplewebauthn/server` and `/browser` directly (same versions the passkey plugin already pulls in; MIT; no new code downloaded) so a passkey can confirm it's you without a new sign-in. **Alternative:** no new dependency. The console's passkey path runs the plugin's sign-in again, which makes a second session on that browser: a duplicate entry under *Where you're signed in*, a second "signed in" audit row, and other open tabs switching session. Or ship code and backup code only and add passkeys later; the spec's 4-tap kill switch then needs a typed code whenever the window has closed.
2. **The Projects column and limit before the projects module exists.** The spec shows "Projects 3 of 5" and a Projects column, but projects aren't counted yet (`LIMIT_USAGE.projects` arrives with the module). *Recommended:* hide them until then, matching your "no placeholder numbers" rule. **Alternative:** show "0" (true but meaningless today).

**Decisions this plan makes (say if you disagree)**
- **Anonymous calls to console procedures get 401, not 404,** like every signed-in procedure. That's what lets a super-admin whose session ended mid-task get the *Session expired* dialog. The web still shows 404 at `/console` to signed-out visitors, and customers and revoked super-admins get 404 from every console procedure.
- **NOT_FOUND tells an active super-admin why** (`console_window_closed`, `console_two_step_required`), so the web can open *Confirm it's you* in one round trip. Nobody else gets a reason.
- **Opening the console is recorded in the person's own account trail** (`console.opened`), not on the Activity page, which stays a list of changes.
- **Changing the AI budget is console-only** (no new command). Break-glass can remove and add.
- **Changing the AI budget closes the current add-on row and starts a new one,** so each row's terms never change. The card's "since" date is the current budget's start.
- **New plans can be created in the console** (the publish sheet with key and name), so it fully replaces `plans publish --from` (owner's decision 7).
- **`plans bootstrap` needs `--break-glass` once any super-admin exists.** It's a change, and the console can publish.
- **Masked IP and tab title follow the product's existing rules** ("102.89.34.x"; "{page} · Vento console").
- **`channel` stays null on pre-console audit rows** and is labelled at read time. Backfilling would mean updating an append-only table.

**Risks**
- **oRPC client interceptor retry:** calling `next()` a second time after the proof must re-send the request. Confirm on day 1 (oRPC 1.16.5's retry plugin does the same). The fallback is to retry in `use-change.ts`.
- **A dialog over a sheet (both Radix):** focus trap and Escape handling between them. ui-designer and an e2e check cover it; the fallback is to close the sheet's focus trap while the proof dialog is open.
- **Duplicated WebAuthn settings:** one `webauthn-settings.ts` feeds both the plugin and the console check, and a test compares the plugin's resolved `rpID` and origin with ours.
- **Scale of in-memory reads:** Releases holders and the Over-a-limit set evaluate availability per organization in memory. Fine to a few thousand organizations; measure with 2,000 seeded rows and revisit beyond 5,000.
- **e2e and global stages:** only `releases.spec.ts` changes stages, on two keys no other spec uses, serially, restoring them after. A crash mid-run could leave a stage moved locally; the fixture's `reset` restores it.
- **Deploy order:** break-glass is the last commit. Production must have one super-admin who can sign in and open the console before release (RUNBOOK §4 step 3).
- **`me` gains one indexed lookup for everyone** (`platform_admins` by user). It runs in parallel with the existing `me` queries; measure with `countingDb` (+1 query).

**Follow-ups (not in this slice)**
- Slice 2 support view (needs `read`/`write` on every customer procedure).
- Passkey management for super-admins with no organization.
- Restricting super-admins to an email domain per environment (owner's decision 8).
- Bulk moves to a new plan version.
- A second approver when there are four super-admins.

Files read for this plan:
- `docs/specs/admin-console.md`, `docs/plans/feature-flags.md`, `docs/plans/my-security.md`, `docs/RUNBOOK.md`, `docs/decisions/0015-…md`, `docs/journeys/12-vento-admin.md`, `docs/design/SCREENS.md`
- `apps/api/src/platform/operations/{common,release,plans,super-admin,notify-trials}.ts`, `platform/cli/{context,run,main,flags,plans,superadmin,operator,io}.ts`, `platform/{availability,platform-audit,super-admins,command-error}.ts`
- `apps/api/src/access/middleware.ts`, `src/orpc.ts`, `src/router.ts`, `src/app.ts`, `src/context.ts`, `src/lib/{request-scope,client-ip}.ts`
- `apps/api/src/auth/{auth,session-policy,policy}.ts`, `auth/hooks/{passkey-hooks,turn-off-guard}.ts`, `node_modules/@better-auth/passkey/dist/index.mjs` (verify-authentication)
- `apps/api/src/modules/account/account.service.ts`, `src/db/schema/{platform,auth}.ts`, `src/test/{procedure-guard.test,router-client,factories}.ts`
- `packages/shared/src/{contract,index}.ts`, `common/errors.ts`, `account/{schema,contract,security,two-step-copy}.ts`, `package.json`
- `apps/web/src/routes/{__root,_app}.tsx`, `routes/_app/_shell.tsx`, `src/router.tsx`, `src/lib/{orpc,passkey-client}.ts`, `components/shell/{user-menu-panel,sidebar}.tsx`, `components/confirm-dialog.tsx`, `features/security/use-reauth.ts`, `scripts/bundle-check.mjs`, `vite.config.ts`

---

# Plan: Vento Real Estate console, slice 1b (staff accounts, staff invitations, Dashboard, My account, naming and domain)

- **Status:** built on `feat/admin-console` for the same PR (#9), awaiting review (shared e0780d8, screens 7167fdc and f4c5cf0, API c2d92a8; docs and decision records 0022 and 0023 written; the naming sweep and the e2e specs are being finished), then the security audit of 1b and merge. Nothing in slice 1 is rewritten except where 1b contradicts it (each place is named below). The owner pulled the break-glass `superadmin reset-two-step` into 1b ([1b owner's answer](#1b-owners-answer-27-nov-2026)).
- **Spec:** [docs/specs/admin-console.md](../specs/admin-console.md), section "Slice 1b" and the *(1b)* amendments above it; "Owner's decisions (1b, 27 Nov 2026)" approve every recommended default and are not reopened here. "Console backlog (later)" is out of scope.
- **Builds on:** slice 1 of this plan (§1–§16), [my-security](my-security.md) (cards, dialogs, passkeys, two-step reset), [team](team.md) (customer invitations, the token pattern).
- **Journeys:** J-ADM-05, J-ADM-06, J-ADM-07 (new), J-ADM-03 (changed: invite, resend, withdraw, reset two-step, removal closes the account), J-ADM-01 and J-ADM-02 (step 1 is "sign in → Dashboard"; J-ADM-02 gains the plans line).
- **Decision records:** new **0022 · The product is always called Vento Real Estate** and **0023 · Staff accounts are separate from customer accounts and join by invitation** (full text in §1b.19). 0023 amends 0015 and 0021; 0022 amends 0019's host example.
- **Domain:** `realestate.ventoerp.com` (console `realestate.ventoerp.com/console`). Code has no host name in it: the host is `WEB_ORIGIN`, and passkeys follow it (§1b.14).
- **Written by:** the architect agent on 27 Nov 2026, against `feat/admin-console` at `29a559a`.

## Summary (plain English)
Super-admins stop being customers with extra power and get their own kind of account.

- **Staff accounts.** A staff account is made only by accepting a staff invitation. It never belongs to an organization, can't make one, and can't join one. One email is either staff or customer, never both; the database refuses the mix as well as the screens.
- **Inviting a super-admin.** On *Super-admins*, **Invite super-admin** takes an email, a name and a reason. The person gets a link that works for 48 hours, opens a separate staff sign-up (name, password, two-step, backup codes, an optional passkey) and lands on the console. Invitations can be resent once a minute and withdrawn at once; at most 5 are open.
- **Signing in.** Staff use the normal sign-in page and land straight on the new **Dashboard**. Any customer address sends them back to the console.
- **My account** in the console manages the person's own password, two-step, backup codes, passkeys and devices, using the same cards as My security. Another super-admin can **Reset two-step** for someone who lost their phone. Removing a super-admin closes their staff account: they're signed out everywhere and can't sign in again.
- **At deploy,** anyone who is both a super-admin and a member of an organization stops being a super-admin (their customer access is untouched). If that leaves nobody, `pnpm superadmin invite --bootstrap` prints a one-time link. On production this is very likely the owner's own account, so the deploy includes that step (§1b.20).
- **Dashboard:** four numbers, a *Needs attention* list and two panels, all from data that exists today, with Vento Real Estate's own internal organizations left out. One new database index; no new tracking.
- **Naming:** every word on screen and in emails says "Vento Real Estate", with the three approved short forms. A test fails on a bare "Vento".
- **No new dependency.**

---

## 1b.1 Summary (technical)
- **Schema:** `0013_staff_accounts` (generated): `users.account_kind` (`customer | staff`), a new platform table `staff_invitations`, enum value `account` on `platform_channel`, and index `audit_events_action_created_idx`. `0014_staff_account_guards` (custom SQL): the deploy migration of existing super-admins, then three triggers that pin "one email, one kind" in the database.
- **Staff account** = `users.account_kind = 'staff'`, a Better Auth user field (`input: false`), so `authenticate()` has it with no extra query. Its state comes from `platform_admins` and `staff_invitations`: **active** (an active super-admin), **joining** (a pending staff invitation is started for this user), **closed** (no credential, no factors, no sessions; revoked rows kept).
- **Staff invitations** follow the customer pattern (`modules/invitations`): a 256-bit token, SHA-256 hash stored, lazy `expired`, one pending per email (partial unique), resend replaces the hash. New operations in `platform/operations/staff-invitations.ts` serve the console and the command line.
- **Staff sign-up** uses two public, rate-limited console procedures (`console.join.get`, `console.join.start`), then Better Auth's own `/two-factor/enable` and `/two-factor/verify-totp`. The verify after-hook (setup mode) turns a joining staff account into a super-admin and accepts the invitation in one transaction (`completeStaffJoin`).
- **Enforcement:** `memberMiddleware` answers NOT_FOUND to staff; onboarding, customer invitation create, resend, preview and accept refuse staff emails; the `/sign-in/email` after-hook refuses a staff account that is neither active nor joining; reset-password emails aren't sent to those either.
- **Reset two-step and removal** share one extracted helper, `auth/clear-second-factors.ts` (today's body of `resetMemberTwoStep`). Removal also deletes the credential, which closes the account.
- **Staff account events** (sign-in, two-step, passkeys, console opened) have no organization trail, so `recordAccountEvent` hands them to the platform trail (`channel: 'account'`, `target_type: 'staff_account'`), which Activity and the Dashboard leave out.
- **Dashboard:** `console.dashboard.get` (one call, parallel queries), `console.organizations.accountActivity`; the over-limit computation is refactored to give "over" and "at" in one pass.
- **Commands:** `superadmin invite` (break-glass: emails only), `superadmin invite --bootstrap` (prints a link), `grant` refuses; registry `'superadmin invite' → 'superAdmins.invite.apply'`.
- **Web:** `/console` becomes the Dashboard, Organizations moves to `/console/organizations`, new `/console/account` and public `/staff-invitation/$token` (under `_auth`). My security's cards are composed by a new `security-cards.tsx`, used by both pages. Console entries leave the customer user menu, More and ⌘K.

## 1b.2 Domain model

```
User (account_kind customer | staff, fixed at creation)
 ├─ customer ──0..*── Member (organizations)           never a PlatformAdmin row from 1b on
 └─ staff    ──0..*── PlatformAdmin (≤1 active)        never a Member row
             ──0..*── StaffInvitation (user_id once the person set a password)
StaffInvitation  email, name, invited_by (null = bootstrap), reason, token_hash, expires_at,
                 last_sent_at, status, user_id + started_at, responded_at, withdrawn_by
PlatformAuditEvent  + channel 'account' rows: a staff person's own account events
```
**Ownership:** all of it is identity (decision 0010) or platform configuration (decision 0015): no `organization_id`, no entity. Nothing is limited by entity or project.

### Staff account (per user, derived)
```
                 join.start (password set)          code verified (setup)
  (no user) ───────────────────────────▶ joining ─────────────────────────▶ active
                                           │  │                             │  │
             invitation expired/withdrawn, │  │ resend                      │  │ reset two-step (another
             or resent → discarded (user   │  └─▶ discarded, fresh start    │  │ super-admin): factors and
             row deleted)                  ▼                                │  │ sessions gone, password link;
                                        (no user)                           │  └─▶ active, two-step off → set up at next sign-in
                                                         removed (revoke) ▼
                                                                         closed ──invite + join.start──▶ joining (same user row)
```
- **joining:** `account_kind = staff`, no active `platform_admins` row, a pending, unexpired invitation with `user_id` = this user. Can sign in only to finish (password → two-step).
- **active:** an active `platform_admins` row. Two-step on, except between a reset and the next set-up (then the console answers `console_two_step_required` and `nextStep` is `two_step_setup`).
- **closed:** `account_kind = staff`, only revoked `platform_admins` rows, no `accounts` credential row, no two-factor row, no passkeys, no sessions. Sign-in fails exactly like a wrong password. The name stays on past activity.

### Staff invitation
```
             resend (≥1 min since last send; new hash, +48 h; discards a joining account)
               ┌──┐
               ▼  │
  invite ──▶ pending ──code verified──▶ accepted
               │  │
               │  └── 48 h pass ──▶ expired (read-time; stored on the next write)  ──resend──▶ pending
               └── withdraw (reason) ──▶ withdrawn
```
`effectiveStatus(row, now)` = `expired` when `pending` and `expires_at ≤ now`, as `modules/invitations` does. Expiry writes no event (spec).

### One email, one kind: where it's enforced
| Moment | Rule | Where | DB backstop |
|---|---|---|---|
| Staff invite (console, CLI) | Refused when a customer account has the email: "tunde@gmail.com already has a Vento Real Estate customer account…" | `inviteSuperAdmin` | – |
| Staff sign-up, `join.get` / `join.start` | Refused when the email got a customer account meanwhile (status `customer_account`) | `platform/console/join.service.ts` | `users_email_unique` |
| Customer sign-up (`/sign-up/email`) with a staff email | Looks normal on screen (owner's decision 9); the inbox gets a staff note instead of the "existing account" email | `hooks/verification.ts` `sendExistingAccountNotice` | `users_email_unique` |
| Customer invite / resend to a staff email | Row problem: "tunde@ventoerp.com is a Vento Real Estate staff account…"; nothing sent | `invitations.service.ts` `createInvitations`, `resendInvitation` | – |
| Customer invitation preview and accept (`accept`, `acceptAsNewUser`) | "This email belongs to a Vento Real Estate staff account, so it can't join Vento Homes Ltd…" | `invitations.service.ts` | trigger `members_refuse_staff` |
| Onboarding `createOrganization` | FORBIDDEN `staff_account` | `onboarding.service.ts` | trigger `members_refuse_staff` (the owner row) |
| Any `member` / `memberPendingTwoStep` procedure | NOT_FOUND | `access/middleware.ts` | – |
| A super-admin row for a customer | Impossible | `completeStaffJoin` only | trigger `platform_admins_staff_only` |
| Changing an account's kind | Impossible (backlog 16 needs a migration) | – | trigger `users_account_kind_fixed` |

### Invariants
- **DB:** `staff_invitations_email_pending_unique` (one pending per email); `token_hash` unique; `email = lower(email)`; `char_length(reason) between 3 and 500`; `(user_id is null) = (started_at is null)`; `status <> 'accepted' or user_id is not null`; `status not in ('accepted','withdrawn') or responded_at is not null`; the three triggers above; `platform_admins_user_active_unique` and the append-only triggers unchanged.
- **Service:** a staff account is a super-admin only after a verified code; at most 5 open invitations; the fourth-super-admin note counts active plus open; nobody resets their own two-step in the console (the host's break-glass `reset-two-step` may, see "1b owner's answer") or removes themselves; there's always one active super-admin; every invite, resend, withdraw, join, reset and removal takes the existing `pg_advisory_xact_lock(hashtext('platform_admins'))`, so the counts are serial.

## 1b.3 Database

### Migration `0013_staff_accounts` (generated)
| Table | Column / object | Type | Notes |
|---|---|---|---|
| `users` | `account_kind` | enum `account_kind` (`customer`, `staff`) not null default `customer` | Better Auth field `accountKind` (`input: false`, `defaultValue: 'customer'`, returned) in `authUserFields`; `auth-schema.test.ts` updated |
| `platform_channel` | value `account` | enum | a staff person's own account event (sign-in, two-step, passkey, console opened) |
| `staff_invitations` (new, platform) | `id` | uuid v7 | |
| | `email` | text not null | lower-case CHECK |
| | `name` | text not null | 1–100 after trim, as `accountName` |
| | `reason` | text not null | 3–500 CHECK |
| | `invited_by_user_id` | uuid null → `users` restrict | null = bootstrap |
| | `bootstrap` | boolean not null default false | the open bootstrap invitation is replaced on a re-run |
| | `status` | enum `staff_invitation_status` (`pending`, `accepted`, `expired`, `withdrawn`) default `pending` | |
| | `token_hash` | text not null | unique `staff_invitations_token_hash_unique` |
| | `expires_at` | timestamptz not null | sent + 48 h |
| | `last_sent_at` | timestamptz not null default now() | resend once a minute |
| | `user_id` | uuid null → `users` restrict | the staff account once the password is set |
| | `started_at` | timestamptz null | with `user_id` (CHECK) |
| | `responded_at` | timestamptz null | accepted or withdrawn |
| | `withdrawn_by_user_id` | uuid null → `users` restrict | |
| | `created_at`, `updated_at` | timestamptz | |
| | indexes | | `staff_invitations_email_pending_unique (email) where status = 'pending'`; `staff_invitations_status_idx (status, created_at desc)`; `staff_invitations_user_idx (user_id)`; `staff_invitations_invited_by_idx (invited_by_user_id)` |
| `audit_events` | `audit_events_action_created_idx` | index `(action, created_at desc)` | the Dashboard feed reads across organizations (spec: an index, not new tracking) |

### Migration `0014_staff_account_guards` (custom, `pnpm db:generate --custom --name staff_account_guards`)
In this order, in the migrator's single transaction:
1. **Super-admins who are customers stop being super-admins** (owner's decision 2):
   ```sql
   WITH gone AS (
     UPDATE platform_admins pa SET revoked_at = now(), updated_at = now()
     WHERE pa.revoked_at IS NULL
       AND EXISTS (SELECT 1 FROM members m WHERE m.user_id = pa.user_id AND m.status = 'active')
     RETURNING pa.user_id)
   INSERT INTO platform_audit_events (actor_user_id, actor_name, operator, action, target_type,
     target_key, before, reason, channel, metadata)
   SELECT NULL, 'Vento Real Estate (setup)', 'migration 0014_staff_account_guards',
     'superadmin.revoked', 'user', g.user_id::text, jsonb_build_object('name', u.name),
     'Staff accounts are separate from customer accounts', 'command',
     jsonb_build_object('done', u.name || ' is no longer a Vento Real Estate super-admin.')
   FROM gone g JOIN users u ON u.id = g.user_id;
   ```
   then `UPDATE sessions SET console_opened_at = NULL, console_active_at = NULL` for those users. Their membership, password, two-step and passkeys are untouched.
2. **Remaining active super-admins become staff accounts:** `UPDATE users SET account_kind = 'staff' WHERE id IN (SELECT user_id FROM platform_admins WHERE revoked_at IS NULL)`. (They have no active membership after step 1; removed membership rows stay as history.)
3. **Triggers** (plpgsql, `ERRCODE 'check_violation'`, messages without personal data):
   - `members_refuse_staff` BEFORE INSERT OR UPDATE OF `user_id`, `status` ON `members` when `NEW.status = 'active'`: refuse if the user is staff.
   - `platform_admins_staff_only` BEFORE INSERT ON `platform_admins`: refuse unless the user is staff (legacy revoked rows of customers are untouched: insert only).
   - `users_account_kind_fixed` BEFORE UPDATE OF `account_kind` ON `users`: refuse any change.

**Migration safety**
- `account_kind` is added with a constant default: metadata-only in Postgres, no rewrite. Old code ignores it. The enum value `account` is added but not used in the same transaction (Postgres 12+ allows `ADD VALUE` in a transaction block only on that condition; 0014 uses `command`).
- `audit_events_action_created_idx` is a plain `CREATE INDEX`: the drizzle migrator runs every pending migration in one transaction, so `CONCURRENTLY` isn't possible. Fine before launch (the table is small). The RUNBOOK deploy note says so, and that a large table would need the index built by hand with `CONCURRENTLY` first.
- `platform_audit_events` stays append-only: step 1 only inserts. `platform_admins` is updated, as `revokeSuperAdmin` already does.
- **Not reversible by itself:** a revoked super-admin comes back only by a staff invitation on a different email. That's the owner's decision; the RUNBOOK deploy note says who to tell before the deploy and to run the bootstrap invitation straight after it if no super-admin remains.

## 1b.4 Staff accounts in the code
- **`AuthUser.accountKind`** (`access/context.ts`), filled by `authenticate()` from the session's user (no query). `IdentityUser` in `auth/security-store.ts` selects it too.
- **`platform/staff-accounts.ts`** (new):
  - `staffAccountState(db, userId)` → `'active' | 'joining' | 'closed'`, one query: `platform_admins` (active) ⟕ `staff_invitations` (pending, unexpired, `user_id`).
  - `discardUnfinishedStaffAccounts(tx, now)`: for every staff user with no `platform_admins` row at all whose invitation is no longer pending-and-unexpired (or was resent), clear `user_id`/`started_at` on their invitations, then delete the user (cascades: `sessions`, `accounts`, `two_factors`, `passkeys`, known devices, password history; a test checks every FK to `users` is cascade or cleared first). A **former** super-admin who was re-invited and stopped half-way isn't deleted (their history links to the row): they go back to closed (`closeStaffAccount`) and the invitation link is cleared. It runs inside every staff-invitation write (invite, resend, withdraw, join) and on a refused sign-in by such an account, so an unfinished account never outlives the next staff action. A never-joined account has no audit rows (staff account events reach the platform trail only once the person has a `platform_admins` row, below), so nothing restricts the delete.
  - `closeStaffAccount(tx, userId)` (used by revoke): `clearSecondFactors(tx, userId, { mode: 'close' })`, then delete the `accounts` row with `provider_id = 'credential'`, so no password works.
- **`auth/clear-second-factors.ts`** (new, extracted from `resetMemberTwoStep`): advisory lock per person (the same one the passkeys insert trigger takes, migration 0010), delete `two_factors` and `passkeys`, delete every session, and set `two_factor_enabled = false` plus, for `mode: 'reset'`, `two_step_setup_required = true` and `password_reset_required = true`. Returns the counts for the audit metadata. `members.service.ts` calls it with `'reset'` (behaviour unchanged, test unchanged).
- **Account events** (`modules/audit/audit.service.ts`, `recordAccountEvent`): when the person has no active membership, it calls `recordStaffAccountEvent(db, input)` from the new `platform/staff-account-events.ts` before falling back to the log line. That writes a platform row only for a staff account that has ever had a `platform_admins` row: `channel: 'account'`, `target_type: 'staff_account'`, `target_key: userId`, `actor_user_id`/`actor_name` from the event's actor (null for "Sign-in attempt"; the CHECK applies only to `console`), operator `"{device} · {masked IP}"`, the event's `metadata`, reason `"Account event"`. Customers with no organization keep the log line.
- **Copy and requirement:** `firstTwoStepRequirement` returns `{ reason: 'super_admin' }` for any staff account (checked first); `two-step-copy.ts` says "Required for Vento Real Estate staff" and "Two-step is required for Vento Real Estate staff, so it can't be turned off." The enum value stays `super_admin` (no schema change).
- **Passkeys** (`auth/passkey-availability.ts`): `passkeysAvailableHere` with no active organization answers the `passkeysAvailableForUser` super-admin rule (active super-admin and the kill switch not on), so My account's passkey card, rename and remove work. Customers with no organization are unchanged (false).

## 1b.5 Staff invitations and the staff sign-up

### Operations (`apps/api/src/platform/operations/staff-invitations.ts`)
All take `PlatformActor | 'bootstrap'`, run in one transaction under the `platform_admins` lock, call `discardUnfinishedStaffAccounts` first, write exactly one platform audit row (so `applyOnce` idempotency holds), and return `{ done, emails: EmailMessage[] }` (plus `link` for the bootstrap). Emails are sent by the caller after commit.

| Operation | Checks, in order (each a `PlatformError`) | Writes | Event (`target_type 'staff_invitation'`, `target_key` id) |
|---|---|---|---|
| `previewInvite(db, { email, name })` | the same checks as below | – | – (lines: "Tunde Bello (tunde@ventoerp.com) gets an email to join. The link works for 48 hours." · "They become a super-admin only after setting a password and two-step sign-in." · fourth note) |
| `inviteSuperAdmin` | bootstrap: no active super-admin, else "There's already a super-admin. Ask them to invite you from the console." · customer account · active super-admin ("Tunde Bello is already a super-admin.") · open invitation ("…already has an invitation that expires 29 Nov 2026, 14:30.", `next: 'resend_invitation'`, `invitationId`) · 5 open ("There are 5 open invitations. Withdraw one or wait for it to be accepted."; not for bootstrap) | stale `pending` rows for the email → `expired`; bootstrap: the open bootstrap invitation → `withdrawn`; insert, `expires_at = now + 48 h` | `superadmin.invited` (after: name, email, expiresAt; metadata `bootstrap`) |
| `resendStaffInvitation(id)` | pending (incl. expired) · `last_sent_at > now − 1 min` → "Wait a minute before resending." · open count if it was expired | new token hash, `expires_at`, `last_sent_at`; status back to `pending`; a joining account for it is discarded (fresh start: the person's way out of a forgotten password) | `superadmin.invitation_resent` (reason: the invitation's own reason) |
| `withdrawStaffInvitation(id, reason, expected { status: 'pending' })` | pending (incl. expired) | `withdrawn`, `responded_at`, `withdrawn_by`; its joining account discarded | `superadmin.invitation_withdrawn` |
| `startStaffJoin(token, name, password)` | see the flow | user, credential, invitation started | – (no audit row; the account trail starts at join) |
| `completeStaffJoin(userId)` | a pending, unexpired, started invitation for this user; the email has no customer account | `platform_admins` (granted_by = inviter, reason = invitation's), invitation `accepted` | `superadmin.joined` (actor: the new person, channel `console`) |

`INVITATION_TTL` for staff: `STAFF_INVITATION_TTL_MS = 48 h`, `STAFF_INVITATION_RESEND_MS = 1 min`, `STAFF_INVITATIONS_OPEN_MAX = 5` in `auth/policy.ts` beside the console constants (security policy approved by the owner, so in code). Tokens reuse `modules/invitations/invitation-token.ts` (`newInvitationToken`, `hashInvitationToken`).

Action names follow the existing platform convention (`superadmin.granted`, `superadmin.revoked`), not the spec's `super_admin.*`; same meaning, logged in CHANGES.

### The staff sign-up, request by request
```
browser                         API                                         database
GET /staff-invitation/{t}  ──▶ console.join.get {token}   (20/min/IP)  ──▶ hash lookup
  ◀── { status: pending|expired|withdrawn|accepted|customer_account, email, name,
        inviterName, expiresAt, resume: boolean }
Step 1  name + password   ──▶ console.join.start {token, name, password}  (10/min/IP)
                               new:     policy check → insert user (staff, email_verified, no
                                        terms) + credential + password history; invitation
                                        user_id/started_at  (closed account: same user row,
                                        new name and credential)
                               resume:  name ignored
                               both:    auth.api.signInEmail (sets the cookie; the sign-in
                                        guard lets a joining account through)
  ◀── { next: 'two_step' }  or BAD_REQUEST wrong password (counts towards the usual lock)
Step 2  /two-factor/enable {password} (Better Auth) ◀── totpURI + backupCodes (held in memory)
        /two-factor/verify-totp {code} (setup mode)
           after-hook: two_step.enabled, then completeStaffJoin(userId) → super-admin,
           invitation accepted, superadmin.joined; notices to other super-admins after commit
Step 3  backup codes → I've saved them
Step 4  passkey offer: /passkey/generate-register-options… (allowed: an active super-admin)
Step 5  /console → access.status → closed + fresh proof → access.open (no prompt) → Dashboard
```
- **Why two public procedures and then Better Auth:** the token proves the inbox (no email verification), and Better Auth must still own the session, the two-step secret and the backup codes. `acceptAsNewUser` already creates a user and signs in the same way (`invitations.router.ts`).
- **Why the join happens in the verify hook:** the spec says "verifying the code makes them a super-admin". Doing it where the code is verified means there's no state "two-step on, not a super-admin" to resume from. If the hook finds the invitation withdrawn or expired meanwhile, it does nothing: `join.get` then shows that state, and the next staff action discards the account.
- **Resume:** reopening a valid link after step 1 returns `resume: true`. The page asks only for the password (no name) and goes on at step 2. A forgotten password: ask the inviter to **Resend** (fresh start); reset-password emails aren't sent to a joining account.
- **Signed in as someone else:** the page compares `me.user.email` (when signed in) with the invitation's email and offers **Sign out and continue** (`features/account/sign-out.ts`). Signed in as the invitee (a joining account mid-way): it goes straight to step 2.
- **Rate limits:** `publicRateLimit('staffJoinGet', 20)` and `publicRateLimit('staffJoinStart', 10)` per IP a minute. Code attempts: Better Auth's two-factor rule per IP (3 every 10 seconds, so at most 18 a minute, enforced before our hooks); in setup mode a wrong code never sets our sign-in lock (`afterTwoStepVerify` mirrors locks only in sign-in mode). A test pins both, and that Better Auth's own `accountLockout` doesn't stop a later right code at set-up (risk §1b.20).
- **Bad links:** an unknown token answers like expired with no inviter ("This invitation has expired. Ask a Vento Real Estate super-admin to send a new one."). `join.start` on a non-pending invitation is CONFLICT with the same reasons (`invitation_expired`, `invitation_withdrawn`, `invitation_not_pending`, new `staff_customer_account`).

## 1b.6 Sign-in, routing and My account
- **Routing (server decides):** `getMe` for a staff account: active super-admin with two-step → `nextStep: 'console'`; two-step off (joining, or after a reset) → `'two_step_setup'`. `me.console` is unchanged (set only for an active super-admin). The web already follows it: `_app.tsx` sends `'console'` to `/console` from every customer path, including unknown ones; `_auth.tsx` gains "`nextStep === 'console'` → `/console`" and lets `/staff-invitation/…` through, like `/accept-invitation`.
- **After sign-in** the sign-in page navigates to `redirect` or `/`, and `_app` sends staff on to `/console`. The code or passkey just stamped `second_factor_at`, so the console gate opens the window without *Confirm it's you* (slice 1, `access.open`).
- **Sign-in guard** (`auth.ts`, `/sign-in/email` after-hook, after a correct password, beside `passwordResetRequired`): a staff account that is neither active nor joining → `discardUnfinishedStaffAccounts`, the new session deleted, and the same `INVALID_EMAIL_OR_PASSWORD` response a wrong password gets. A closed account never gets that far (no credential, so Better Auth already answers that). Passkey sign-in: a closed account has no passkeys; `afterPasskeySignIn`'s rule (no membership → only an active super-admin) is unchanged.
- **Reset-password emails** (`hooks/verification.ts`, `sendResetPasswordEmail`): not sent to a joining or closed staff account (same screen either way). The two-step reset's link (§1b.7) goes to an active one.
- **Two-step set-up for staff** (after a reset): the existing `/two-step/setup` route already works with no organization (slice 1); its header gains the staff sentence "Staff accounts need it every time you sign in." when `twoStepRequiredBy.reason === 'super_admin'`.
- **My account** (`/console/account`, *settings page* archetype): the same personal procedures My security uses (`account.security`, `account.updateName`, `account.confirmPassword`, `account.passkeys.*`, `account.sessions.*`, plus Better Auth's change-password, backup-code and passkey endpoints). They are `authed` (personal), so no new API. Two-step shows "On · Required for Vento Real Estate staff" with no **Turn off** (the turn-off guard already refuses for `super_admin`); new backup codes and passkeys need a code or passkey from the last 5 minutes (slice 1, `assertFreshFactorForSuperAdmin`), so the dialogs ask for a code, as My security does for super-admins today.

## 1b.7 Reset two-step and removal
- **`resetSuperAdminTwoStep(db, actor, { userId, reason, expected: {} })`** (`operations/super-admin.ts`): lock; actor still active; target ≠ actor ("You can't reset your own two-step. Ask another super-admin."); target an active super-admin; `clearSecondFactors(tx, userId, { mode: 'reset' })`; platform event `superadmin.two_step_reset` (metadata: sessions ended, passkeys removed); the person's account event `two_step.reset` (platform trail, actor the resetting super-admin). Returns the emails: to the person `twoStepResetAlert` (existing template, "by Ada Okafor"), to the others the notice "Ada Okafor reset Tunde Bello's two-step". The router then asks Better Auth for the 30-minute reset link (`auth.api.requestPasswordReset`, as `members.router.ts` does). At the next sign-in: new password → `nextStep: 'two_step_setup'` → set up → console. No command (backlog 15); the parity registry is one-way (commands → console), so nothing breaks.
- **`revokeSuperAdmin`** (extended): after the existing checks, for a staff target `closeStaffAccount(tx, userId)` in the same transaction (sessions, passkeys, authenticator and credential gone; `two_factor_enabled = false`). Preview lines become "Their staff account closes: they're signed out everywhere and can't sign in. Their name stays on past activity." The emails (`removedEmails`) are unchanged in shape; the person's copy says "Your staff account is closed."
- **Re-inviting a closed account** starts fresh on the same user row (spec rule 5): `join.start` sets the name and a new credential; history (`platform_admins` revoked rows, audit rows) still links.
- **`members.resetTwoStep`'s super-admin refusal** stays as a backstop (staff can't be members, so it's unreachable); its copy becomes "Vento Real Estate staff reset two-step with Vento Real Estate."

## 1b.8 Commands
| Command | After 1b |
|---|---|
| `superadmin invite --email x --name "…" --reason "…" --by y --break-glass` | Runs `inviteSuperAdmin` as `--by`, channel `command`. **Emails** the invitation; never prints the link (so whoever holds the host can't use it). The usual break-glass email tells every other super-admin. Needs `--break-glass` like every change. |
| `superadmin invite --bootstrap --email x --name "…" [--reason "…"]` | Only with no active super-admin. Actor `Vento Real Estate (setup)`, channel `command`, `invited_by` null. **Prints** the one-time link (`{WEB_ORIGIN}/staff-invitation/{token}`, 48 hours) and also emails it (the dev transport writes it to `.mail`). A re-run withdraws the open bootstrap invitation and issues a new one. Reason defaults to "First super-admin". |
| `superadmin grant …` | Refuses, exit 1: "Super-admins join by invitation. Use superadmin invite." |
| `superadmin revoke`, `superadmin list` | Unchanged (revoke now closes the account; list also prints open invitations). |
- `cli/context.ts` `parse` gains `--email`; `cli/superadmin.ts` help text; `main.ts` is unchanged.
- **Registry** (`cli/change-commands.ts`): `'superadmin grant'` is removed; `'superadmin invite': { console: 'superAdmins.invite.apply' }` is added. `authorise(deps, parsed, 'superadmin invite')` makes it refuse without `--break-glass`.
- **Parity test:** `invite` with `--break-glass` vs `superAdmins.invite.apply` on identical fixtures writes the same `action`, `target_type`, `after` (minus ids and times) and sends the invitation email, with channels `command` and `console`; `grant` refuses; `invite --bootstrap` with a super-admin present refuses with the spec sentence.
- **`describePlatformEvent`** (`operations/describe.ts`) learns the five new actions ("Invited Tunde Bello (tunde@ventoerp.com)", "Resent Tunde Bello's invitation", "Withdrew Tunde Bello's invitation", "Tunde Bello joined as a super-admin", "Reset Tunde Bello's two-step"), used by Activity, the break-glass email and the Dashboard.
- Actor names: `SCHEDULED_ACTOR` → "Vento Real Estate (scheduled)", `SETUP_ACTOR` → "Vento Real Estate (setup)". The read-time label for legacy null-channel rows (`activity.service.ts`) accepts both the old and the new scheduled names (old rows are append-only).

## 1b.9 Dashboard

### Every number's source, checked against the code
| Number or row | Source (exists today) | Query (internal excluded everywhere: `coalesce(op.release_group, 'standard') <> 'internal'` via `organizations o left join organization_plans op`) | Index used |
|---|---|---|---|
| Header "214 organizations · 3,912 people" | `organizations`; active `members` | `count(*)`; `count(distinct m.user_id) where m.status = 'active'` | `members_org_status_idx` |
| **Organizations**, "+6 in the last 7 days" | `organizations.created_at` | `count(*) filter (where o.created_at >= now() - interval '7 days')` | seq scan (≤ thousands) |
| **Active this week** "1,204 people · in 61 organizations" | `members.last_active_at` (written by `touchMemberActivity`, at most hourly) | `count(distinct m.user_id), count(distinct m.organization_id) where m.status = 'active' and m.last_active_at >= now() - interval '7 days'` | seq scan on `members` (measured; add a partial index on `last_active_at` only if over budget) |
| **Trials ending soon** | `organization_trials` | as `organizations.summary` today: `cancelled_at is null and expires_at > now() and ends_on <= lagosToday + 7`, distinct organization (the spec's `ended_recorded_at` is the reminder job's bookkeeping, not the truth; `expires_at` is) | `organization_trials_org_idx` |
| **Over a limit**, "5 more at a limit" | the existing in-memory computation (`overLimitIds`: members + live invitations, active entities vs `countLimit`) | refactored to `limitStanding(db, now, snapshot?)` → `Map<orgId, { over: LimitUse[]; at: LimitUse[] }>` in one pass; `overLimitIds` becomes a wrapper so slice 1 callers don't change | existing two grouped counts |
| Queue 1 · command-line changes, 7 days | `platform_audit_events` | `(channel = 'command' or (channel is null and actor_name not in (scheduled names))) and created_at >= now() - 7 days`, newest first; summary from `describePlatformEvent` | `platform_audit_events_created_idx` |
| Queue 2 · trial ending in 7 days | as above | name, plan name, `ends_on`; soonest first | – |
| Queue 3 · over a limit | `limitStanding` | worst excess first ("People 17 of 15") | – |
| Queue 4 · no plan | `organization_plans.plan_version_id is null` (or no row) | name | `organization_plans_org_unique` |
| Queue 5 · gone quiet | `members.last_active_at` | `o.created_at < now() - 14 days` group by `o.id` having `coalesce(max(m.last_active_at), o.created_at) < now() - 14 days`; days = now − that | `members_org_status_idx` |
| Summary · new organizations / trials started | `organizations.created_at`; `organization_trials.starts_at >= now() - 7 days` | counts | – |
| Summary · invitations sent, accepted | `invitations.created_at` (a resend updates `last_sent_at`, so it's not counted); `status = 'accepted' and responded_at >= now() - 7 days` | counts | seq scan (measured) |
| Summary · sign-ups not finished | `users` | `account_kind = 'customer' and email_verified and created_at >= now() - 7 days and not exists (members m where m.user_id = u.id)`; count only, never names | seq scan (measured) |
| Feed (15) and Account activity (30 days) | `audit_events` actions `organization.created`, `entity.created`, `invitation.accepted`, `member.removed`, `member.access_changed` (owner only), `two_step.reset`, `auth.locked_out`, `passkey.suspected_clone` — each verified as written today (`onboarding.service`, `entities.service`, `invitations.service`, `members.service`, `sign-in-guard`, `passkey-hooks`) | below | new `audit_events_action_created_idx`; per organization `audit_events_org_created_idx` |
| By plan · versions · Internal · No plan | `organization_plans` ⋈ `plan_versions` ⋈ `plans` | group by plan key, name, version; internal and no-plan counted apart | `organization_plans_plan_version_idx` |
| At pilot | `feature_releases.stage = 'pilot'` | from the snapshot (`loadSnapshot`), no query | – |
| Recent changes (5) | `platform_audit_events` | newest 5 where `channel is distinct from 'account'`, through `toActivityRow` | `platform_audit_events_created_idx` |

```sql
-- Feed (Dashboard: 7 days, limit 15; organization card: one organization, 30 days, limit 30)
select a.organization_id, o.name, a.action,
       (a.created_at at time zone 'Africa/Lagos')::date as day,
       count(*)::int as n, max(a.created_at) as latest_at
from audit_events a
join organizations o on o.id = a.organization_id
left join organization_plans op on op.organization_id = a.organization_id
where a.created_at >= now() - interval '7 days'
  and a.action in (…8 actions…)
  and (a.action <> 'member.access_changed' or a.metadata->>'roleKey' = 'owner')
  and coalesce(op.release_group, 'standard') <> 'internal'
group by 1, 2, 3, 4
order by latest_at desc
limit 15
```
- **"New owner":** `member.access_changed` stores role *names*, which a custom role can share in spirit ("Owner (site)") but not reliably by key. `members.service.ts` adds `metadata: { roleKey: role.key }` to that event (one line, additive, no new event). Rows from before 1b have no key and are left out of the feed, which is right (they're older than 30 days within weeks).
- **Facts only:** the queries select organization id and name, action, counts and times; never `actor_name`, `target_label`, `before`, `ip_masked` or `user_agent_summary`. The output schema has no field that could carry them, and a test scans the JSON (spec).
- **Shape of the call:** `dashboard.get` runs the reads in parallel with `runQueries` (pool, as `organizations.summary`): one SQL for the counts, one for the queue lists, the feed, the plan breakdown, the platform reads, and `limitStanding`. Queue: at most 8 rows in spec order, then `more` (the count left). p95 ≤ 300 ms on 2,000 seeded organizations is asserted with `EXPLAIN ANALYZE` notes in the PR and a timing test on the seeded fixture (not a CI gate). The web refetches on focus (`refetchOnWindowFocus`, staleTime 30 s).
- **Account activity card:** `organizations.accountActivity({ id })` → "9 of 11 people active in the last 7 days · last active today" (`count(*) filter (where last_active_at >= now() - 7 days)`, `count(*)`, `max(last_active_at)` over active members) and the feed query for that organization over 30 days. Internal organizations show their own card (the exclusion is for cross-customer numbers only).
- **Organizations page vs Dashboard:** the Organizations page keeps slice 1's totals (every organization, internal included, with the Internal chip); the Dashboard's header leaves internal out (owner's decision 5). The Dashboard's search box opens `/console/organizations?search=…`.

## 1b.10 Moving a feature between plans (Releases fix)
- `releaseDetail` gains `planVersions: { key, name, version, included }[]` (every live plan's latest version, by sort order) from `snapshot.latestPlans` (it already has `planKey` and `version`). `releaseRow.plans` (names) stays for the list.
- `release-sections.tsx`: *Included in* lists the included plans as links "Growth v2, Enterprise v1" (to `/console/plans/{key}`), *Not in* lists the rest, then "To change this, publish a new version of a plan. Customers stay on their version until you move them." with "publish a new version" linking to *Plans*. Core features keep "Core: in every plan" and no *Not in*; add-on features keep "With the AI add-on".

## 1b.11 Contract (`packages/shared/src/console`)
New and changed procedures (everything else from §5.3 stays):

| Procedure | Built on | Input | Output | Errors |
|---|---|---|---|---|
| `dashboard.get` | `consoleWindow` | – | `dashboard { header {organizations, people}, numbers {organizations, newLast7Days, activePeople, activeOrganizations, trialsEndingSoon, overLimit, atLimit}, attention { items: attentionItem[] (≤ 8), more }, activity { summary {newOrganizations, invitationsSent, invitationsAccepted, trialsStarted, signUpsNotFinished}, feed: feedRow[] (≤ 15) }, plans { byPlan: {key, name, total, versions: {version, organizations}[]}[], internal, noPlan, atPilot: featureKey[], recent: activityRow[] (≤ 5) } }` | – |
| `organizations.accountActivity` | `consoleWindow` | `{ id }` | `{ people, activeLast7Days, lastActiveAt: datetime \| null, feed: feedRow[] (≤ 30) }` | NOT_FOUND |
| `superAdmins.invitations` | `consoleWindow` | – | `staffInvitationRow { id, email, name, invitedByName (null = setup), expiresAt, status: 'pending' \| 'expired', resendableAt }[]` (pending rows only; bounded by 5 open plus expired ones from the last 30 days) | – |
| `superAdmins.invite.{preview,apply}` | `consoleWindow` | `{ email: z.email() lower-cased, name: accountName }` (+ `reason`, `idempotencyKey`, `expected: {}`) | preview / `done` | CONFLICT `platform_refused` (customer account, already one, open invitation with `next: 'resend_invitation'` and `invitationId`, 5 open) |
| `superAdmins.resendInvitation` | `consoleWindow` | `{ invitationId, idempotencyKey }` | `done` | CONFLICT (`platform_refused` "Wait a minute…", not pending); NOT_FOUND |
| `superAdmins.withdrawInvitation.{preview,apply}` | `consoleWindow` | `{ invitationId }` (+ reason, key, `expected { status }`) | preview / `done` | CONFLICT `platform_stale` (accepted or withdrawn meanwhile); NOT_FOUND |
| `superAdmins.resetTwoStep.{preview,apply}` | `consoleWindow` | `{ userId }` (+ reason, key) | preview / `done` | CONFLICT ("You can't reset your own two-step…", not a super-admin) |
| `superAdmins.remove.*` | unchanged | | | |
| `superAdmins.add.*` | **removed** (replaced by invite; the console web stops using it in the same commit) | | | |
| `join.get` | `os` + `publicRateLimit('staffJoinGet', 20)` (**public**) | `{ token: string 1–200 }` | `staffJoinPreview { status: 'pending' \| 'expired' \| 'withdrawn' \| 'accepted' \| 'customer_account', email, name, inviterName: name \| null, expiresAt, resume: boolean }` | – (unknown token = `expired`, inviter null) |
| `join.start` | `os` + `publicRateLimit('staffJoinStart', 10)` (**public**) | `{ token, name?: accountName, password: 1–128 }` | `{ next: 'two_step' \| 'sign_in' }` (`sign_in` when the account was made but Better Auth's sign-in failed, as `acceptAsNewUser`) | BAD_REQUEST password policy reasons; CONFLICT `invitation_expired` / `invitation_withdrawn` / `invitation_not_pending` / `staff_customer_account`; UNAUTHORIZED wrong password on resume; TOO_MANY_REQUESTS |

- `superAdminRow` gains `canResetTwoStep: boolean` (not you, and two-step on) and its `grantedByName` is shown as **Invited by**.
- `activityKind` keeps `super_admin`; invitation events map to it. Rows with `channel = 'account'` are never returned by `activity.list` or `activity.people`.
- `join.*` keep `meta.area: 'console'` (they are console code and live in the subpath) and are listed in a new `CONSOLE_PUBLIC_PROCEDURES = ['console.join.get', 'console.join.start']` exported from `platform/console/console.router.ts`, spread into `PUBLIC_PROCEDURES` in `router.ts`.

**Shared schema changes outside the console subpath**
- `common/errors.ts`: `conflictReason` + `staff_account` (customer invite row problem, data `staffAccounts: string[]`) and `staff_customer_account`; `forbiddenReason` + `staff_account`; CONFLICT `next` + `'resend_invitation'` with optional `invitationId`.
- `access/schema.ts`: `invitationPreview.staffAccount: boolean`.
- `auth/fields.ts`: `accountKind` user field.
- `account/two-step-copy.ts`: the staff sentences.
- `account/schema.ts`: comments only ("Vento Real Estate"); no shape change.

## 1b.12 Permissions and guards
| Procedure | Built on | Who | Limits |
|---|---|---|---|
| `console.dashboard.get`, `console.organizations.accountActivity`, `console.superAdmins.*` | `consoleWindow` | active super-admin (a staff account), two-step on, window open | organization only by ID in input |
| `console.join.get`, `console.join.start` | `os` + per-IP rate limit (public) | anyone with the token | the token names one invitation; nothing else readable |
| `account.*` personal (My account) | `authed`, unchanged | every signed-in person, staff included | – |
| every `member` / `memberPendingTwoStep` procedure | `memberMiddleware` | customers only: a staff account gets NOT_FOUND before any membership read | – |
| `onboarding.createOrganization`, `invitations.accept`, `invitations.acceptAsNewUser` | unchanged builders | refuse staff (FORBIDDEN `staff_account` / CONFLICT) | – |
| `pnpm superadmin invite` | CLI | `--break-glass` + `--by` + `--reason`, or `--bootstrap` on an empty environment | – |

One platform role, no module × action matrix (unchanged; lesser staff roles are backlog 8). No maker-checker (fewer than four super-admins).

**Walks:** the access walk (`console-access.test.ts`) skips `CONSOLE_PUBLIC_PROCEDURES` and instead checks they answer without a session and are in `PUBLIC_PROCEDURES`; the anonymous walk (`procedure-guard.test.ts`) treats them as public; a new **staff walk** calls every customer (`member` and `memberPendingTwoStep`) procedure as an active staff account and expects NOT_FOUND with no writes (`countingDb`).

## 1b.13 Web (`apps/web`)

### Routes
```
src/routes/console/index.tsx                   Dashboard (was Organizations)
src/routes/console/organizations.index.tsx     Organizations (moved; same page, same search params)
src/routes/console/organizations.$organizationId.tsx   + Account activity card
src/routes/console/account.tsx                 My account
src/routes/_auth/staff-invitation.$token.tsx   Staff sign-up (public; loader and component split)
src/routes/_auth.tsx                           lets /staff-invitation through; nextStep 'console' → /console
```
- Every link that meant "Organizations" (`back-link.tsx` uses, stat buttons, Dashboard numbers, the not-found page's way back) points at `/console/organizations`; `console-nav.ts` `isCurrent` treats `/console` as exact.
- The staff sign-up route keeps its loader with the component (`codeSplitGroupings`, as `console/index.tsx`), so `@vento/shared/console` never reaches the main chunk. It calls `console.join.*` through a small typed client, `features/console/join/join-client.ts` (an `RPCLink` typed `{ console: { join: ConsoleContract['join'] } }`, no console interceptors).

### Shell changes
- `console-nav.ts`: **Dashboard** (`/console`, `LayoutDashboardIcon`) first, Organizations at `/console/organizations`; `CONSOLE_TABS` = Dashboard, Organizations, Releases; `CONSOLE_MORE` = Plans, Activity, Super-admins; `STAFF_LABEL` "Vento Real Estate staff · all customers"; `STAFF_LABEL_SHORT` "Staff · all customers" (approved short form b, phone top bar only).
- `console-user-menu.tsx` and `console-more-sheet.tsx`: **My account** replaces **Back to {organization}**; theme; **Sign out**. `use-leave-console.ts` keeps only sign-out.
- `use-console-title.ts`: "{page} · Vento Real Estate console".
- Customer side: the **Vento console** entries go from `components/shell/user-menu-panel.tsx`, `components/shell/more-sheet.tsx` and `features/shell/command-results.tsx`, and My security's super-admin line from `features/security/security-page.tsx`.

### Screens
| Screen (SCREENS.md §15 row) | Design | Built from | States |
|---|---|---|---|
| Console **Dashboard** | – role-home anatomy (needs-design; DESIGN-NOTES "Role homes") | `PageHeader`, `features/console/ui/stat-button.tsx` (numbers that open the filtered list), `StatusBadge` tones (rose, amber, slate), `ui/card`, `SearchField`; share bars as plain `div`s with tokens (no chart library) | skeleton in the final layout; queue empty and feed empty sentences; "Couldn't load the Dashboard." with **Try again** (`console-route-error.tsx` pattern); 375 px: numbers 2 × 2, then queue, then panels |
| Organization detail **Account activity** card | [AdminOrgDetail](../design/claude-design/AdminOrgDetail.dc.html) layout | `features/console/ui/detail-card.tsx`, the feed row component shared with the Dashboard | empty "No account activity in the last 30 days." |
| Super-admins: **Invite super-admin** sheet, Invitations section, row ⋯ (**Reset two-step**, **Remove**) | – pattern | the change pattern (`changes/change-sheet.tsx`, `preview-lines.tsx`, `reason-field.tsx`, `use-change.ts`), `ui/dropdown-menu`, `ConfirmDialog` for withdraw and reset (with reason), email field as `features/team/invite/email-box.tsx` (`type=email`, `autoComplete=off`, no spell-check or capitals) | refused messages in the sheet; open-invitation refusal offers **Resend** (`next: 'resend_invitation'`); "Expired" rose badge; **Resend** disabled until `resendableAt`; own row has no ⋯ actions |
| Releases feature page: *Included in* / *Not in* / the line | – | `release-sections.tsx` | core and add-on variants |
| **Staff sign-up** (public) | – pattern from [SignUp](../design/claude-design/SignUp.dc.html) and two-step set-up (needs-design) | `components/auth/auth-layout.tsx`, `password-input.tsx`, `password-rules.tsx` (`new-password-fields.tsx`), `features/two-step/two-step-setup.tsx` + `use-two-step-setup.ts` (started at the scan step with the password just typed: `confirmPassword(password)`), `components/auth/totp-qr.tsx`, `code-input.tsx`, `backup-codes.tsx`, `features/security/passkey-actions.ts` (`useAddPasskey`), `features/invitations/invitation-closed.tsx` layout for bad links | join (new / resume), scan, wrong code, backup codes, passkey offer (unsupported device → skipped automatically), expired, withdrawn, used (**Sign in**), customer account, signed in as someone else (**Sign out and continue**), network failure (fields kept) |
| **My account** (console) | – pattern from [SecuritySettings](../design/claude-design/SecuritySettings.dc.html) | new `features/security/security-cards.tsx` (name field, sign-in card, passkeys card, sessions card, dialogs host, intent): extracted from `security-page.tsx` so both pages render the same cards; the console page adds its own header and title | as My security (loading, card errors, reauth dialogs) |
| Customer *Invite people* row problem for a staff email | – | `features/team/invite/invite-rows.tsx`, `use-send-invitations.ts` (new `staffAccounts` list beside `alreadyMembers`) | – |
| Customer accept page, staff email | – | `features/invitations/invitation-closed.tsx` (new variant) | – |

**Not imported the wrong way:** the console imports customer code (`features/security/*`, `features/two-step/*`, `components/auth/*`), which is allowed; nothing customer-side imports `features/console/` or `@vento/shared/console` except the lazy staff sign-up route chunk. `scripts/bundle-check.mjs` keeps `features/console/` and `packages/shared/src/console/` forbidden in Home's first load, and `features/security/` stays forbidden there too, so `security-cards.tsx` can't leak into it. Report Home's first load before and after (190.0 KB of 200 KB at slice 1; 1b should only shrink it by removing the console entries).

**Design deviations** (to `docs/design/CHANGES.md`): Dashboard built from the role-home anatomy without a board; "sign-ups not finished" counts the last 7 days (the panel's own period) where the spec's source table said 30; the platform action names are `superadmin.*`; staff sign-up has no Terms checkbox (§1b.20).

## 1b.14 Naming and domain

### "Vento Real Estate" sweep
Found with `git grep -nP 'Vento(?! Real Estate)'` over product code (comments, identifiers, `@vento/*`, `vento_*`, `VENTO_*`, cookie names and the customer "Vento Homes" excluded). Each file changes only user-visible strings:
- **apps/api email templates:** `email/templates/security-alert.ts` (19 strings), `platform-notices.ts`, `verify-email.ts`, `invitation.ts` ("… on Vento Real Estate", "via Vento Real Estate"), `reset-password.ts`, `trial-ending.ts`, `layout.ts` (footer).
- **apps/api operation and refusal copy:** `platform/operations/plans.ts` (14), `operations/super-admin.ts`, `operations/release.ts`, `platform/super-admins.ts` (`NOT_SUPER_ADMIN`), `platform/platform-audit.ts` (organization notice actor "Vento Real Estate", scheduled actor), `platform/seed-plans.ts`, `platform/limits.ts`, `platform/console/super-admins.service.ts`, `platform/console/access.service.ts`, `platform/cli/{context,flags,plans,superadmin}.ts` (`BREAK_GLASS_REFUSAL`, help text), `modules/invitations/invitations.service.ts` ("You already have a Vento Real Estate account…"), `modules/members/members.service.ts`, `auth/security-store.ts`, `access/middleware.ts` (session-expired sentence), `app.ts`.
- **apps/api identity names:** `auth/auth.ts` `appName` and TOTP `issuer` → "Vento Real Estate" (new authenticator entries only; existing ones keep their label), `auth/webauthn-settings.ts` `rpName` → "Vento Real Estate".
- **packages/shared:** `account/two-step-copy.ts`, `auth/error-codes.ts` (message), `features/catalog.ts` (`ai.ask` label "Ask Vento" → **"Ask"**, approved short form c; the AI marker carries the brand).
- **apps/web:** `components/{session-expired-dialog,system-status}.tsx`, `components/errors/{not-found-page,offline-page,server-error-page}.tsx`, `components/auth/backup-codes.tsx` (download file heading), `components/shell/{entity-switcher,entity-menu,more-sheet,user-menu-panel}.tsx`, `components/vento-mark.tsx` (the mark's accessible name "Vento Real Estate"; the visible lockup "Vento | REAL ESTATE" counts as the full name, short form a), `lib/{error-copy,auth-errors}.ts`, `features/plan/{talk-to-vento,talk-to-vento-button,upgrade-hint-rows,trial-line,plan-limit-message}.tsx|ts` (**Talk to Vento Real Estate**, "Contact Vento Real Estate"), `features/team/{team-context-line.tsx,invite/plan-places.ts,invite/invite-footer.tsx}`, `features/companies/{companies-context-line.tsx,sheet/plan-limit-dialog.tsx}`, `features/organization/profile/organization-form.tsx`, `features/onboarding/onboarding-layout.tsx`, `features/invitations/invitation-closed.tsx`, `features/auth/password-step.tsx`, `routes/_auth/accept-invitation.$token.tsx`, `features/shell/command-results.tsx`, `features/security/security-page.tsx`, and in the console `shell/{console-nav,console-top-bar,use-console-title}.ts(x)`, `access/{confirm-its-you,two-step-missing}.tsx`, `changes/{reason-field.tsx,change-errors.ts}`, `releases/release-page.tsx`, `organizations/{activity-card.tsx,override-words.ts,sheets/release-group-sheet.tsx}`, `activity/activity-page.tsx`, `super-admins/{super-admins-page,super-admin-changes}.tsx`.
- **docs/help:** `README.md` and `getting-started/{find-your-way-around,invite-your-team,join-your-team,make-a-role,set-up-your-companies,set-up-your-organization}.md`.
- **Not changed:** seed and fixture customer data ("Vento Homes Ltd"), code names (`VentoMark`, `talkToVento`, `@vento/*`), test emails on `test.vento.ng`, and past audit rows (append-only; they keep "Vento").

### The copy test (fails on a bare "Vento")
- `packages/shared/src/brand/bare-vento.ts` (+ test): `findBareVento(text): string[]` = matches of `/\bVento\b(?! Real Estate)/` after removing the allow-list: `Vento Homes` (customer data), `Vento | REAL ESTATE` (lockup), and exact strings listed with a reason in `BRAND_ALLOW` (e.g. the wordmark's `Vento` text node in `vento-mark.tsx`, which sits beside its descriptor).
- `apps/web/src/test/brand-copy.test.ts`: reads every non-test `.ts`/`.tsx` under `apps/web/src` plus `index.html`, removes comments with a small string-aware stripper (`stripComments` in `bare-vento.ts`), and scans what's left. No parser is needed: identifiers can't match (`VentoMark` and `talkToVento` have no word boundary after or before "Vento", and package and cookie names are lower case), so what matches is copy. (TypeScript 7 in this repo has no stable compiler API, and adding a parser would be a new dependency.)
- `apps/api/src/test/brand-copy.test.ts`: the same scan over `apps/api/src` (excluding `test/`, `db/seed.ts` and tests) and `packages/shared/src`; **renders every email template** with the cases in `email/templates/templates.test.ts` and scans subject, text and HTML; scans `docs/help/**/*.md` outside code spans.
- A failure prints file, line and the string, so the next brick can't add a bare "Vento" without noticing.

### Domain `realestate.ventoerp.com`
- **Code:** nothing hard-codes the host. `WEB_ORIGIN` sets CORS, trusted origins, links in emails and the passkey relying party (`webauthn-settings.ts`: `rpID = hostname`, `origin = origin`). Production sets `WEB_ORIGIN=https://realestate.ventoerp.com`.
- **Passkeys (decision 0019):** bound to the host. Nothing runs on `app.ventoerp.com` yet, so the move costs nothing. If anything had been made there, those passkeys would stop working and people fall back to password and code; no related-origins file is planned. Decision 0022 records the host; 0019 isn't edited.
- **Environment and ops (`.env.example`, RUNBOOK §6 and "Environment variables"):** `WEB_ORIGIN`, `EMAIL_FROM="Vento Real Estate <no-reply@realestate.ventoerp.com>"` with the Postmark sender signature, DKIM and Return-Path on that domain, `SUPPORT_EMAIL` and `SECURITY_ALERT_EMAIL` on Vento Real Estate addresses, TLS for the host. Tests keep their `test.vento.ng` and `support@vento.ng` fixtures (not user-visible).
- **Docs:** `docs/ARCHITECTURE.md` (the console row and any host), slice 1 of this plan (header line "Domain" and decision 0021's text), RUNBOOK §6. Done: they now say `realestate.ventoerp.com`; the committed 0019 and 0021 files carry dated amendment lines pointing at 0022 and 0023.

## 1b.15 Files

**packages/shared**
- `src/console/schema.ts` (+ `schema.test.ts`): invite, resend, withdraw, reset-two-step inputs; `staffInvitationRow`; `staffJoinPreview`, join inputs; `dashboard`, `attentionItem`, `feedRow`, `accountActivity`; `releaseDetail.planVersions`; `superAdminRow.canResetTwoStep`; `addSuperAdmin` removed
- `src/console/contract.ts`: `dashboard`, `organizations.accountActivity`, `superAdmins.{invitations,invite,resendInvitation,withdrawInvitation,resetTwoStep}`, `join.{get,start}`; `superAdmins.add` removed
- `src/common/errors.ts`: `staff_account`, `staff_customer_account`, `next: 'resend_invitation'` + `invitationId`
- `src/access/schema.ts`: `invitationPreview.staffAccount`
- `src/auth/fields.ts`: `accountKind`
- `src/auth/error-codes.ts`, `src/account/two-step-copy.ts` (+ test), `src/features/catalog.ts`: copy
- `src/brand/bare-vento.ts` + `bare-vento.test.ts`: matcher, allow-list, comment stripper
- `src/account/schema.ts`, `src/audit/actions.ts`: comment wording only

**apps/api**
- `drizzle/0013_staff_accounts.sql` (generated), `drizzle/0014_staff_account_guards.sql` (custom) + `drizzle/meta`
- `src/db/schema/auth.ts`: `accountKind` enum and column
- `src/db/schema/platform.ts`: `staffInvitationStatus`, `staffInvitations`, `platformChannel` + `account`
- `src/db/schema/audit.ts`: `audit_events_action_created_idx`
- `src/access/context.ts`: `AuthUser.accountKind`
- `src/access/middleware.ts`: `authenticate` copies it; `memberMiddleware` NOT_FOUND for staff; copy
- `src/router.ts`: `...CONSOLE_PUBLIC_PROCEDURES` in `PUBLIC_PROCEDURES`
- `src/auth/policy.ts`: staff invitation constants
- `src/auth/clear-second-factors.ts` + test: extracted wipe (reset and close modes)
- `src/auth/auth.ts`: staff sign-in guard; `appName`, `issuer`
- `src/auth/hooks/two-step-guard.ts`: setup mode calls `completeStaffJoin` for staff
- `src/auth/hooks/verification.ts`: no reset email to joining or closed staff; staff note on a duplicate sign-up
- `src/auth/security-store.ts`: `IdentityUser.accountKind`; staff requirement first
- `src/auth/passkey-availability.ts`: no-organization staff rule in `passkeysAvailableHere`
- `src/auth/webauthn-settings.ts`: `rpName`
- `src/modules/audit/audit.service.ts`: no-membership branch hands staff events to the platform trail
- `src/modules/account/account.service.ts`: `nextStep` for staff accounts
- `src/modules/invitations/invitations.service.ts` (+ test): staff email refusals (create, resend, preview, accept, accept as new user)
- `src/modules/onboarding/onboarding.service.ts` (+ test): refuse staff
- `src/modules/members/members.service.ts`: uses `clear-second-factors.ts`; `roleKey` metadata on `member.access_changed`; copy
- `src/platform/staff-accounts.ts` + test: state, discard, close
- `src/platform/staff-account-events.ts`: platform-trail account events
- `src/platform/operations/staff-invitations.ts` + `staff-invitations.ops.test.ts`: invite, resend, withdraw, start, complete, previews
- `src/platform/operations/super-admin.ts`: grant and its preview removed; `resetSuperAdminTwoStep`; revoke closes staff accounts; copy
- `src/platform/operations/describe.ts` (+ test): the five new actions
- `src/platform/super-admins.ts`: `openInvitationCount`, copy
- `src/platform/platform-audit.ts`, `src/platform/seed-plans.ts`: actor names
- `src/platform/console/join.service.ts`: `get`, `start` (public)
- `src/platform/console/staff-invitations.service.ts` + `staff-invitations.test.ts`: list, emails after commit
- `src/platform/console/super-admins.service.ts`: rows with `canResetTwoStep`; joined, reset and removed emails
- `src/platform/console/customer-activity.ts`: the feed query (Dashboard and organization card)
- `src/platform/console/dashboard.service.ts` + `dashboard.service.test.ts`
- `src/platform/console/organizations.service.ts`: `limitStanding`, `accountActivity`
- `src/platform/console/releases.service.ts`: `planVersions`
- `src/platform/console/activity.service.ts`: leaves out `channel = 'account'`; both scheduled names
- `src/platform/console/console.router.ts`: new procedures, `CONSOLE_PUBLIC_PROCEDURES`, sign-in after `join.start`, password link after reset
- `src/platform/cli/superadmin.ts`, `cli/context.ts` (`--email`), `cli/change-commands.ts`: invite, bootstrap link, grant refusal, registry
- `src/email/mailer.ts`: tag `staff_invitation`
- `src/email/templates/staff-invitation.ts` + `platform-notices.ts`: invitation, invited, joined, reset and removed notices; cases in `templates.test.ts`
- `src/email/templates/*`, `platform/operations/*`, `platform/cli/*` and the other §1b.14 files: naming
- `src/test/brand-copy.test.ts`
- `src/test/factories.ts`: `createStaffAccount({ state: 'active' | 'joining' | 'closed', twoFactorEnabled })`, `createStaffInvitation({ status, started })`; `createSuperAdmin({ organization })` removed
- `src/test/router-client.ts`: `consoleClientAs` takes a staff account
- `src/test/procedure-guard.test.ts`: public join procedures; staff walk
- `src/platform/console-access.test.ts`, `src/platform/console-parity.test.ts`, `src/platform/console/console.test.ts`: updated
- `src/test/isolation.test.ts`: Dashboard and account activity
- `src/test/e2e-fixtures.ts`, `src/db/seed.ts`: §1b.17

**apps/web**
- `src/routes/console/index.tsx` (Dashboard), `src/routes/console/organizations.index.tsx`, `src/routes/console/account.tsx`, `src/routes/_auth/staff-invitation.$token.tsx`, `src/routes/_auth.tsx`
- `src/features/console/dashboard/{dashboard-page,dashboard-numbers,attention-queue,customer-activity-panel,plans-releases-panel,dashboard-skeleton}.tsx`, `feed-row.tsx`, `queries.ts`, `dashboard-words.ts` + test
- `src/features/console/organizations/account-activity-card.tsx`; `organization-page.tsx`, `queries.ts`, links to `/console/organizations`
- `src/features/console/super-admins/{invite-sheet,invitations-section,super-admin-actions,reset-two-step-dialog,withdraw-dialog}.tsx`, `queries.ts`; `super-admin-changes.tsx` (add sheet removed), `super-admins-page.tsx`
- `src/features/console/account/my-account-page.tsx`
- `src/features/console/join/{join-client.ts,staff-sign-up-page.tsx,join-form.tsx,join-two-step.tsx,join-passkey.tsx,join-closed.tsx,use-staff-join.ts}` + tests
- `src/features/console/releases/release-sections.tsx`
- `src/features/console/shell/{console-nav.ts,console-user-menu.tsx,console-more-sheet.tsx,console-top-bar.tsx,console-mobile-tabs.tsx,use-leave-console.ts,use-console-title.ts}` (+ `console-nav.test.ts`)
- `src/features/security/security-cards.tsx` (new), `security-page.tsx` (uses it; super-admin line gone)
- `src/features/two-step/use-two-step-setup.ts`: start from a known password; `src/routes/_app/two-step.setup.tsx`: staff sentence
- `src/features/team/invite/{invite-rows.tsx,use-send-invitations.ts}`: staff row problem
- `src/features/invitations/invitation-closed.tsx`, `src/routes/_auth/accept-invitation.$token.tsx`: staff email state
- `src/components/shell/{user-menu-panel,more-sheet}.tsx`, `src/features/shell/command-results.tsx`: console entries removed
- the §1b.14 web files: naming; `src/test/brand-copy.test.ts`
- `e2e/console/{staff-sign-up,dashboard,my-account}.spec.ts` (new); `access`, `super-admins`, `organizations`, `accessibility` specs updated; `e2e/support/{console,fixtures}.ts`

**Root:** `.env.example` (comments: domain, sender, "Talk to Vento Real Estate"); no new variables.

## 1b.16 Tests

**Shared:** `findBareVento` and `stripComments` (strings with `//` inside, JSX comments, the allow-list); staff schemas (email lower-cased, name rules, token length); two-step staff sentences.

**API (Vitest, real Postgres, `withRollback`)**
| Area | Cases |
|---|---|
| Migration 0014 (`staff-accounts.migration.test.ts`, on a fresh schema with a fixture before 0014) | a super-admin with an active membership is revoked with the platform row (reason, actor "Vento Real Estate (setup)", channel `command`) and keeps membership, password, two-step and passkeys; one with no membership becomes staff; console windows cleared; triggers: member insert for staff refused, `platform_admins` insert for a customer refused, kind update refused |
| Staff invitations (`platform/console/staff-invitations.test.ts`, spec path) | invite happy path (row, 48 h, email to the invitee, notice to the others, event); refusals: customer account, active super-admin, open invitation (with `next` and id), sixth open, closed account allowed; fourth-super-admin line counts invited; resend: new link works, old link is expired, second within a minute refused, an expired one revived; withdraw: link shows withdrawn at once, stale when accepted meanwhile; expiry at 48 h exactly (fake clock); idempotent apply (same key → one row, one email) |
| Staff sign-up (same file) | `join.get` for every status and an unknown token (no inviter); `start` creates a staff user with no membership, no terms, email verified, and signs in; resume asks for the password and ignores the name; wrong password counts towards the lock; verify-totp in setup mode makes them a super-admin, accepts the invitation, writes `superadmin.joined` (actor the new person) and the account events on the platform trail; invitation withdrawn between start and verify → no super-admin; the email got a customer account meanwhile → `customer_account`, nothing created; rate limits (21st `get`, 11th `start` in a minute → 429); wrong codes at set-up don't lock and a right code still works |
| Discard | an unfinished account whose invitation expired is deleted on the next invite, resend, withdraw or refused sign-in, with its sessions, credential and factors; resend of a started invitation discards and starts fresh; no FK blocks the delete |
| Staff rules | staff gets NOT_FOUND from every `member` procedure (walk, no writes); `onboarding.createOrganization` refused; customer `invitations.create` with a staff email → `staff_account` with the email listed and nothing sent; `resend` likewise; `preview.staffAccount`; `accept` and `acceptAsNewUser` refused; a customer sign-up with a staff email answers normally and sends the staff note |
| Sign-in | active staff with code or passkey → `nextStep 'console'`, `second_factor_at` set; joining with an open invitation → allowed, `two_step_setup`; joining with an expired invitation → wrong-password answer and the account discarded; closed → wrong-password answer, counted; reset-password request for joining or closed staff sends nothing |
| Reset two-step (console) | another super-admin: sessions gone, passkeys and authenticator removed, `password_reset_required`, reset link requested, notices; own row refused; at next sign-in two-step set-up before the console opens (`console_two_step_required` until then) |
| Removal | staff account closed (no credential, no factors, no sessions), sign-in fails like a wrong password, name stays on Activity; re-invite and join work on the same user row |
| Account events | a staff person's sign-in, two-step enabled, passkey added and `console.opened` land on the platform trail with channel `account`; Activity, `activity.people`, Dashboard recent changes and command-line queue never show them; a customer with no organization still only logs |
| My account procedures | `account.security` for staff: `twoStepRequiredBy.reason 'super_admin'`, passkeys available with no organization, turn-off refused with the staff sentence; rename and remove passkey work |
| Dashboard (`dashboard.service.test.ts`, spec path) | one seeded case per number, queue row and summary count, each compared with its source query; internal organizations excluded from every number, queue row and the feed and counted only as "Internal"; queue order and the 8-row cap with `more`; command-line rows include legacy null-channel rows but not scheduled ones; new owner only with `roleKey 'owner'`; at-limit vs over-limit; quiet uses created-at when nobody was ever active; facts-only JSON scan (no member names, emails, IPs, devices) on `dashboard.get` and `accountActivity`; timing on 2,000 seeded organizations reported |
| Releases | `planVersions` with included and not-in plans; core and add-on features |
| Commands (`console-parity.test.ts`, `superadmin` CLI tests) | `invite --break-glass` vs console invite: same audit fields and invitation email, link never printed; `invite --bootstrap` prints a working link only with no super-admin, re-run replaces it; `grant` refuses with the spec sentence; registry has `superadmin invite` and no `superadmin grant` |
| Walks | access walk skips the two public procedures and checks they're in `PUBLIC_PROCEDURES`; anonymous walk; staff walk; area walk (`join.*` keep `area: 'console'`) |
| Isolation | `accountActivity` of organization A carries no row of B; a console reset or removal touches no organization's data or audit trail |
| Naming (`apps/api/src/test/brand-copy.test.ts`) | every rendered email template, operation message and shared copy has no bare "Vento"; help articles too |

**Web units:** console nav (Dashboard first, tabs, `isCurrent` exact for `/console`); Dashboard words (plurals, "nobody active for 18 days", "Enterprise trial ends in 2 days"); invite sheet refusal with **Resend**; staff sign-up state machine (new, resume, bad links, signed in as someone else); `security-cards` renders on both pages; `apps/web/src/test/brand-copy.test.ts`.

**Playwright** (desktop and mobile unless noted)
| Spec | Checks |
|---|---|
| `e2e/console/staff-sign-up.spec.ts` (J-ADM-05) | fixture invitation → open the link from the mailbox → name and password → scan (TOTP helper) → code → backup codes → **Skip for now** → Dashboard with the welcome toast, no *Confirm it's you* (5 clicks); leave after the password and reopen → password only, resumes at two-step; expired, withdrawn and used links; signed in as a customer → **Sign out and continue**; virtual authenticator → **Add passkey** (desktop); 375 px |
| `e2e/console/dashboard.spec.ts` (J-ADM-06) | sign in → Dashboard (0 clicks); a fixture's trial-ending, over-limit, no-plan and quiet organizations each appear with their action (asserted by the fixture's unique names, never by totals: the e2e database is shared); an internal fixture organization never appears; **Review** opens the organization; the search box opens Organizations filtered; 375 px layout; axe light and dark |
| `e2e/console/my-account.spec.ts` (J-ADM-07) | change name; change password (other sessions end); new backup codes after a code; add, rename, remove a passkey (virtual authenticator, desktop); sign out other sessions; two-step shows "Required for Vento Real Estate staff" with no **Turn off** |
| `e2e/console/super-admins.spec.ts` (J-ADM-03, changed) | invite (3 clicks) → Invitations row with expiry; resend; withdraw (link then shows withdrawn); a customer email refused; reset two-step on another super-admin; remove → that person's next request is signed out and their sign-in fails; no actions on own row; Activity by person |
| `e2e/console/access.spec.ts` (changed) | staff sign-in lands on the Dashboard; `/settings/team` and `/` send staff to `/console`; customers and revoked super-admins: 404 and no console code; customer user menu, More and ⌘K have no console entry |
| `e2e/console/organizations.spec.ts` (changed) | Organizations at `/console/organizations`; Account activity card; Releases feature page shows *Included in* links and *Not in* |

## 1b.17 Seed and fixtures
- **Seed (`src/db/seed.ts`, idempotent):** Ada Okafor (`ada@ventoerp.com`) and Tunde Bello (`tunde@ventoerp.com`) are staff accounts with no organization, made through `createStaffUser` (the same insert `join.start` uses) with an active `platform_admins` row, then two-step through Better Auth as today (secret printed the first time). On an existing local database, Ada's Vento Homes viewer membership is marked removed first (status `removed`, `removed_at`), and her `account_kind` can't be changed by the trigger, so the seed tells the developer to reset the database (`pnpm db:down && pnpm db:up && pnpm db:migrate && pnpm db:seed`) when it finds Ada as a customer, instead of half-converting her. One open staff invitation: Chika Obi (`chika@ventoerp.com`), invited by Ada, 48 hours; each seed run replaces its token and prints the link. "Vento" as Ada's company name in `upsertPerson` is dropped (staff have none).
- **e2e fixtures (`src/test/e2e-fixtures.ts`):**
  - `super-admin <active|revoked|two-step-reset>` (staff accounts; `member` and `no-org` removed);
  - `staff-invitation <pending|expired|withdrawn|accepted|started> [inviterEmail]` → `{ email, name, link, inviterName }` (the link from the token it just made);
  - `customer-account <email>` (for the "got a customer account meanwhile" case);
  - `dashboard` → four standard organizations with unique names (trial ending in 2 days, people over the limit, no plan, nobody active for 18 days), one internal organization with all of these, and a break-glass row; prints the names;
  - `age-staff-invitation <email> <hours>` (expiry without waiting).
  - `e2e/support/console.ts` gains `signInAsStaff` and `openStaffInvitation`; the existing `age-console`, `age-second-factor`, `age-passkeys` and `platform-activity` stay.

## 1b.18 Build order
Slice 1 is built; 1b lands as reviewable commits on the same branch. The deploy migration and the removal of `superAdmins.add` land together with the invite flow, so there's never a build where nobody can become a super-admin.

1. **Shared (½ day; blocks both tracks).** Console schemas and contract (dashboard, invitations, join, reset, account activity, plan links; `add` removed), error reasons, `invitationPreview.staffAccount`, `accountKind` field, two-step copy, `bare-vento.ts`. *Commit 1.*
2. **In parallel:**
   - **Backend (4 days)**
     - B1. Migrations 0013 and 0014, schema, `accountKind` through Better Auth and `authenticate`, the three triggers, migration test. *Commit 2.*
     - B2. `clear-second-factors.ts` (members reset switched to it, its tests green), `staff-accounts.ts`, `staff-account-events.ts` and the `recordAccountEvent` branch, staff rules (member middleware, onboarding, customer invitations, sign-in guard, reset-email skip, existing-account note, passkey availability, `nextStep`). Staff walk. *Commit 3.*
     - B3. Staff invitation operations, `join.service.ts`, the verify-hook join, emails, console router (`superAdmins.*`, `join.*`, public list), reset two-step, revoke closes the account. *Commit 4: the security agent reviews this one early (public token procedures, the hook, account closure).*
     - B4. Dashboard (`limitStanding`, `customer-activity.ts`, `dashboard.service.ts`), `accountActivity`, `planVersions`, `roleKey` metadata. *Commit 5.*
     - B5. Commands (`invite`, bootstrap link, grant refusal, registry, parity), `describe.ts`, actor names. *Commit 6.*
     - B6. Seed and e2e fixtures. *Commit 7.*
   - **Frontend (4 days; against the commit-1 types with a mocked client until B3 and B4)**
     - F1. Route moves (Dashboard at `/console`, Organizations at `/console/organizations`), nav, tabs, user menu and More (**My account**), `_auth.tsx` changes; customer console entries removed. *Commit 8.*
     - F2. `security-cards.tsx` extraction (My security unchanged on screen) and My account. *Commit 9.*
     - F3. Super-admins: invite sheet, Invitations section, row actions. *Commit 10.*
     - F4. Staff sign-up route and states. *Commit 11.*
     - F5. Dashboard and the Account activity card; Releases plan links. *Commit 12.*
     - F6. Customer invite row problem and accept-page state.
3. **Naming and domain (1 day, after both tracks merge locally, since it touches files from both):** the §1b.14 sweep, both copy tests, `.env.example`, `catalog.ts` "Ask". *Commit 13.*
4. **Then (1–2 days):** e2e specs (*commit 14*), docs and decision records (*commit 15*), reviewer, ui-designer (Dashboard, staff sign-up, My account, Super-admins at 375 and dark), security audit of 1b, fixes, then the PR is ready for review.

## 1b.19 Docs (the implementer commits these)
- **Decision records** `docs/decisions/0022-the-product-is-always-called-vento-real-estate.md` and `0023-staff-accounts-are-separate-from-customer-accounts.md` (text below), two rows in `docs/decisions/README.md`. 0015's "Trust model" section gains one line: "A super-admin is a staff account, never a role on a customer account (decision 0023)." 0019 and 0021 are not edited; the new records say what they amend.
- **`docs/DOMAIN.md`:** exactly the spec's "Changes to DOMAIN.md (1b)" (Super-admin, Console, Staff account, Staff invitation, Dashboard (console), Platform audit event, the "Vento" → "Vento Real Estate" notes, the access rules, the new **Naming** section). The AI table and `docs/PRODUCT.md`: "Ask Vento" → "Ask" (short form c approved).
- **`docs/journeys/12-vento-admin.md`:** J-ADM-05, 06, 07 and the changed J-ADM-03 → `built` when merged; J-ADM-01 and 02 step 1 "sign in → Dashboard", J-ADM-02 the plans line; Test lines as §1b.16; "Behind the scenes" of J-ADM-05 uses `superadmin.joined` (the code's name). `docs/journeys/README.md` row unchanged apart from status.
- **`docs/design/SCREENS.md` §15 and §0:** the 1b rows (already added by the product manager) → `built` as each lands; the §0 user-menu and My security rows lose the console line. **`docs/design/CHANGES.md`:** the §1b.13 deviations.
- **`docs/RUNBOOK.md`:** §3 (`superadmin invite` replaces `grant` under break-glass; the link is emailed, never printed); §4 (first super-admin: `pnpm superadmin invite --bootstrap --email … --name …`, open the printed link within 48 hours, finish the staff sign-up, then sign in at `/console`); §6 (passkey domain `realestate.ventoerp.com`); deploy notes for 0013 (additive; index built inside the migration transaction) and 0014 (**who loses super-admin**: list `select u.email from platform_admins pa join users u … join members m … where pa.revoked_at is null and m.status = 'active'` before deploying and tell them; if none remains afterwards, run the bootstrap invitation at once); environment variables (`WEB_ORIGIN`, `EMAIL_FROM`, sender domain).
- **`docs/ARCHITECTURE.md`:** host `realestate.ventoerp.com`; layout (`platform/staff-accounts.ts`, `operations/staff-invitations.ts`, `console/join.service.ts`, `dashboard.service.ts`); request flow: staff accounts stop at `memberMiddleware`; data: `users.account_kind`, `staff_invitations`, the platform trail's `account` channel; the commands row (`superadmin invite`).
- **`docs/specs/README.md`:** admin-console stays `in build` until the PR merges, then `shipped`.
- **`CHANGELOG.md`:** "Changed: the product is called Vento Real Estate everywhere, including emails and the authenticator app's entry for new set-ups." and "Security: Vento Real Estate staff now use separate staff accounts, never your organization's member list." (customers see nothing else new).
- **`docs/help/`:** the naming sweep only; staff journeys stay out of the customer help centre (slice 1 note).
- **Skills:** `add-module` §10 (a staff account gets NOT_FOUND from every `member` procedure; the staff walk checks new ones automatically); `testing-patterns` (`createStaffAccount`, `createStaffInvitation`, staff fixtures); `review-checklist` (the copy test must stay green; `platform/console/` still never reads buyer, money, document or KYC tables; Dashboard queries never select `actor_name`, `target_label`, IP or device from `audit_events`); `ux-writing` (the naming rule and the three short forms).

### Decision record 0022
```markdown
# 0022 · The product is always called Vento Real Estate

- **Date:** 2026-11-27
- **Status:** proposed

## Context
Vento has other products (Vento Hotels; Vento Manufacturing, the original "Vento ERP"), so "Vento" alone on a screen, in an email or in an authenticator app doesn't say which product it is. The owner asked that this product always says "Vento Real Estate" (docs/specs/admin-console.md, slice 1b) and moved it to its own host, realestate.ventoerp.com. Until now the copy said "Vento" in many places, and the docs named app.ventoerp.com as the host.

## Decision
Every user-visible word says "Vento Real Estate", never "Vento" alone: product and page titles, the console ("Vento Real Estate console", "Vento Real Estate staff · all customers"), email senders, subjects, bodies and footers, the authenticator app issuer and the passkey relying-party name, customer audit entries (actor "Vento Real Estate"), errors, help articles, PDFs and the logo's accessible name; the possessive is "Vento Real Estate's". Three short forms are allowed (owner, 27 Nov 2026): the logo lockup "Vento | REAL ESTATE" counts as the full name; the console's phone top bar may read "Staff · all customers" beside the lockup; the AI feature is called "Ask", with the AI marker. Code and configuration names (`VentoMark`, `@vento/*`, `vento_app`, `VENTO_*`), customer data that contains the word, and past audit rows are not covered. A test scans web copy, API copy, rendered emails and help articles and fails on a bare "Vento" outside an allow-list. The product lives at realestate.ventoerp.com and the console at realestate.ventoerp.com/console; the host comes only from `WEB_ORIGIN`, so passkeys are bound to realestate.ventoerp.com (this updates the host named in decision 0019).

## Consequences
- Customers and staff always know which Vento product they're in; new copy can't drift back (the test fails the build).
- Longer strings: buttons and titles are written for the full name; the three short forms are the only exceptions, and adding another needs the owner.
- Moving the host before launch costs nothing. Moving it again later would make every passkey stop working (decision 0019); people would fall back to password and code.
- Authenticator entries made before the change keep the old "Vento" label until two-step is set up again.

## Alternatives considered
- "Vento" with "Real Estate" only in the logo: ambiguous in emails, authenticator apps and audit trails, where there's no logo.
- A product-name constant in code instead of a test: helps new code but doesn't catch a hard-coded string; the test does both jobs with no indirection in every sentence.
- Keeping app.ventoerp.com: the generic host would be wrong once other Vento products share the domain.
```

### Decision record 0023
```markdown
# 0023 · Staff accounts are separate from customer accounts and join by invitation

- **Date:** 2026-11-27
- **Status:** proposed

## Context
Until now a Vento super-admin was any customer account with an extra `platform_admins` row (decision 0015's model). Staff reached the console from a customer workspace, a super-admin could also be an owner or viewer in an organization, and staff power was tangled with customer membership: a customer's two-step reset could touch a super-admin, the console needed a "Back to {organization}" link, and a super-admin with no organization couldn't manage passkeys (a consequence in decision 0021). The owner decided (docs/specs/admin-console.md, slice 1b, 27 Nov 2026) that staff accounts are only for the console, are made only by invitation, and that one email is either a staff or a customer account.

## Decision
`users.account_kind` is `customer` or `staff`, set when the account is made and never changed (database trigger). A staff account is created only by accepting a staff invitation (or the bootstrap invitation on an empty environment): a platform table `staff_invitations` with a hashed 256-bit token, 48 hours, one pending per email, resend once a minute (new link), withdraw at once, at most 5 open. The public staff sign-up sets a name and password, then two-step through Better Auth; verifying the code makes the person a super-admin and accepts the invitation in one transaction, so there is no super-admin without two-step. A staff account is never a member of an organization and can't create one or accept a customer invitation (service checks, plus triggers refusing a staff `members` row and a customer `platform_admins` row); every customer procedure answers it NOT_FOUND. Staff sign in on the normal sign-in page and land on the console Dashboard; their own sign-in is managed on My account in the console, with the same procedures and cards as My security. Another super-admin resets a lost two-step. Removing a super-admin closes the staff account (sessions, passkeys, authenticator and password removed; name kept on history); inviting the same email again starts fresh on the same account. A staff person's account events go to the platform trail (channel `account`), since they have no organization trail. On the command line, `superadmin invite` replaces `grant`: with `--break-glass` the link is emailed and never printed; `--bootstrap` prints a one-time link when there's no super-admin. At deploy, a super-admin who is also a member of an organization stops being a super-admin, keeps their customer access, and re-joins by invitation with a different email. This amends decision 0015 (a super-admin is a staff account, not a role on any account) and decision 0021 (no console entry in customer menus, no "Back to {organization}", and the no-organization passkey limitation is replaced by My account).

## Consequences
- Staff power and customer data never meet in one account; the support view (slice 2) becomes the only way staff see a customer workspace.
- A staff member who wants to try the product as a customer needs a second email.
- Unfinished staff sign-ups are deleted on the next staff-invitation action or sign-in attempt, not by a job; an expired one can linger until then.
- At deploy, the owner's own account may stop being a super-admin; the bootstrap invitation must be run straight after (RUNBOOK).
- A lone super-admin who loses both phone and backup codes can't be reset from the console; until a break-glass reset exists, production should have at least two super-admins.
- Turning a former staff email into a customer account needs a migration (the kind is fixed).

## Alternatives considered
- Keep super-admins as customer accounts with a role: what the owner asked to end; mixes powers and keeps the passkey gap.
- Derive "staff" from `platform_admins` alone: a removed super-admin or a half-finished sign-up would read as a customer, and could then join an organization with the same email.
- A separate identity store or Better Auth instance for staff: two sign-in systems, two cookies, and passkeys under a second relying party, for no gain at this team size.
- Staff self sign-up restricted to @ventoerp.com: no domain mailboxes yet (owner's decision 8, deferred).
- Granting super-admin when the password is set, with two-step later: a window in which a super-admin has no second factor.
```

## Shared files touched by 1b (coordination with brick 4)
| File | 1b's change | Size |
|---|---|---|
| `apps/api/src/access/middleware.ts` | `authenticate()` copies `accountKind` into `AuthUser`; `memberMiddleware` starts with `if (context.user.accountKind === 'staff') throw notFound()`; the session-expired sentence says "Vento Real Estate". No new middleware. | ~4 lines |
| `apps/api/src/router.ts` | `PUBLIC_PROCEDURES` gains `...CONSOLE_PUBLIC_PROCEDURES` (`console.join.get`, `console.join.start`) and one import. | 2 lines |
| `apps/api/src/modules/audit/*` | `audit.service.ts` `recordAccountEvent`: in the existing "no active membership" branch, `if (await recordStaffAccountEvent(db, input)) return 1` before the log line (plus one import). `recordAudit`, `redact` and the table are untouched. | ~3 lines |
| `packages/shared/src/contract.ts` | **Not changed** (everything new is in the `@vento/shared/console` subpath). | – |
| `packages/shared/src/audit/actions.ts` | **No new actions** (staff account events reuse existing ones; platform actions aren't listed there). One comment: "actor 'Vento'" → "actor 'Vento Real Estate'". | 1 comment |
| `packages/shared/src/access/role-rules.ts` | **Not changed.** | – |
| `packages/shared/src/account/schema.ts` | **No shape change.** Two comments say "Vento Real Estate" and "staff account". | 2 comments |
| `apps/api/src/platform/cli/main.ts` | **Not changed** (`--email` is parsed in `cli/context.ts`; `invite` lives in `cli/superadmin.ts`). | – |

Other shared files 1b touches, outside brick 4's list: `packages/shared/src/common/errors.ts` (append-only enum values), `access/schema.ts` (one field), `auth/fields.ts` (one field), `auth/error-codes.ts` and `account/two-step-copy.ts` (copy), `features/catalog.ts` (one label), and `apps/api/src/modules/members/members.service.ts` (the extracted helper and the `roleKey` metadata). Whichever branch merges second rebases; every overlap is a few appended or reworded lines.

## 1b.20 Risks, decisions and questions

**For the owner (one item)**
1. **Production may run with a single super-admin, or none, right after deploy.** Your own account is probably a member of an organization, so it stops being a super-admin at deploy (your decision 2), and the bootstrap invitation makes exactly one staff account. A lone super-admin who loses both phone and backup codes can't be reset from the console (backlog 15 isn't built). *Recommended:* on deploy day, bootstrap your staff account and invite a second super-admin (Tunde) at once, and treat "two super-admins" as part of the deploy checklist. **Alternative:** pull backlog 15 (a break-glass `superadmin reset-two-step` command) into 1b, about half a day.

**Decisions this plan makes (say if you disagree)**
- **Staff sign-up has no Terms checkbox.** The customer terms are for customers; staff are covered by their employment terms.
- **Resending a half-finished invitation starts it fresh** (the half-made account is discarded). That's also the way out of a forgotten password mid-sign-up: reset-password emails aren't sent to unfinished staff accounts.
- **Unfinished accounts are deleted on the next staff-invitation action or sign-in attempt,** not by a scheduled job (there's no job system yet).
- **A staff person's sign-ins and security events are kept on the platform trail but not shown on Activity** in 1b. Activity stays a list of changes, as in slice 1; they're there for investigations.
- **"New owner" in the feed** works because the access-change event now also records the role key (one extra field on an existing event). Older events without it are left out.
- **"Sign-ups not finished" counts the last 7 days,** the panel's own period (the spec's source table said 30).
- **Platform action names stay in the existing style** (`superadmin.invited`, not `super_admin.invited`).
- **Code attempts at staff sign-up use Better Auth's existing per-network limit** (at most 3 every 10 seconds), not a new 10-a-minute rule, so customer sign-in from a shared office network isn't squeezed. Wrong codes at sign-up never lock.

**Risks**
- **Better Auth's own two-step lockout at set-up:** the plugin's `accountLockout` (5 failures) might count set-up attempts and refuse a later right code for 15 minutes. Verify on day 1 (a test pins it). Fallback: the sign-up's **Start again** calls `/two-factor/enable` once more, which issues a fresh secret and resets the row.
- **The join runs in Better Auth's after-hook,** after two-step is committed: if it fails (invitation withdrawn a moment before), the person has two-step but isn't a super-admin. Handled: `join.get` shows the withdrawn or expired state, and the next staff action discards the account. A test covers it.
- **Deploy order:** 0014 revokes super-admins who are members before any staff account exists. If nobody remains, the console is unusable until the bootstrap link is used (48 hours). The RUNBOOK deploy note makes it one step: migrate, `superadmin invite --bootstrap`, finish the sign-up, invite a second super-admin.
- **Local databases with the old seed:** Ada is a customer there and her kind can't change (trigger). The seed stops with the reset instructions rather than half-converting.
- **Deleting an unfinished user** must not hit a restrict FK. A joining account writes no audit rows (account events only go to the platform trail after the join), and a test lists every FK to `users` and checks the delete.
- **`memberMiddleware` change for everyone:** it reads a field already on the session's user, so no query is added; the staff walk proves it fires before any membership read.
- **Dashboard scale:** the counts are sequential scans over `members`, `invitations` and `users`, and over-limit stays in memory. Measured on 2,000 seeded organizations; the partial index on `members.last_active_at` is the first thing to add if p95 goes over 300 ms.
- **Removing the console entries from the customer shell** changes `user-menu-panel.tsx`, `more-sheet.tsx` and `command-results.tsx`; the bundle report must show Home's first load the same or smaller.

**Follow-ups (not in 1b)**
- Show staff sign-in and security events on My account or Activity.
- Break-glass `superadmin reset-two-step` (backlog 15) if the owner doesn't pull it in.
- Everything in the spec's "Console backlog (later)".

Files read for slice 1b:
- `docs/specs/admin-console.md` (1b and the amendments), slice 1 of this plan, `docs/journeys/12-vento-admin.md`, `docs/design/SCREENS.md` §15, `docs/RUNBOOK.md` headings, `docs/decisions/0000-template.md`
- `apps/api/src/platform/{super-admins,platform-audit,seed-plans}.ts`, `platform/operations/super-admin.ts`, `platform/console/{console.router,apply-once,actor,super-admins.service,organizations.service,releases.service}.ts`, `platform/cli/{superadmin,change-commands,context,break-glass,main}.ts`
- `apps/api/src/{orpc,router,api-contract,env}.ts`, `access/{middleware,console-middleware}.ts`, `auth/{auth,webauthn-settings,passkey-availability}.ts`, `auth/hooks/{two-step-guard,audit-hooks,verification}.ts`, `modules/account/{account.service,account.router}.ts`, `modules/invitations/{invitations.service,invitations.router,invitation-token}.ts`, `modules/members/{members.service,members.router}.ts`, `modules/audit/audit.service.ts`, `db/schema/{auth,platform,audit,access}.ts`, `db/{migrate,seed}.ts`, `drizzle/0004_platform_guards.sql`, `drizzle/0006_team_backfill.sql`, `test/e2e-fixtures.ts`
- `packages/shared/src/{console/contract,console/schema,account/schema,account/two-step-copy,audit/actions,common/errors}.ts`
- `apps/web/src/routes/{console,_app,_auth}.tsx`, `routes/console/index.tsx`, `routes/_app/two-step.setup.tsx`, `features/console/{shell/console-nav,shell/console-user-menu,words}.ts(x)`, `features/security/*` (imports), `components/vento-mark.tsx`, `scripts/bundle-check.mjs`, `.env.example`

### 1b owner's answer (27 Nov 2026)
- **Lone super-admin lockout:** build the break-glass `superadmin reset-two-step <email> --break-glass --by … --reason …` in 1b (step B5). It clears the person's two-step with the shared `auth/clear-second-factors.ts` helper, writes a platform audit event, closes their console sessions, and emails the person, every other super-admin and `SECURITY_ALERT_EMAIL` (the same recipients as other break-glass changes). It goes in the parity registry as command-only (the console's **Reset two-step** is its console counterpart). The person then signs in with their password and must set up two-step again before the console opens.
  - *As built (c2d92a8):* `superadmin reset-two-step` keeps the password (`clearSecondFactors` mode `reset_keep_password`) and sends the person the security alert. Like every break-glass command, `--by` must be an active super-admin, and like the console, the target must differ from `--by` ("You can't reset your own two-step. Ask another super-admin."). *Follow-up (owner's intent, as decided):* from the command line with `--break-glass`, `--by` may be the target, so a **lone super-admin who lost their own phone** resets their own two-step from the host (host access is super-admin power anyway, decisions 0015 and 0021). A self-reset always emails `SECURITY_ALERT_EMAIL` as well as every other super-admin and the person, writes the platform event with channel `command`, ends every session, keeps the password, and two-step must be set up again before the console opens. The console's **Reset two-step** still refuses your own row. Otherwise `SECURITY_ALERT_EMAIL` gets the break-glass email only when no other super-admin can be told, as for every break-glass change.
- The architect's three spec departures in 1b.20 (`superadmin.*` event names, 7-day unfinished sign-ups, Better Auth's per-network code limit at staff sign-up) are accepted.
