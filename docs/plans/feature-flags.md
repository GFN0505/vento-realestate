# Plan: Feature flags and plans

- **Status:** approved by the owner on 26 Nov 2026; build after 3a merges. Answers: (1) a self-signed-up organization gets Starter by default; (2) no two-step code on admin commands until the R2 console. The plan's other decisions are accepted.
- **Spec:** [docs/specs/feature-flags.md](../specs/feature-flags.md) (approved 26 Nov 2026; its "Owner's decisions" apply)
- **Release plan:** [docs/release-plan.md](../release-plan.md) (approved)
- **Journeys:** J-ADM-01, J-ADM-02 (new), J-ONB-05 step 2 and "watch for" (changed), J-AI-04 (Settings → AI appears only once AI is available)
- **Slot:** the next slice after 3a, before 3b
- **Written by:** the architect agent on 26 Nov 2026, against branch `brick/03-app-shell` with the 3a shell still being built (oRPC 1.16.5, Better Auth 1.7.28, TanStack Router 1.170.46)

## Summary (for the owner)
This slice puts two switches between every feature and every customer. **Release** answers "is it ready, and released to this organization?". **Plan** answers "has this organization paid for it?". A feature shows up only when both say yes. Members never see the machinery: what isn't available simply isn't there, and a typed link to it shows the normal *Not found* page. The exception is owners. When an owner searches ⌘K for something outside their plan, they get one quiet line ("Commissions · Available on Growth · Talk to Vento"). When they hit a limit, they get a message that says what to do. Vento staff run everything with one command each: release a feature to pilots or to everyone, switch a broken one off, put an organization on a plan, start a 30-day trial, record a negotiated deal, add AI. Each command asks for a reason and the name of a Vento super-admin, shows what will change, and asks before changing anything. Every change goes into a Vento-only audit trail. Changes that affect one customer also go into that customer's own audit trail in plain words ("Vento moved your organization to Growth"). The server checks availability from a copy held in memory, so it adds no database query to a request. The copy refreshes every 10 seconds, so a kill switch works in under 30 seconds. Plan limits (projects, entities, people) are checked in the same database transaction as the create, so two people clicking at once can't both take the last slot. Nothing is ever deleted when a plan shrinks or a trial ends: the data stays, and only new creates are refused. Locally, Vento Homes Ltd is an internal organization that has everything. A second demo developer, Lekki Partners Ltd, is on Starter, so you can see plans working.

---

## 1. Summary (technical)
- **Catalog in code, everything else is data.** `packages/shared/src/features/catalog.ts` holds the feature keys, each with its kind, label, prerequisites, a core flag and its add-on, plus the limit keys and add-on definitions. Stages, release groups, plans and plan versions, assignments, add-ons, overrides and trials live in nine new tables. Six of them are platform configuration with no `organization_id` (decision 0015).
- **Declared in the contract, enforced in `member`.** Each oRPC contract procedure carries `meta.feature` (a `FeatureKey`, or `null` for platform procedures that have no flag). After the tab guard, the membership load and the two-step check, `memberMiddleware` reads `procedure['~orpc'].meta.feature` and answers `NOT_FOUND` if the feature isn't available. Only then does `requirePermission` run. A walk test fails if any procedure doesn't declare `feature`, or if a feature-keyed procedure isn't built on `member` (decision 0016).
- **Zero extra queries.** The organization's release group and plan version come from the membership query, which is already run, through a `LEFT JOIN organization_plans`. Stages, plan versions, live overrides and active add-ons come from an in-memory snapshot. Each API server reloads the snapshot every 10 s (4 small queries per server, none per request). Expiry is compared with `now()` at read time, so no job ends a trial.
- **Limits** run in `assertWithinLimit(tx, ctx, key, adding)`. It locks the organization's `organization_plans` row (`FOR UPDATE`), reads overrides and add-ons fresh, counts, and throws `FORBIDDEN plan_limit`. It runs inside the create's transaction.
- **`account.me`** gains:
  - `organization.internal`
  - `features[]` (available keys plus `earlyAccess`)
  - for owners only, `plan`: plan name, limits with use, trial, upgrade hints and the support contact
