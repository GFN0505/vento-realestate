# Plan: Vento console, slice 1 (console core)

- **Status:** built on `feat/admin-console` (shared 3444e03, screens 40bdcd6, API e4ab676, break-glass 04b2c85; docs with the e2e specs), awaiting review, the security audit and merge. Approved by the owner on 26 Nov 2026, with both §16 recommendations: `@simplewebauthn/server` and `/browser` imported directly for passkey re-proof, and the Projects column and limit hidden until the projects module counts them.
- **Spec:** [docs/specs/admin-console.md](../specs/admin-console.md) (approved 26 Nov 2026; its "Owner's decisions" are final and not reopened here)
- **Builds on:** [feature-flags](feature-flags.md) (operations, previews, audit, snapshot) and [my-security](my-security.md) (passkeys, in-process code checks, session fields)
- **Journeys:** J-ADM-01, J-ADM-02 (changed: console first, commands as break-glass), J-ADM-03 (new). J-ADM-04 and J-ONB-11 are slice 2 and not planned here.
- **Branch:** `feat/admin-console`, cut from `main` after brick 3d (#8). One branch; §14 splits it into reviewable steps. The **security** agent audits it before the pull request opens (sign-in, console window, passkey check, break-glass).
- **Decision record:** new **0021 · The console is a separate area on the same origin, behind fresh two-step** (full text in §15). It updates the trust-model section of 0015.
- **Domain:** `app.ventoerp.com/console`. Restricting super-admins to an email domain is deferred (owner's decision 8): any existing account with two-step on can be made a super-admin, as today.
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
Vento super-admins change releases, plans, trials, add-ons, overrides and super-admins through commands on the API host, attributed by a typed `--by` email (decision 0015's trust model): anyone with a shell can type any super-admin's address, and a kill switch needs a laptop and host access. The owner approved a web console (docs/specs/admin-console.md) at app.ventoerp.com/console, on the web app's own origin so passkeys work there (decision 0019 binds them to that host), with its own shell, fresh two-step to enter, and the commands kept only for when the console is down.

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