- **Web:** `nav.ts` replaces `status` with `flag` + `built`. Visibility is available **and** role can view **and** (built **or** internal organization). This adds the "Early access" tag, the owner-only ⌘K hint rows, the trial line on Home, a `PlanLimitMessage` component (wired into 3b's screens), and the mid-task "isn't available" path.
- **Commands:** `pnpm flags …`, `pnpm plans …` and `pnpm superadmin …` (no web endpoint). `pnpm plans notify-trials` is run daily by cron.
- **One migration pair** (generated tables plus custom triggers and backfill). No new runtime dependencies.

## 2. Domain model

```
Feature (catalog, code) ─requires─▶ Feature*            DAG, checked by test
   │ kind: module | feature | add_on    core?: boolean    addOn?: 'ai'
   │
FeatureRelease (platform)  key → stage: off | internal | pilot | on      (no row = internal)
Plan (platform) 1─* PlanVersion (platform, immutable): features[], limits{}
Organization 1─1 OrganizationPlan: releaseGroup (standard|pilot|internal), planVersion?, assignedAt
Organization 1─* OrganizationAddOn: addOnKey, limitIncreases{}, startsAt, endsAt?, cancelledAt?
Organization 1─* OrganizationTrial: planVersion, endsOn (date), expiresAt, notices sent
Organization 1─* OrganizationOverride: kind release|feature|limit, key, enabled? | limitValue?, expiresAt?, trial?
User 1─0..1 PlatformAdmin (super_admin)          PlatformAuditEvent (append-only, platform)
```

**Who owns what**
- Platform configuration (no organization or entity): `feature_releases`, `plans`, `plan_versions`, `platform_admins`, `platform_audit_events`.
- Organization-scoped (`organization_id` NOT NULL): `organization_plans`, `organization_add_ons`, `organization_trials`, `organization_overrides`.
- Nothing is entity-owned, and nothing is limited by entity or project.

**State machines**
```
Release stage (per flag):   internal ⇄ pilot ⇄ on ;  any ──kill──▶ off ──▶ any       (command only)
Release group (per org):    standard ⇄ pilot ;  standard|pilot ⇄ internal           (command only)
Override:                   live ──expiresAt passes──▶ expired (no write)
                            live|expired ──cleared / replaced──▶ cleared (cleared_at set)
Add-on:                     active ──cancel──▶ cancelled ;  active ──endsAt passes──▶ ended (no write)
Trial:                      live ──expiresAt──▶ ended ──daily run──▶ ended + recorded
                            live ──`plans trial … --end` or `assign`──▶ cancelled (its overrides cleared)
Plan version:               published (immutable; a change publishes version n+1)
Organization plan:          none ──assign──▶ version v ──assign──▶ version w   (stays on v when the plan publishes w)
```

**Availability rule** (pure; `apps/api/src/platform/availability.ts`)
```
released(k)  = stage(k) ≠ off ∧ (liveOverride(release,k)?.enabled ?? reaches(stage(k), group))
               reaches: on→all · pilot→{pilot,internal} · internal→{internal}
entitled(k)  = core(k) ∨ group = internal ∨ (liveOverride(feature,k)?.enabled
               ?? (planVersion.features ∋ k ∨ ∃ active add-on whose catalog features ∋ k))
available(k) = released(k) ∧ entitled(k) ∧ ∀ p ∈ requires(k): available(p)
earlyAccess(k) = available(k) ∧ released by stage internal|pilot or by a release override (not by stage on)
limit(l)     = group = internal → unlimited
               liveOverride(limit,l) → its value (null = unlimited)
               planVersion.limits[l] absent (or no plan) → unlimited
               else planVersion.limits[l] + Σ active add-on limitIncreases[l]
live(o)      = o.clearedAt is null ∧ (o.expiresAt is null ∨ o.expiresAt > now)
```

**Invariants**
- Stage `off` beats every override and every plan (kill switch).
- One live override per (organization, kind, key) (partial unique index). A new override clears the previous row in the same transaction.
- One active add-on per (organization, add-on key) (partial unique index).
- A plan version never changes (trigger refuses UPDATE and DELETE). An organization keeps its version until `assign`.
- Trial overrides always have an expiry (CHECK).
- Limits are never enforced by archiving or deleting. Only creates are refused.
- At most one plan is the default for new organizations (partial unique index).
- Platform and organization audit events are append-only (triggers).
- Catalog prerequisites form a DAG of known keys. Add-on features name an add-on that exists. Core features have no add-on (unit test).
- A super-admin is a platform role on the user, never an organization role. The `--by` person must be an active super-admin with two-step on.

**Initial catalog** (`FEATURES`, exactly the spec's table)
- **Modules:** `land`, `projects`, `sales` (needs `projects`), `finance`, `compliance` (**core**), `documents`, `analytics` (label "Reports"), `buyer_portal` (needs `sales`, `finance`), `facility` (label "Estates"), `hr`, `realtor_portal` (needs `sales.leads`, `sales.commissions`).
- **Features:**
  - `platform.import`, `platform.whatsapp`, `platform.sms`, `platform.digest`, `platform.ekyc`
  - `platform.passkeys` (**core**)
  - `finance.paystack`, `finance.bank_import`, `finance.vendor_bills`, `finance.close`, `finance.facilities`, `finance.revenue_recognition`, `finance.intercompany`, `finance.tax`
  - `projects.costs`, `projects.procurement`, `projects.site_diary`
  - `sales.leads`, `sales.commissions`, `sales.site_plan`, `sales.transfer`, `sales.construction_linked_plans`
  - `compliance.permits` (**core**), `compliance.ubo_scuml` (**core**)
  - `documents.contracts`, `analytics.board_pack`
  - Each sub-feature requires its module.
- **Add-on features (`addOn: 'ai'`):** `ai.document_extraction`, `ai.payment_matching` (needs `finance.bank_import`), `ai.ask`, `ai.drafting` (needs `documents`), `ai.site_diary_voice` (needs `projects.site_diary`), `ai.predictions`, `ai.anomaly_detection`. Prerequisites other than the spec's example are placeholders; the AI brick's spec confirms them.
- **Limits:** `projects`, `entities`, `members` (counts), `ai_budget` (NGN, `numeric(14,2)`).
- **Add-ons:** `ai` (all `ai.*` features; per-organization `ai_budget` increase).

## 3. Database
New schema file `apps/api/src/db/schema/platform.ts`. Migrations:
- `0003_feature_flags_and_plans` (generated)
- `0004_platform_guards` (`drizzle-kit generate --custom`: triggers and backfill)

**Enums:** `release_stage` (`off`,`internal`,`pilot`,`on`) · `release_group` (`standard`,`pilot`,`internal`) · `override_kind` (`release`,`feature`,`limit`) · `platform_role` (`super_admin`)

**Platform tables (no `organization_id`, decision 0015)**

| Table | Columns | Constraints and indexes |
|---|---|---|
| `feature_releases` | `id`, `feature_key text`, `stage release_stage`, `reason text`, `changed_by_user_id uuid → users`, timestamps | unique `feature_key`; check key `^[a-z_]+(\.[a-z_]+)?$`; check `char_length(reason) >= 3` |
| `plans` | `id`, `key text`, `name text`, `sort_order smallint`, `is_default_for_new boolean default false`, `archived_at`, timestamps | unique `key`, unique `sort_order`; partial unique `(is_default_for_new) where is_default_for_new and archived_at is null` |
| `plan_versions` | `id`, `plan_id → plans`, `version integer`, `features text[] default '{}'`, `limits jsonb default '{}'`, `reason text`, `published_by_user_id → users` (null = seed), timestamps | unique `(plan_id, version)`; check `version > 0`; check `jsonb_typeof(limits) = 'object'`; check `array_position(features, null) is null`; **append-only trigger** |
| `platform_admins` | `id`, `user_id → users`, `role platform_role default 'super_admin'`, `reason`, `granted_by_user_id → users` (null = bootstrap), `revoked_at`, `revoked_by_user_id`, timestamps | partial unique `(user_id) where revoked_at is null` |
| `platform_audit_events` | `id`, `actor_user_id → users` (null = system run), `actor_name text`, `operator text` (`os-user@host`), `action text`, `target_type text`, `target_key text`, `organization_id uuid → organizations` (nullable: the organization affected, if any), `before jsonb`, `after jsonb`, `reason text not null`, `metadata jsonb`, timestamps | indexes `(created_at desc)`, `(organization_id, created_at desc)`, `(target_type, target_key, created_at desc)`; **append-only triggers** (UPDATE, DELETE, TRUNCATE) |

**Organization tables (`organization_id` NOT NULL, FK restrict, indexed)**

| Table | Columns | Constraints and indexes |
|---|---|---|
| `organization_plans` | `id`, `organization_id`, `release_group release_group default 'standard'`, `plan_version_id → plan_versions` (null = no plan), `plan_assigned_at`, timestamps | unique `organization_id` (also the limit lock row); check `(plan_version_id is null) = (plan_assigned_at is null)` |
| `organization_add_ons` | `id`, `organization_id`, `add_on_key text`, `limit_increases jsonb default '{}'`, `starts_at timestamptz default now()`, `ends_at`, `reason`, `created_by_user_id`, `cancelled_at`, `cancelled_by_user_id`, timestamps | partial unique `(organization_id, add_on_key) where cancelled_at is null`; check `ends_at is null or ends_at > starts_at`; check object |
| `organization_trials` | `id`, `organization_id`, `plan_version_id → plan_versions`, `starts_at`, `ends_on date`, `expires_at timestamptz`, `reason`, `created_by_user_id`, `cancelled_at`, `cancelled_by_user_id`, `notified_7d_at`, `notified_1d_at`, `ended_recorded_at`, timestamps | unique `(organization_id, id)`; check `expires_at > starts_at`; partial index `(expires_at) where cancelled_at is null and ended_recorded_at is null` (daily run) |
| `organization_overrides` | `id`, `organization_id`, `kind override_kind`, `key text`, `enabled boolean`, `limit_value numeric(14,2)` (null with `limit` = unlimited), `reason`, `expires_at`, `trial_id uuid`, `created_by_user_id`, `cleared_at`, `cleared_by_user_id`, timestamps | partial unique `(organization_id, kind, key) where cleared_at is null`; FK `(organization_id, trial_id) → organization_trials(organization_id, id)`; check `(kind in ('release','feature')) = (enabled is not null)`; check `kind = 'limit' or limit_value is null`; check `limit_value is null or limit_value >= 0`; check `trial_id is null or expires_at is not null`; check `char_length(reason) >= 3` |

**`0004_platform_guards` (custom SQL)**
- `platform_append_only()` function, plus triggers on `platform_audit_events` (UPDATE, DELETE, TRUNCATE) and `plan_versions` (UPDATE, DELETE, TRUNCATE).
- `insert into organization_plans (organization_id) select id from organizations on conflict do nothing;` (every existing organization becomes `standard` with no plan).

**Migration safety**
- Additive only: new enums and tables, and a backfill into a new table. No locks on existing tables.
- Old and new code can run side by side. The membership query uses a `LEFT JOIN`, so an organization created by old code during the deploy window reads as `standard` with no plan. `assertWithinLimit` upserts the row before locking it.
- Reads that use these tables: the membership query joins by unique `organization_id`. The snapshot loads live overrides (`cleared_at is null`), active add-ons and all plan versions (tens of rows). Counts use the existing `entities_org_status_idx`, `members (organization_id, status)`, and invitations by `(organization_id, status)`.

## 4. Contract (`packages/shared`)

**New `src/features/catalog.ts` (no zod, so the web can tree-shake it)**
```ts
export const RELEASE_STAGES = ['off', 'internal', 'pilot', 'on'] as const
export const RELEASE_GROUPS = ['standard', 'pilot', 'internal'] as const
export const LIMIT_KEYS = ['projects', 'entities', 'members', 'ai_budget'] as const
type Def = { kind: 'module' | 'feature' | 'add_on'; label: string; requires: readonly FeatureKey[]; core?: true; addOn?: AddOnKey }
export const FEATURES = { land: { kind: 'module', label: 'Land & title', requires: [] }, … } as const satisfies Record<string, Def>
export type FeatureKey = keyof typeof FEATURES
export const ADD_ONS = { ai: { label: 'AI', limit: 'ai_budget' } } as const
export function featuresOfAddOn(key: AddOnKey): FeatureKey[]
```

**New `src/features/schema.ts` (zod)**
- `featureKey`, `limitKey`, `releaseStage`, `releaseGroup`
- `planLimits = z.strictObject({ projects?, entities?, members?: int ≥ 0, ai_budget?: money })`
- `planDefinition` (the `--from` file: `key`, `name`, `sortOrder`, `features: featureKey[]` refusing core and add-on keys, `limits`)
- `availableFeature`, `mePlan`

**Procedure meta (`common/errors.ts`)**
```ts
export type ProcedureMeta = { feature?: FeatureKey | null }
export const base = oc.$meta<ProcedureMeta>({}).errors(errorMap)
/** Platform procedures: no flag, in every plan. */
export const platform = base.meta({ feature: null })
/** Module procedures: `const sales = forFeature('sales')`; `sales.input(…).output(…)`. */
export const forFeature = (feature: FeatureKey) => base.meta({ feature })
```
Every existing contract file (`health`, `account`, `onboarding`, `organization`, `entities`, `roles`, `members`, `invitations`, `access`) switches from `base` to `platform`. This is mechanical.

**Error map**
- `forbiddenReason` gets `'plan_limit'`.
- `FORBIDDEN.data` gets `limit: limitKey.optional()` and `included: z.number().int().optional()`.
- The message is end-user copy, built on the server for the caller's role (§5).
- An unavailable feature uses the plain `NOT_FOUND` with the standard message and no reason, so it can't be told apart from a missing record.

**`account.me` (changed; still `authed`, not tab-guarded)**
```ts
organization: z.object({ id, name, internal: z.boolean() }).nullable()
features: z.array(z.object({ key: featureKey, earlyAccess: z.boolean() }))   // available only; [] with no organization
plan: z.object({                                                             // owners only, else null
  name: z.string().nullable(),                                               // null = no plan
  limits: z.array(z.object({ key: limitKey.exclude(['ai_budget']), included: z.number().int().nullable(), used: z.number().int() })),
  aiBudget: money.nullable(),                                                // null = no AI add-on
  trial: z.object({ planName: z.string(), endsOn: isoDate, losing: z.array(z.string()) }).nullable(),
  upgradeHints: z.array(z.object({ key: featureKey, label: z.string(), availableOn: z.string() })), // "Growth" | "the AI add-on"
  contact: z.object({ email: z.string(), whatsapp: z.string().nullable() }),
}).nullable()
```
- `me` never contains unavailable keys, stages, other plans' contents, or prices.
- `upgradeHints` lists features **released** to the organization but not entitled. For each, it names the lowest plan (by `sort_order`, latest version, not archived) that includes it, or "the AI add-on". Features in no plan are left out.
- Owners get two or three count queries more, run in parallel with the existing ones. Non-owners get none.

**Audit actions (`audit/actions.ts`, organization trail):**
- `plan.assigned`
- `plan.trial_started`, `plan.trial_ended`, `plan.trial_cancelled`
- `plan.add_on_added`, `plan.add_on_removed`
- `plan.feature_overridden`, `plan.limit_overridden`, `plan.override_cleared`
- `release.group_changed`, `release.override_set`, `release.override_cleared`

There are no new oRPC procedures for changing flags or plans: the spec says no web endpoint until the console.

## 5. Permissions and enforcement

**Middleware order (`apps/api/src/access/middleware.ts`, `memberMiddleware`)**
```
authed → [tab guard (no query)] → loadMembership (+ LEFT JOIN organization_plans: release_group, plan_version_id)
       → write-back → no membership? FORBIDDEN → two-step? FORBIDDEN
       → features = organizationAvailability(await context.features.get(), membership, now)   // in memory
       → meta.feature && !features.has(meta.feature) → NOT_FOUND                             // requireFeature
       → next({ …, features })
→ requirePermission(module, action)   // only reached when available
→ handler
```
- **`requireFeature` is never added by hand.** `member` applies it from the contract's `meta.feature`, so the key a procedure is declared with is the key it's checked against, and it can't drift.
- A procedure needs one key: prerequisites carry the rest (e.g. `ai.payment_matching` implies `finance.bank_import` implies `finance`).
- Inside a handler, `ctx.features.has('platform.whatsapp')` decides optional behaviour.
- Jobs and messages use `availabilityForOrganization(db, orgId)` (one query for the plan row, plus the snapshot) and check at send time.
- Order is as the spec asks: availability after sign-in and organization, before permission. An owner calling an unavailable feature gets `NOT_FOUND` and never the permission refusal. Nothing is written and nothing is audited.
- `ServiceContext` gains `features: OrganizationAvailability` (`has`, `earlyAccess`, `limit`, `list()`), passed in by `serviceContext()`.
- **Inbound money** (Paystack webhooks, later) is public and never feature-gated. It records the payment whatever the availability (spec). Note this in the `paystack` skill.
- **Buyer portal (later)** has its own authentication. Its middleware must apply the same gate with the organization taken from the token. Note this in `add-module`.

| Operation | Who | Limits |
|---|---|---|
| Any procedure with `meta.feature = k` | Members of organizations where `k` is available, then the usual `requirePermission` | Organization only (availability is per organization, never per entity or project) |
| `account.me` features | Every member | – |
| `account.me` plan block | Members whose role key is `owner` | – |
| `pnpm flags/plans …` | Active `platform_admins` with two-step on, named by `--by`; host access granted by devops | – |
| `pnpm superadmin grant/revoke` | An existing super-admin; `--bootstrap` only when none exist | – |
| AI feature on/off in Settings → AI | Owner (AI brick; ordinary organization audit) | – |

**Limit checks (`apps/api/src/platform/limits.ts`)**
```ts
assertWithinLimit(tx, ctx, key: 'projects'|'entities'|'members', adding: number): Promise<void>
// 1. insert … on conflict do nothing; select … from organization_plans where organization_id = $org FOR UPDATE
// 2. fresh live limit override + active add-ons for this org (2 small queries); plan version from snapshot (loaded fresh if missing)
// 3. unlimited → return (no count)
// 4. used = LIMIT_USAGE[key](tx, orgId); used + adding > limit → throw planLimit(…)
```
- **Usage counters:**
  - `entities`: `status = 'active'`
  - `members`: active members plus invitations with `status = 'pending' and expires_at > now()`
  - `projects`: registered by the projects module when it ships (until then it's unlimited, and `me` leaves it out)
- **Call sites in this slice:**
  - `insertEntity` (covers `entities.create` and onboarding's first entity), with `adding = 1`
  - `createInvitations`, with `adding = items.length`
  - `resendInvitation` for an expired invitation, with `adding = 1`

  `invitations.accept` turns a counted invitation into a member, so it isn't checked.
- **The lock:** the `organization_plans` row is referenced by no other table, so locking it never blocks unrelated writes. Two creates in one organization queue behind each other for milliseconds. In READ COMMITTED, the second one counts again after the first commits.
- **`planLimit()` message (`lib/errors.ts`):**
  - Owner: "Your Starter plan includes 1 active project. Archive a project or talk to Vento about Growth." It reads "Your plan includes …" when an override set the value, and drops "about Growth" when no higher plan has more.
  - Other members: "Your organization has reached its limit of 1 active project. Ask Olumide Bankole (owner)." The owner comes from the new `firstOwner()` in `access/who-can-grant.ts`.
  - Invitations (owner): "Your plan includes 10 people, and 10 are in or invited. Remove someone or talk to Vento about Growth."
  - Data: `{ reason: 'plan_limit', limit, included, askName?, askRole? }`.

## 6. The snapshot and its refresh
`apps/api/src/platform/feature-store.ts`
```ts
export type FeatureStore = { get(): Snapshot | Promise<Snapshot>; stop(): void }
export async function startFeatureStore(db, { refreshMs }): Promise<FeatureStore>  // loads once before serving
export function liveFeatureStore(db): FeatureStore                                  // tests: loads on each get()
```
- **What `Snapshot` holds:**
  - `stages: Map<FeatureKey, ReleaseStage>`
  - `planVersions: Map<id, { planKey, planName, sortOrder, version, features: Set, limits }>`
  - `latestByPlan` (for hints)
  - `orgs: Map<orgId, { overrides, addOns }>` (only organizations with live rows)
  - `loadedAt`
  - Unknown keys in data (a flag removed from code) are ignored, with one warning per load.
- **Refresh:** `setInterval(refreshMs)` with `unref()`, and no overlap (it skips a tick while a load is still running). A failed load keeps the last good snapshot and logs `warn`. Staleness over 60 s logs `error` for monitoring. A plain reload is used because the data is tiny (tens of flags and plan versions, live overrides only). It has no triggers, no revision table and no LISTEN connection. If the snapshot ever grows, a revision check is the follow-up.
- `index.ts` awaits the first load before `serve`, so no request ever sees an empty snapshot. Shutdown calls `stop()`.
- **Propagation:** at most 10 s on every server (the 30 s target leaves headroom). Release group and plan assignment apply on the very next request (membership join). The web picks changes up on its next `me` refetch: page change after `staleTime` (30 s), tab focus, or right after a `NOT_FOUND`.
- `organizationAvailability()` evaluates lazily with a memo per key and a guard against cycles (the DAG test makes cycles impossible). A request costs a few map lookups (well under 1 ms).

## 7. Commands (`apps/api/src/platform/cli/`)
Root scripts are `"flags"`, `"plans"` and `"superadmin"`, each running `pnpm --silent --filter @vento/api <name>`. The API scripts run `tsx src/platform/cli/main.ts <name>`. tsdown adds the entry `src/platform/cli/main.ts`, so production runs `node dist/platform/cli/main.mjs flags …`. Arguments are parsed with `node:util parseArgs` and confirmation uses `node:readline/promises` (no dependencies). `--yes` is for scripted runs. Every changing command requires `--reason` (≥ 3 characters) and `--by <email>`.

| Command | Does |
|---|---|
| `flags list` | Every catalog key: stage, how many organizations have it, plans that include it, and unknown keys found in data |
| `flags show <key>` | Stage, prerequisites, plans, organizations by group, live overrides, last 5 platform audit events |
| `flags stage <key> <stage>` | Shows the impact ("Sales will be available to 3 organizations (1 internal, 2 pilot)"), warns "in no plan", and counts records falling out of view (`FEATURE_RECORD_COUNTERS`, which modules register; empty now). Prints "Sales is now off for everyone, including overrides and plans." for `off` |
| `flags group <org> <group>` | Release group, plus the organization audit event |
| `flags override <org> <key> on\|off\|clear [--until YYYY-MM-DD]` | Release override, plus the organization audit event |
| `plans list` / `plans show <plan>` | Versions, contents and limits, and how many organizations are on each version |
| `plans publish <plan> --from <file.json> [--name --sort --default]` | Validates against `planDefinition` and the catalog, then inserts version n+1 (or the plan plus v1) |
| `plans assign <org> <plan> [--version n]` | Latest version by default. Over-limit warning ("…has 3 active projects; Starter includes 1. Nothing is archived…"). Cancels a live trial and its overrides |
| `plans trial <org> <plan> --days N` / `plans trial <org> --end` | One trial row plus overrides for every feature and limit not already included (keys with a live override are skipped). `ends_on` = today + N in Lagos time; `expires_at` = Lagos midnight after it |
| `plans addon <org> ai --budget 150000` / `--remove` | Add-on row (`limit_increases.ai_budget`) |
| `plans override <org> feature <key> on\|off\|clear [--until]` / `limit <key> <n\|unlimited\|clear> [--until]` | Entitlement override |
| `plans notify-trials` | Daily (cron, no `--by`; the actor is "Vento (scheduled)"). Emails owners 7 days and 1 day before a trial ends, records "Your Enterprise trial ended" once it's over, and sets the `notified_*` and `ended_recorded_at` stamps. Safe to run again |
| `superadmin list\|grant <email>\|revoke <email>` | `grant` requires two-step on the target. `--bootstrap` only when there are no super-admins |

**Every command follows the same steps:**
1. Resolve the organization by exact name (case-insensitive) or id. If the name matches more than one, list them and refuse.
2. Check keys against the catalog. An unknown key gets "Did you mean `sales.commissions`?" (a small Levenshtein helper in `cli/closest-key.ts`).
3. Check `--by` ("Only Vento super-admins can change flags and plans.") and `--reason` ("Add --reason so the audit trail says why.").
4. Dry-run: print what changes, then `Continue? (y/N)`.
5. In one transaction: lock `organization_plans` when one organization is involved, write the change, write `platform_audit_events` (who, operator, before → after, reason), and write the organization audit event for organization-level changes.
6. Print the done line ("Takes effect within 30 seconds.").

The operations live in `apps/api/src/platform/operations/*.ts` as plain functions taking `(db, actor, input)`. The CLI is a thin wrapper around them, and the R2 console and the later billing screen call the same functions.

**Organization audit entries** (actor `null`, name "Vento", target the organization; `metadata.message` holds the sentence; the reason is **not** copied, because it is internal):
- "Vento moved your organization to Growth"
- "Vento started a 30-day Enterprise trial (ends 2 Jan 2027)"
- "Your Enterprise trial ended"
- "Vento added AI (₦150,000 a month)"
- "Vento turned on Estates for your organization"

New lines, proposed for the ux-writing review:
- "Vento ended your Enterprise trial"
- "Vento removed AI"
- "Vento turned off Estates for your organization"
- "Vento added Commissions to your organization (until 31 Jan 2027)"
- "Vento removed Commissions from your organization"
- "Vento set your limit to 8 active projects"
- "Vento gave your organization early access to new features"
- "Your organization's early access ended"
- "Vento's exception for Estates ended"

## 8. UI (apps/web)

| Screen (SCREENS.md row) | Design? | Change |
|---|---|---|
| App shell (sidebar, tabs, More, ⌘K) | Yes (3a boards) | Visibility by availability; "Early access" tag; owner hint rows in ⌘K |
| Module placeholder (Coming soon) | – pattern | Reachable only in internal organizations |
| 404 | Yes (Error404) | Also for a module not available to the organization |
| Plan limit message (row exists) | – **pattern** | `PlanLimitMessage` built and tested now; wired into Settings → Entities and Team in 3b |
| Trial ending: Home line and email (row exists) | – pattern | `TrialLine` on Home (owners, last 7 days); `trial-ending` email |
| Settings → AI | Yes (AISettings) | AI brick: hidden unless some `ai.*` is in `me.features` |
| Flag and plan commands (row exists) | – | Text output, built here |

**Navigation model (`features/shell/nav.ts`, replacing 3a §6.2's `status`)**
```ts
type NavItem = { key; module: PermissionModule | null; flag: FeatureKey | null; built: boolean; label; to; icon; group; comingSoon?; keywords }
type NavAccess = { permissions: PermissionSet | null; features: ReadonlyMap<FeatureKey, { earlyAccess: boolean }>; internal: boolean }
canView(access, item) = item.flag === null || (access.features.has(item.flag) && (item.built || access.internal)) && (item.module === null || can(…,'view'))
navTag(access, item): 'soon' | 'early_access' | null   // !built → 'soon'; earlyAccess → 'early_access'
```
- **Flags:** home → `null`, land, projects, estates → `facility`, sales, finance, hr, compliance, documents, reports → `analytics`. All are `built: false` today.
- `visibleNav`, `sidebarSections`, `mobileTabs` and `moreItems` take `NavAccess` in place of `permissions`.
- `EffectiveAccess` (`features/preview/use-effective-permissions.ts`) gains:
  - `features` and `internal` (from `me`, the same while previewing)
  - `showUpgradeHints = me.plan !== null && roleKey === 'owner'`, so a preview of a non-owner role shows none
- **Readers that change:** `module-route.ts`, `app-shell.tsx` (`PermittedPage`), `sidebar-nav.tsx`, `more-sheet.tsx`, `mobile-tabs.tsx`, `command-results.tsx` and `not-found-page.tsx` all switch to the new signature.

**Guards**
- `moduleGuard` (beforeLoad) throws `notFound()` when the item isn't visible by availability and built status. Otherwise it throws `ModuleForbiddenError` when the role can't view it (3a rule). A direct link to an unavailable module gives *404*, never *403*.
- `PermittedPage` (live) handles a feature that was available when the page loaded but isn't any more: `navigate({ to: '/' })` plus the toast "Sales isn't available on your account right now. What you were typing wasn't saved.", once per loss (keyed by flag).
- **`NOT_FOUND` refetch:** the `RPCLink` interceptor in `lib/orpc.ts` calls `notifyNotFound()` (new tiny pub/sub in `lib/availability-events.ts`, so `orpc.ts` stays free of the query client). The `_shell` layout subscribes and invalidates `meQuery`. A real missing record keeps its normal *404* path.

**No flash.** `_app` `beforeLoad` already awaits `me`, so navigation renders from it on the first frame. `features` arrive in the same response, and nothing renders from a default.

**⌘K owner hints (`command-results.tsx`)**
- The group "Other plans" appears only when `access.showUpgradeHints` is true and the search has 2 or more characters (read through cmdk's `useCommandState`).
- Each hint is a quiet row: label, then the hint "Available on Growth", with keywords from the label. Enter opens **Talk to Vento**.
- **Talk to Vento** (`features/plan/talk-to-vento.ts`): a `wa.me/<number>?text=` link when `contact.whatsapp` is set, otherwise `mailto:` with "Organization: …, plan: …, about: …" filled in.

**Tags:** shadcn `Badge`, the 3a sidebar variant, with copy "Early access" and the tooltip "You have early access to this. Tell us what you think." "Soon" is unchanged.

**Home:** `features/plan/trial-line.tsx` shows when `me.plan?.trial` ends within 7 days (Lagos date maths in `lib/format.ts`): "Your Enterprise trial ends on 2 Jan 2027. After that, the board pack is no longer available. Your data stays." plus **Talk to Vento**.

**`PlanLimitMessage`** (`features/plan/plan-limit-message.tsx`): an inline `Alert` with the server message. Owners also get the **Talk to Vento** button. `lib/error-data.ts` gains `isPlanLimit(error)`.

**Rule for later screens** (added to the `add-module` and `design-system` skills): settings sections, permissions matrix rows, approval-rule modules, Home cards, the setup checklist and Preview all filter by `useAvailableFeatures()`.

**States:** nothing here loads separately. Every element derives from `me`, so the shell's existing loading, offline and error states cover it.

## 9. Files

**packages/shared**
- `src/features/catalog.ts` + `catalog.test.ts`: `FEATURES`, keys, stages, groups, limits, `ADD_ONS`; DAG and consistency tests
- `src/features/schema.ts` + `schema.test.ts`: zod enums, `planLimits`, `planDefinition`, `mePlan`
- `src/features/index.ts`: exports
- `src/common/errors.ts`: `ProcedureMeta`, `$meta` base, `platform`, `forFeature`, `plan_limit`, FORBIDDEN `limit`/`included`
- `src/common/index.ts`, `src/index.ts`: export features
- `src/{health,account,organization,access}/contract.ts`: `base` → `platform`
- `src/account/schema.ts`: `organization.internal`, `features`, `plan`
- `src/audit/actions.ts`: new organization audit actions

**apps/api**
- `src/db/schema/platform.ts` + `src/db/schema/index.ts`: nine tables, four enums
- `drizzle/0003_feature_flags_and_plans.sql` (generated) and `drizzle/0004_platform_guards.sql` (custom)
- `src/platform/availability.ts` + `availability.test.ts`: pure resolver and truth table
- `src/platform/snapshot.ts` + `feature-store.ts` + `feature-store.test.ts`: load, interval refresh, live store
- `src/platform/organization-inputs.ts`: fresh per-organization loader (limits, jobs, CLI impact)
- `src/platform/limits.ts` + `limits.test.ts` + `limits.concurrency.test.ts`: `assertWithinLimit`, usage counters, messages
- `src/platform/plan-summary.ts` + test: owner `plan` block and hints for `me`
- `src/platform/platform-audit.ts`: `recordPlatformAudit`, `recordOrganizationNotice`
- `src/platform/super-admins.ts`: `requireSuperAdmin(db, email)`
- `src/platform/operations/{stage,group,release-override,publish,assign,trial,add-on,entitlement-override,notify-trials,super-admin}.ts`: change operations
- `src/platform/plans/{starter,growth,enterprise}.json`: starting definitions (release plan §5)
- `src/platform/seed-plans.ts`: idempotent publish of the JSON definitions (seed, tests, e2e)
- `src/platform/cli/{main,args,io,closest-key,flags,plans,superadmin}.ts`: commands
- `src/platform/flags-cli.test.ts`, `src/platform/plans-cli.test.ts`: command tests (paths match J-ADM-01 and 02)
- `src/email/templates/trial-ending.ts` + `templates.test.ts` case: owner email
- `src/access/context.ts`: membership query gets `LEFT JOIN organization_plans`; `Membership.plan`; `ServiceContext.features`
- `src/access/middleware.ts`: feature gate after two-step, `features` in context
- `src/access/service-context.ts`: pass `features`
- `src/access/who-can-grant.ts`: `firstOwner()`
- `src/context.ts`: `BaseContext.features: FeatureStore`
- `src/app.ts`: `AppDeps.features`
- `src/index.ts`: start the store before `serve`, stop it on shutdown
- `src/env.ts`: new variables (§11)
- `src/lib/errors.ts`: `planLimit()`
- `src/modules/account/account.service.ts`: `me` additions
- `src/modules/onboarding/onboarding.service.ts`: insert `organization_plans` (default plan per question 1) in the same transaction
- `src/modules/entities/entities.service.ts`: `assertWithinLimit('entities', 1)` in `insertEntity`
- `src/modules/invitations/invitations.service.ts`: members limit in create and expired-resend
- `src/db/seed.ts`: plans, groups, Lekki Partners Ltd, super-admin
- `src/test/factories.ts`: `createOrganization({ releaseGroup, planKey })`, `setOverride`, `setStage`, `contextFor` with `features`
- `src/test/router-client.ts`, `src/test/auth-client.ts`: `features` option (default `liveFeatureStore(db)`)
- `src/test/counting-db.ts`: query-counting proxy (beside `throwing-db.ts`)
- `src/test/feature-probe.ts`: test-only contract (`forFeature('sales')`, `forFeature('sales.commissions')`), implemented with `authed` + `memberMiddleware(true)` + `requirePermission`
- `src/test/procedure-guard.test.ts`: declaration walk and gate walk
- `src/test/isolation.test.ts`: per-organization plan, override and add-on isolation
- `src/test/e2e-fixtures.ts`: `plans`, `starter-org`, `org-override`, `org-group`, `org-trial`; `team` and `multi-org` organizations become `internal`
- `package.json`: scripts `flags`, `plans`, `superadmin`
- `tsdown.config.ts`: entry `src/platform/cli/main.ts`

**apps/web**
- `src/features/shell/nav.ts` + `nav.test.ts`: `flag`/`built`, `NavAccess`, `navTag`
- `src/features/shell/module-route.ts`: 404 by availability
- `src/features/shell/command-results.tsx`: tags, "Other plans" hint group
- `src/features/shell/home-page.tsx`: trial line
- `src/features/preview/use-effective-permissions.ts` + test: `features`, `internal`, `showUpgradeHints`
- `src/features/availability/use-available-features.ts` + test: map from `me`, `useFeature(key)`
- `src/features/plan/{talk-to-vento.ts,plan-limit-message.tsx,trial-line.tsx}` + tests: owner-facing pieces
- `src/components/shell/{app-shell,sidebar-nav,more-sheet,mobile-tabs}.tsx`: new signature, "Early access" tag, live loss → Home + toast
- `src/components/errors/not-found-page.tsx`: recents filter by `NavAccess`
- `src/lib/availability-events.ts`: `notifyNotFound` / `onNotFound`
- `src/lib/orpc.ts`: `NOT_FOUND` → `notifyNotFound()`
- `src/lib/error-data.ts` + test: `isPlanLimit`, `planLimitData`
- `src/routes/_app/_shell.tsx`: subscribe and invalidate `me`
- `e2e/support/fixtures.ts`: `createStarterOrg`, `setOrgOverride`, `setOrgGroup`, `startTrial`
- `e2e/shell/feature-availability.spec.ts`: §10
- `playwright.config.ts`: API env `FEATURE_SNAPSHOT_REFRESH_SECONDS=1`

**Root**
- `package.json`: `flags`, `plans`, `superadmin` scripts
- `turbo.json`: pass through the new variables
- `.env.example`: new variables

## 10. Tests

**Shared**
- `catalog.test.ts`:
  - every prerequisite exists and the graph has no cycles
  - add-on features name an `ADD_ONS` key
  - core features have no add-on
  - labels are unique
  - nav flags are catalog keys (checked in the web's nav test)

**API unit and integration (Vitest, real Postgres)**

| Area | Cases |
|---|---|
| Resolver truth table (`availability.test.ts`) | Table-driven over stage {off, internal, pilot, on} × group {standard, pilot, internal} × release override {none, on, off, expired on, cleared on} × plan includes {yes, no, no plan} × add-on {none, active, cancelled, ended} × entitlement override {none, on, off, expired} × prerequisite {available, not}. The expected value is computed by an independently written oracle that follows the spec's steps, and a hand-pinned list of about 30 named rows checks the oracle itself. Named rows: kill switch beats both overrides; Starter + stage `on` without plan → no, and with a live entitlement override → yes; internal → entitled and unlimited but `off` stays off; expiry at 00:00 Lagos (fake clock 23:59:59 vs 00:00:00 at UTC+1); `earlyAccess` true via internal, pilot or override and false via `on`; trial gives no early access; core feature with no plan → yes; unknown key in data → ignored |
| Limits (`limits.test.ts`) | Plan limit, override (incl. `unlimited`), add-on increase, no plan → unlimited, internal → unlimited. Archived entities don't count. Removed members don't count; expired invitations don't count. `invitations.create` with 3 items at 8/10 → refused, nothing written, no audit. Owner vs sales member message and data (`askName` = owner, no plan name in the member's message). Over limit after a downgrade → existing reads and updates work, only creates refused |
| Concurrency (`limits.concurrency.test.ts`) | Committed transactions on two pool clients: Starter organization at 1/2 entities, two `entities.create` at once through `clientAs(db)` → exactly one succeeds, the other is `FORBIDDEN plan_limit`, and the final count is 2. The same for invitations (9/10, two single invites). Committed data with unique names, like the HTTP auth tests |
| Store (`feature-store.test.ts`) | Fake timers: a stage change is seen after one interval and not before. A failed load keeps the previous snapshot and logs. Ticks never overlap. Startup waits for the first load |
| No extra query | `countingDb`: `feature-probe.list` for an available feature runs the same number of queries as a `feature: null` procedure (membership only). `account.me` for a non-owner runs no more queries than in 3a; for an owner, at most 2 more (counts) |
| Gate walk (`procedure-guard.test.ts`) | (a) Every router procedure has an own `meta.feature` (key or `null`). (b) No public or personal procedure has a non-null feature. (c) For each procedure with a feature (the probe today, every module procedure later): an owner of a standard organization where it isn't released → `NOT_FOUND`, and a spy shows only the membership query, no writes and no audit rows. (d) A role without permission in an organization where the feature **is** available gets `FORBIDDEN permission` (order proven). (e) The organization guard walk still passes |
| `account.me` | `features` lists only available keys with the right `earlyAccess`. `plan` is null for every non-owner role. Hints: Starter owner with `sales.commissions` released by override → `{label: 'Commissions', availableOn: 'Growth'}`; not released → no hint; AI feature → "the AI add-on". Trial block and `losing` labels. JSON scan: no stage names and no other organizations' keys |
| Isolation | Org A's release override, entitlement override, add-on and trial never change B's `me.features`, `me.plan` or limit checks. A's internal group gives B nothing. A person in an internal org A and a Starter org B gets B's set after `switchOrganization` |
| Commands (`flags-cli.test.ts`, `plans-cli.test.ts`) | With `withRollback` and an injected IO (answers, captured output): unknown key → refused with the closest key; no `--reason` and non-super-admin `--by` → the spec's copy and nothing written; confirm "N" → nothing written; impact line counts by group; "in no plan" warning; prerequisite message for one organization; over-limit warning on `assign`; `trial` creates overrides only for missing features and limits, all with the same expiry, and skips keys with live overrides; `assign` cancels a live trial; `publish` makes v2 while organizations stay on v1, and an UPDATE on `plan_versions` raises; every change writes one platform audit row (before, after, reason, operator) and, for one-organization changes, one organization audit row with the plain sentence and without the reason; `notify-trials` sends 7-day and 1-day emails once each (memory mailer) and records "trial ended" once |
| Onboarding | A new organization gets an `organization_plans` row (`standard`, default plan per question 1) in the same transaction |

**Web units:**
- `nav.test.ts`: the 3a role tables now take `NavAccess` with every flag available and `internal: true`, and still derive their expected result from `DEFAULT_ROLES`. New cases cover an unavailable flag (hidden everywhere), an unbuilt module in a standard organization (hidden), `navTag` precedence (Soon before Early access), and every nav flag being a catalog key.
- `use-effective-permissions.test.ts`: hints only for owner views, including during a preview.
- `talk-to-vento.test.ts`: WhatsApp vs mailto, and encoding.
- `plan-limit-message.test.tsx`: owner vs member.
- `trial-line.test.tsx`: day 8 hidden, day 7 shown, ended hidden.
- `error-data.test.ts`: `isPlanLimit`.

**Playwright `e2e/shell/feature-availability.spec.ts`** (desktop and mobile)

Fixtures change only per-organization data (group, plan, overrides), never global stages, so specs stay parallel.

| Case | Check |
|---|---|
| Starter owner, nothing released | An init script with a `MutationObserver` from `document_start` records every nav link name. Only Home ever appears. `/finance` → *404* (not 403). axe passes |
| Owner hint | Override `sales.commissions` on for the Starter organization. Owner ⌘K "commis" → "Commissions · Available on Growth". **Talk to Vento** `href` contains the organization name. The Sales-role member's ⌘K "commis" shows nothing. The owner previewing Sales shows nothing |
| Internal organization (team fixture) | 3a's tables: modules with "Soon", and the Coming soon page opens |
| Feature lost mid-task | Internal organization on `/land`. The fixture sets the release override for `land` to off (1 s refresh in e2e). On tab focus (or a `NOT_FOUND`), the app is on Home, shows the toast, and Land is gone from the sidebar |
| Two organizations | Person in an internal organization and a Starter organization: switch → Starter nav is Home only from the first frame. The tab guard still applies |
| Trial line | Starter owner with an Enterprise trial ending in 5 days → line on Home. A non-owner doesn't see it |

Not covered in e2e yet:
- **"Early access" tag:** waits for the first built module, because unbuilt modules are hidden from non-internal organizations. Unit tests cover it until then.
- **Limit messages:** e2e waits for 3b's Team and Entities screens. API tests cover the server side.

## 11. Environment
| Variable | Default | Notes |
|---|---|---|
| `FEATURE_SNAPSHOT_REFRESH_SECONDS` | `10` | 1–30; e2e uses 1 |
| `SUPPORT_EMAIL` | `support@localhost` in development | Required in production; returned to owners for **Talk to Vento** |
| `SUPPORT_WHATSAPP` | empty | Optional, E.164 (e.g. `+2348…`); when set, **Talk to Vento** opens WhatsApp |

Validate these in `env.ts`, list them in `.env.example`, and add them to `turbo.json` `passThroughEnv` (dev and test). For devops:
- grant command access on the API host
- schedule `node dist/platform/cli/main.mjs plans notify-trials` daily at 08:00 Lagos

## 12. Seed (development) and starting data
- **Plans** (`platform/plans/*.json`, published by `seedPlans`; the same files are used for production with `pnpm plans publish`). Core features (compliance, permits, UBO and SCUML, passkeys) are in every plan automatically and aren't listed:
  - **Starter** (sort 1, default for new organizations if question 1 is answered yes): `land`, `projects`, `projects.costs`, `projects.procurement`, `projects.site_diary`, `sales`, `finance`, `finance.paystack`, `finance.bank_import`, `finance.vendor_bills`, `documents`, `analytics`, `buyer_portal`, `platform.import`. Limits: projects 1, entities 2, members 10, ai_budget 0.
  - **Growth** (sort 2): Starter plus `platform.whatsapp`, `sales.leads`, `sales.commissions`, `sales.site_plan`, `sales.transfer`, `sales.construction_linked_plans`, `realtor_portal`, `platform.sms`, `platform.digest`, `platform.ekyc`, `facility`, `hr`. Limits: 5, 6, 40, ai_budget 0.
  - **Enterprise** (sort 3): Growth plus `finance.close`, `finance.facilities`, `finance.revenue_recognition`, `finance.intercompany`, `finance.tax`, `documents.contracts`, `analytics.board_pack`. No count limits; ai_budget 0.
  - All of Release 1's job, site work included, is in every plan. WhatsApp sits in Growth and up, as release plan §5 says ("things that cost Vento money per use sit in higher plans"). If the owner wants it in Starter, that's one line in `starter.json`, not a code change.
  - Every plan sets `ai_budget: 0` explicitly, so the AI add-on's budget is the whole allowance. A missing value would mean unlimited.
- **Flags:** no `feature_releases` rows, so every flag is `internal`.
- **Vento Homes Ltd:** `internal` (everything, no limits).
- **Lekki Partners Ltd:** `standard` on Starter. It has a holding company and one SPV (at the entity limit), an owner (Bisi Lawal, `bisi@lekkipartners.ng`) and a sales member. A release override `on` for `sales.commissions` shows the owner hint locally.
- **Super-admin:** `ada@vento.ng`, with two-step switched on by the same helper the e2e fixtures use. The seed prints the TOTP secret once.
- **Production bootstrap:**
  1. Publish the three plan files.
  2. Run `superadmin grant <email> --bootstrap`.
  3. Leave every flag at `internal` until the owner releases it.

## 13. Build order
1. **Shared (½ day, blocks both tracks):** catalog and tests, schemas, `$meta`/`platform`/`forFeature`, error map, `me` shape, audit actions.
2. **In parallel:**
   - **Backend (3–4 days):**
     1. Tables and migrations, and seed-plans.
     2. Pure resolver with the truth table.
     3. Snapshot and store; context and middleware gate; `me`.
     4. Limits, concurrency test and call sites.
     5. Walk, isolation and query-count tests.
     6. Operations and audit, then the CLI and its tests.
     7. `notify-trials` and the email.
     8. Seed and e2e fixture commands.
   - **Frontend (2 days, in parallel; coordinate with the agent finishing 3a and rebase on its final `nav.ts`):**
     1. `NavAccess` and `nav.ts` with tests.
     2. Guard, `PermittedPage` and `NOT_FOUND` refetch.
     3. Tags.
     4. ⌘K hints and Talk to Vento.
     5. Trial line and `PlanLimitMessage`.

     A mocked `me` is enough until the backend's `me` lands (about day 2).
3. **Then:** e2e spec → docs → reviewer and ui-designer pass. The **security** agent reviews the gate ordering, the CLI's super-admin check and the platform audit triggers.

## 14. Docs to change (the implementer commits these)
- **`docs/decisions/0015-…md` and `0016-…md`** (text below), plus both rows in `docs/decisions/README.md`.
- **`CLAUDE.md` non-negotiable 1:** add the exception "Platform configuration (feature releases, plans and plan versions, platform admins, the platform audit trail) has no `organizationId` (decision 0015)." This is the owner's file, so the owner applies it.
- **`docs/ARCHITECTURE.md`:**
  - layout gains `src/platform/` (resolver, store, limits, operations, cli)
  - request flow step 4 gains the feature gate between two-step and `requirePermission`, and "no query: snapshot refreshed every 10 s"
  - Data: the platform tables, append-only `plan_versions` and `platform_audit_events`, migration `0004_platform_guards`
  - Build and run: the CLI entry
  - Environment: the new variables
- **`docs/DOMAIN.md`:**
  - **Core feature:** in every plan and never priced; may still have a release flag.
  - **Plan version:** an immutable snapshot of a plan's features and limits; organizations stay on theirs until moved.
  - **Platform audit event:** Vento-only, append-only record of flag, plan and super-admin changes.
  - Extend **Release group:** "New organizations are `standard` (and get the default plan, if one is set)."
- **`docs/design/SCREENS.md`:**
  - App shell and ⌘K rows gain "(feature flags: built)"
  - Module placeholder: "only in internal organizations (built)"
  - Plan limit message → `pattern` "(component built; wired in 3b)"
  - Trial ending → `pattern`
  - Flag and plan commands → `built`
  - 404 row: "also for unavailable modules"
- **`docs/journeys/12-vento-admin.md`:**
  - J-ADM-01 test paths confirmed
  - J-ADM-02 **Test** becomes `apps/api/src/platform/plans-cli.test.ts`, `apps/api/src/platform/limits.test.ts`, `limits.concurrency.test.ts`; `e2e/settings/plan-limits.spec.ts` arrives with 3b
  - "Behind the scenes": "API servers refresh within 10 seconds"
  - Status `built` when merged
- **`docs/journeys/01-onboarding-and-access.md`:** J-ONB-05 **Test** adds `e2e/shell/feature-availability.spec.ts`.
- **`docs/specs/README.md`:** feature-flags `approved` → `in build`, then `shipped`.
- **Skills:**
  - `add-module`:
    - a catalog entry
    - `forFeature('<key>')` in the contract (the walk fails without it)
    - set the nav item's `built: true`
    - register usage counters (`LIMIT_USAGE.projects`) and `FEATURE_RECORD_COUNTERS`
    - jobs and messages check `availabilityForOrganization` at send time
    - buyer-portal procedures gate with the organization from the token
  - `testing-patterns`: `createOrganization({ releaseGroup, planKey })`, `features` store in `clientAs`, `countingDb`, and "e2e never changes global stages; use per-organization overrides"
  - `ai-features`: availability = add-on + released + owner switch + budget; `ai_budget` from `me.plan.aiBudget`
  - `paystack`: webhooks are never feature-gated
  - `design-system`: "Early access" badge and the `PlanLimitMessage` pattern

### Decision record 0015
```markdown
# 0015 · Platform configuration lives outside organizations

- **Date:** 2026-11-26
- **Status:** proposed

## Context
Feature flags and plans (docs/specs/feature-flags.md) need data that belongs to Vento, not to any customer: the release stage of each feature, the plans and their versions, who is a Vento super-admin, and the trail of changes to all of these. Non-negotiable 1 says every domain table has an organizationId. Statutory rules (decision 0005) are the same kind of data, shared by all organizations and versioned.

## Decision
Platform configuration tables carry no organization_id: feature_releases, plans, plan_versions, platform_admins and platform_audit_events. Data about one organization stays organization-scoped as usual: organization_plans (release group and plan version), organization_add_ons, organization_trials and organization_overrides each have organization_id NOT NULL, indexed, and are in the isolation test. Platform tables are written only by platform operations (the pnpm flags/plans/superadmin commands now, the super-admin console later), never by customer-facing procedures, and are read by the server to decide availability. Plan versions and platform audit events are append-only (triggers). A super-admin is a platform role on the user (platform_admins), never an organization role, and needs two-step. Each change writes a platform audit event in the same transaction and, when it affects one organization, a plain-words event in that organization's audit trail, without Vento's internal reason or the staff member's identity.

## Consequences
- One place defines what each plan contains; organizations reference versions, so a customer's deal never changes under them.
- Reviewers must treat a new table without organization_id as an exception that needs this record or a new one.
- The platform audit trail is separate from organizations' trails; a console will need its own viewer.
- Customer data can't leak through these tables because they hold no customer data; the per-organization tables follow every isolation rule.

## Alternatives considered
- organization_id on every table, with plans copied per organization: duplicates plan contents, makes "publish a new version" a fan-out write, and blurs who owns the data.
- A nullable organization_id meaning "platform": breaks the NOT NULL rule and complicates every query and index.
- A third-party flag service: personal and commercial data leaves our database, adds a processor under the NDPA, and still needs plans locally.
```

### Decision record 0016
```markdown
# 0016 · Feature availability: declared in the contract, enforced in member, read from memory

- **Date:** 2026-11-26
- **Status:** proposed

## Context
Every feature must be released to an organization and paid for before anyone there can see or call it, and this must hold on the server for every procedure, add no database query per request, and take effect within 30 seconds of a change. Modules will add hundreds of procedures over the next releases; a per-procedure check written by hand would eventually be forgotten.

## Decision
Each oRPC contract procedure declares meta.feature: a catalog key, or null for platform procedures without a flag. memberMiddleware, after the tab guard, the membership load and the two-step check, reads the procedure's meta and answers NOT_FOUND when the feature isn't available, before requirePermission runs. Availability = released (stage, release group, release override) and entitled (core, internal group, entitlement override, plan version, add-on) and every prerequisite available; stage off beats everything. The organization's release group and plan version come from the membership query that already runs; stages, plan versions, live overrides and active add-ons come from an in-memory snapshot that each API server reloads every 10 seconds; expiry is compared at read time. Plan limits are checked inside the create's transaction under a row lock on the organization's plan row and refused with FORBIDDEN plan_limit. account.me returns the available features (and, to owners only, plan, limits and upgrade hints), so navigation renders correctly on first paint. A walk test fails if any procedure lacks the declaration or a feature-keyed procedure isn't on member.

## Consequences
- A procedure can't be callable without being gated: the contract is the single declaration, and the test enforces it.
- Unavailable looks like "doesn't exist": one path in the web app, no API error doubles as a sales message.
- Changes reach every server within 10 seconds and the web on its next me; up to ~40 seconds end to end in the worst case.
- Each server holds the whole snapshot in memory; fine for thousands of organizations, revisit if overrides grow very large.
- Jobs, messages and webhooks must call availabilityForOrganization themselves; Paystack webhooks never drop money.

## Alternatives considered
- .use(requireFeature(key)) by hand in each router: same effect, but a forgotten line is silent; meta in the contract is also visible to tests and tools.
- Query the database per request: simplest and always fresh, but adds a query to every call against the owner's speed requirement.
- LISTEN/NOTIFY or a revision table: faster propagation, but a dedicated connection or triggers to maintain; a 10-second reload of a tiny dataset is enough.
- FORBIDDEN for features outside the plan: leaks what exists to every member and turns errors into upsell; owners get hints from me instead.
```

## 15. Risks and open questions

**Questions for the owner (each changes the build)**
1. **Plan for an organization that signs itself up.** *Recommended:* the default plan (Starter, `is_default_for_new`), so a new developer can start the core job at once while Vento follows up commercially. **Alternative:** no plan. They'd see Home only until Vento runs `plans assign`, and counts would be unlimited. Either way it's one line in onboarding plus a seed flag.
2. **Should commands also ask for the super-admin's current two-step code?** Today `--by` must name an active super-admin with two-step on, and the operator (`os-user@host`) is recorded, but anyone with host access could type another person's email. *Recommended:* not now. The R2 console brings real sign-in. A code prompt is about ½ day (Better Auth's `symmetricDecrypt` plus `createOTP`) if you want it now.

**Decisions this plan makes (say if you disagree)**
- **`me.organization.internal` is sent to every member.** The web needs it to keep unbuilt modules ("Soon") out of customers' navigation. It reveals nothing beyond "false" to customers.
- **"Trial ended" lands in the organization's audit trail from the daily run, up to a day late.** The entry carries the real end time, and access ends exactly on time regardless.
- **Owners also get AI hints, worded "Available with the AI add-on".**
- **An organization with no plan has no count limits.** It also has no paid features, so there is nothing to abuse beyond core settings.

**Risks**
- **oRPC meta through `implement()`:** confirm on day 1 that `procedure['~orpc'].meta` carries the contract's meta in middleware (oRPC 1.16.5 types say yes). The fallback is `.use(requireFeature(key))` in routers, with the walk checking the middleware list.
- **3a is still moving.** `nav.ts` and its callers are being finished by another agent. The frontend track rebases on the final 3a, keeps the role-table tests, and only changes the signature from `permissions` to `NavAccess`.
- **e2e and "Early access":** an e2e check isn't possible until a module is built. Unit tests cover it.
- **Internal organizations have an unlimited `ai_budget`.** Vento's own testing can spend real AI money. The AI brick's owner-set budget in Settings → AI still caps it.
- **Plan files are in a public repository.** Contents and limits are public anyway on a pricing page. Prices are never stored here.
- **A flag removed from the catalog** leaves stale keys in `plan_versions` and `feature_releases`. These are ignored and listed by `flags list`. Clean-up is a command, not a migration.
- **The limit lock** serializes limited creates within one organization (milliseconds). Unlimited creates skip both the lock and the count.
- **Snapshot staleness when the database is unreachable:** servers keep the last snapshot. A kill switch can't propagate during an outage, but nothing else works then either. An error is logged after 60 s for monitoring.

**Follow-ups (not in this slice)**
- Super-admin console (R2)
- Billing and plan screen
- Two-step code on commands (question 2)
- `e2e/settings/plan-limits.spec.ts` with 3b
- Revision-based refresh if the snapshot grows

Files read for this plan:
- `/Users/godsfavournwoko/vento-realestate/docs/specs/feature-flags.md`
- `/Users/godsfavournwoko/vento-realestate/docs/release-plan.md`
- `/Users/godsfavournwoko/vento-realestate/docs/plans/app-shell.md`
- `/Users/godsfavournwoko/vento-realestate/docs/ARCHITECTURE.md`
- `/Users/godsfavournwoko/vento-realestate/apps/api/src/access/middleware.ts`
- `/Users/godsfavournwoko/vento-realestate/apps/api/src/access/context.ts`
- `/Users/godsfavournwoko/vento-realestate/apps/api/src/modules/account/account.service.ts`
- `/Users/godsfavournwoko/vento-realestate/apps/api/src/test/procedure-guard.test.ts`
- `/Users/godsfavournwoko/vento-realestate/apps/api/src/test/e2e-fixtures.ts`
- `/Users/godsfavournwoko/vento-realestate/apps/api/src/db/seed.ts`
- `/Users/godsfavournwoko/vento-realestate/packages/shared/src/common/errors.ts`
- `/Users/godsfavournwoko/vento-realestate/apps/web/src/features/shell/nav.ts`
- `/Users/godsfavournwoko/vento-realestate/apps/web/src/features/shell/command-results.tsx`
- `/Users/godsfavournwoko/vento-realestate/apps/web/src/components/shell/app-shell.tsx`