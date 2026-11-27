# Plan: Approvals and audit (brick 4)

- **Status:** approved (owner, 26 Nov 2026, all 8 plan questions as recommended). Build starts only after the admin console merges to `main`.
- **Spec:** [docs/specs/approvals-and-audit.md](../specs/approvals-and-audit.md) (approved, all 8 recommendations, 26 Nov 2026)
- **Journeys:** J-EXE-02 (rewritten), J-ONB-12 and J-ONB-13 (new), J-ONB-08 and J-ONB-06 (approval step added)
- **Branch:** `brick/04-approvals-audit`, cut from `main` **after the admin console merges**. **One pull request.**
- **Decision record:** [0024 One approvals engine: request, approve, execute](../decisions/0024-one-approvals-engine-request-approve-execute.md) (accepted; was 0021 before the console took that number)
- **Written:** 26 Nov 2026, against `main` at `af849c1` (3d merged: oRPC 1.16, Drizzle, TanStack Router, migrations up to `0010_passkey_guards.sql`)

## Summary (plain English)
- **One engine for every "needs a second person" action.** A module registers the action once: what it stores, how to describe the change, who mustn't approve it, and how to carry it out. Its service then calls one function. If no rule applies, the action happens as it does today. If a rule applies, Vento saves a request, and the action happens only when the last approver says yes, in the same database transaction as that yes.
- **Brick 4 plugs in three platform actions**, which proves the engine before any money module: changing a custom role's permissions, making a member an owner, and inviting someone as an owner (plan question 2).
- **Approval rules** live in Settings: owners edit them, everyone else with Settings access reads them. Two default rules are written for every organization.
- **Approvals inbox** for everyone who can approve or has asked; a waiting count in the top bar.
- **Audit log** in Settings: the existing audit table, read in plain words, with search, filters and CSV export. No change to the audit table itself.
- **Two-step for approvers:** any role with Approve anywhere now requires two-step. Land & legal and Project manager change, and their holders get the usual 7 days to set it up.
- **Emails:** "approval needed" to the next approvers, "approved/rejected" to the maker, and "approval rule changed" to the other owners.

---

## 1. Summary (technical)
- **Schema (one generated migration, one custom):** `approval_rules`, `approval_rule_steps`, `approval_rule_step_roles`, `approval_rule_entities`, `approval_requests`, `approval_request_step_roles`, `approval_decisions`. Custom SQL: append-only triggers on `approval_decisions`, the "role used in a rule" guard, the one-pending-per-subject partial unique index, the default-rule backfill for existing organizations, and `requires_two_step = true` for every role with `approve`.
- **Shared (`packages/shared/src/approvals/`):** the action catalog (keys, labels, chips, module, amount flag, irreversible flag, `whenNoApprover`, extra condition, default rules), rule and request zod schemas, the pure rule matcher, the policy sentence and the chain text. `packages/shared/src/audit/` gains plain-words labels and field labels for every audit action, plus a module for each action.
- **API (`apps/api/src/approvals/`):** the engine (`requestOrRun`, `decide`, `cancel`, `expireDue`), eligibility, the plug-in registry, and the three platform plug-ins. Routers: `approvals.*`, `approvalRules.*`, `audit.*`.
- **Changed services:** `roles.update`, `members.updateAccess`, `invitations.send` and `roles.delete` (role-in-rule guard); `members.remove` cancels the maker's pending requests; `account.me` gains `approvalsWaiting` and `canSeeApprovals`; `roleNeedsTwoStep` includes `approve`.
- **Web:** an `/approvals` route (list and detail, a phone detail page), `/settings/approval-rules`, `/settings/audit-log`, a `SendForApprovalSheet` and a `WaitingForApproval` status, the top-bar link and count, a sidebar item, the owner/admin phone tab, ⌘K entries, and View history links.
- **Jobs:** `approvals expire` added to the platform command line, scheduled daily like `plans notify-trials`. Expiry is also applied on every read and decision, so the job is only a tidy-up.
- **No new runtime dependencies.**

## 2. Domain model
```
ApprovalRule ─* ApprovalRuleStep (position 1..3) ─* ApprovalRuleStepRole ─→ Role
     │ actionKey, minAmount? (NGN, "over"), appliesToAll
     └─* ApprovalRuleEntity ─→ Entity                    (when not appliesToAll)

ApprovalRequest  actionKey, module, entityId?, subjectType+subjectId, payload (jsonb),
     │           summary (jsonb: title, recordLabel, recordLink, amount, changes),
     │           reason, makerMemberId, status, currentStep, stepCount, ruleId (nullable,
     │           for display), policy (text), excludedUserIds[], expiresAt, decidedAt
     ├─* ApprovalRequestStepRole (position, roleId)       copied from the rule at request time
     └─* ApprovalDecision (position, memberId, decision approve|reject, comment)   append-only
```
- **Status** `pending → approved | rejected | cancelled | expired`. `expired` carries `endedReason` (`timeout` | `stale`).
- **Copying the rule** (spec: "changes apply to new requests only") is done with relational rows, not jsonb. The inbox then reads "requests whose current step includes my role" from one index.
- **Subject** (for example `role` plus the role id, or `member` plus the member id) gives one pending request per subject and action: a partial unique index `(organization_id, action_key, subject_type, subject_id) where status = 'pending'`.
- **Amounts:** `min_amount numeric(14,2)` on the rule; `amount numeric(14,2)`, `currency char(3)` and `ngn_amount numeric(14,2)` on the request. Strings in TS, compared with `Decimal` from `packages/shared/src/common/decimal.ts`. Brick 4's actions have no amount; the columns exist so money modules don't need a migration.

## 3. Database (`apps/api/src/db/schema/approvals.ts`, exported from `schema/index.ts`)
Every table has `id()` (uuidv7), `organizationId` NOT NULL and indexed, `...timestamps`, and `unique(organizationId, id)`. References inside the organization are composite `(organization_id, x_id)` foreign keys (decision 0012).
| Table | Key columns | Indexes and constraints |
|---|---|---|
| `approval_rules` | `actionKey text`, `minAmount numeric(14,2)` null, `appliesToAll bool`, `createdByMemberId` | unique `(org, action_key, min_amount, applies_to_all)` when `applies_to_all` (nulls not distinct); same-scope duplicates for company rules checked in the service under a lock |
| `approval_rule_steps` | `ruleId`, `position smallint` 1–3 | unique `(rule_id, position)`; check `position between 1 and 3` |
| `approval_rule_step_roles` | `stepId`, `roleId` | unique `(step_id, role_id)`; index `(org, role_id)` for the delete guard |
| `approval_rule_entities` | `ruleId`, `entityId` | unique `(rule_id, entity_id)` |
| `approval_requests` | as in §2; `makerMemberId`, `makerName` (as at the time) | partial unique pending-per-subject; index `(org, status, created_at)`; index `(org, maker_member_id, created_at desc)`; check `current_step between 1 and step_count` |
| `approval_request_step_roles` | `requestId`, `position`, `roleId` | index `(org, role_id, request_id)` |
| `approval_decisions` | `requestId`, `position`, `memberId`, `memberName`, `decision`, `comment` | unique `(request_id, position)` (one decision per step); unique `(request_id, member_id)` (nobody decides two steps); **append-only triggers** as on `audit_events` |

**Custom migration (`00NN_approvals_guards.sql`, numbered after whatever the console adds):**
- the `approval_decisions_append_only()` trigger, which copies `audit_events_append_only()` from `0001`;
- `roles_not_in_rule()`: refuses `roles.archived_at` being set while an `approval_rule_step_roles` row points at the role. It backs up the service check, like the 3c guards in `0008`;
- inserts the two default rules (§6.4) for every existing organization, created by the first owner;
- `update roles set requires_two_step = true, version = version + 1` for every role with any `approve` row (plan question 5).

**Not changed:** `audit_events`. The module filter maps action to module in code (§4), so no column is added and no backfill has to fight the append-only trigger.

## 4. Shared (`packages/shared`)
**`src/approvals/catalog.ts`.** The catalog holds metadata only (no server code), so the web can show labels and chips:
```ts
export const APPROVAL_ACTIONS = {
  'access.role.update':   { module: 'settings', label: "Change a role's permissions", chip: 'Roles',
                            hasAmount: false, irreversible: false, whenNoApprover: 'proceed',
                            extraCondition: "Can't give access the approver doesn't have",
                            defaults: [{ minAmount: null, steps: [['owner', 'admin']] }] },
  'access.member.make_owner': { module: 'settings', label: 'Make someone an owner', chip: 'Owners', …,
                            defaults: [{ minAmount: null, steps: [['owner']] }] },
  'access.invitation.owner':  { module: 'settings', label: 'Invite someone as an owner', chip: 'Owners', …,
                            defaults: [] /* covered by make_owner's rule, see question 2 */ },
} as const satisfies Record<string, ApprovalActionMeta>
```
Defaults name built-in role keys and are turned into role ids per organization. A catalog test checks that every action's module is a `PermissionModule` and that every default names a built-in role with `approve` in that module.

**Other files:**
- **`src/approvals/schema.ts`:** `approvalRuleInput` (action, `when: { kind: 'any' } | { kind: 'over', amount: money }`, `steps: roleId[][]` with 1–3 steps of 1–9 roles each, `entityIds: uuid[] | 'all'`), `approvalRuleRow`, `approvalRequestRow` (list), `approvalRequestDetail` (summary, steps with decisions, `canDecide`, `blockedReason`, `isOwn`), `decideInput` (`requestId`, `decision`, `comment` up to 500 characters, required to reject), `requestOutcome = { ran: true, notice } | { ran: false, requestId, notice }`.
- **`src/approvals/match.ts` (pure, unit-tested):** `matchRule(rules, { actionKey, entityId, ngnAmount })`. The company's own rules come first, then all-company rules; within those, the highest `minAmount` the amount is over; "any" matches when nothing else does. Also `belowThresholdLine(rules)` for "Below ₦5,000,000: no approval needed".
- **`src/approvals/copy.ts`:** `chainText(steps, roleNames)` → "Finance → MD", "Owner or Admin", and `policySentence(rule)`, both shared by the rules page, the request and the emails.
- **`src/audit/actions.ts`:** adds the ten actions from the spec.
- **`src/audit/labels.ts`:** `AUDIT_ACTION_META: Record<AuditAction, { module: PermissionModule | 'account', what: (e) => string }>` and `FIELD_LABELS`. A test fails when an action has no entry. Labels say "company" for `entity.*` actions (decision 0018).
- **`src/access/role-rules.ts`:** `roleNeedsTwoStep` also returns true when any module has `approve`; its tests and the 3c lock copy are updated ("…or approve anything").
- **`src/approvals/contract.ts`, `src/audit/contract.ts`:** registered in `src/contract.ts` as `approvals`, `approvalRules` and `audit`. They are all `platform` procedures (no feature flag: approvals and audit are in every plan, `DOMAIN.md` *Feature*).

**Contract:**
| Procedure | Input | Output | Guard |
|---|---|---|---|
| `approvals.list` | `tab: waiting\|mine\|decided`, `entityId?`, page | `{ items, page, pageSize, total }` | member |
| `approvals.get` | `id` | `approvalRequestDetail` | member; visible to the maker, the people who decided it, and eligible approvers |
| `approvals.decide` | `decideInput` | `{ notice, ran }` | member + eligibility (§5) |
| `approvals.cancel` | `id` | `{ notice }` | maker only |
| `approvals.preview` | `actionKey`, `subject` | `{ needed: false } \| { needed: true, chain, policy, blocked? }` | member; drives the save bar wording |
| `approvalRules.list` | – | `{ items }` grouped by action, with `gaps` | settings view |
| `approvalRules.create` / `update` / `delete` | rule input; `update` takes `version` | row / notice | settings edit + owner + all companies |
| `audit.list` | `q?`, `module?`, `actorUserId?`, `entityId?`, `from`, `to`, `targetType?`, `targetId?`, page | page of `auditRow` | settings edit + all companies |
| `audit.get` | `id` | `auditDetail` (fields, approvers, record link) | same |
| `audit.export` | same filters | `File` (text/csv) | same; audited |
| `account.me` (changed) | – | adds `approvalsWaiting: number`, `canSeeApprovals: boolean` | – |

## 5. Permissions and access
- **Eligibility (`apps/api/src/approvals/eligibility.ts`).** One SQL predicate, used by the inbox, the count and `decide`. An eligible approver:
  - is an active member;
  - holds a role in `approval_request_step_roles` at the request's `current_step`;
  - has a role with `approve` in `request.module` (from `role_permissions`);
  - has company access that covers the request: if `entity_id` is null, the member must have no entity limits; otherwise no limits, or a limit row for that company;
  - is not the maker;
  - has no earlier decision on the request;
  - is not in `excluded_user_ids`.

  `decide` checks it again after `SELECT … FOR UPDATE` on the request, then calls the plug-in's `excluded()` once more for the live answer.
- **Rules:** the `requirePermission('settings','edit',…)` and `requireAllEntities()` middlewares, plus a new `requireOwner()` (`apps/api/src/access/middleware.ts`) that refuses with "Only owners can change approval rules."
- **Audit log:** `requirePermission('settings','edit','see the audit log')` + `requireAllEntities()`.
- **Approvals visibility:** `canSeeApprovals` = the role has `approve` in any module, or the member made a request in the last 90 days. The nav item and the `/approvals` route use it. The API never relies on it: each procedure filters to rows the person may see.
- **Two-step:** approvers' roles now require it (§3). `decide` sits behind `member` (the two-step gate), so a holder in grace can approve. After the 7 days the gate refuses everything anyway.
- **Isolation:** every query filters by `ctx.organizationId`. Another organization's id answers NOT_FOUND. `isolation.test.ts` gains the seven tables.

## 6. Services (`apps/api`)
### 6.1 Engine: `src/approvals/engine.ts`
```ts
requestOrRun<K>(tx, ctx, key: K, input: { payload; subject; reason?: string }): Promise<RequestOutcome>
```
1. `plugin = registry[key]`. Call `plugin.describe(tx, payload)` → summary, `entityId`, amount.
2. Load the organization's rules for `key` (one query), then `matchRule`. No rule → `plugin.execute(tx, ctx, payload, { approvedBy: [] })` → `{ ran: true }`.
3. If the rule matched but **no reason** was given → `BAD_REQUEST reason_required` ("Tell the approver why."). The web always asks for one first (§7).
4. Check **every step** of the chain (after review; first this checked step 1 only): for every subset of steps there must be at least as many distinct eligible people as steps, so one person can't fill two steps. If a step has nobody: `whenNoApprover === 'proceed'` → execute, the action's audit event gets `metadata.noApprover = true`, and every other owner is emailed; `sole_owner` (make owner, owner invitations) → like `proceed` only when the maker is the only active owner, otherwise `CONFLICT no_approver`; `refuse` → `CONFLICT no_approver` with the spec's message.
5. Insert the request and its step roles, store `excluded = plugin.excluded(...)`, set `expires_at = now() + 7 days`, record `approval.requested`, and queue the "approval needed" emails for step 1. The pending unique index turns a duplicate into `CONFLICT already_pending` with `{ requestId }`.

`decide(ctx, input)` runs in one transaction:
1. Lock the request. If it has passed `expires_at`, mark it expired → `CONFLICT expired`.
2. Check eligibility.
3. Insert the decision.
4. **Reject:** set `status = rejected` and `decidedAt`, and audit.
5. **Approve, not the last step:** `current_step += 1`, audit `approval.step_approved`, email the next step.
6. **Approve, last step:** `plugin.execute(tx, makerContext, payload, { approvedBy })`, where `makerContext` is the maker reloaded live (question 3: the change is the maker's). The action's audit event has `actor` = the maker, `metadata.approvedBy` = the approvers' names in order, and `metadata.approvalRequestId`. Then `status = approved`, audit `approval.approved`, and email the maker.
7. If `execute` throws a `StaleError`, set `status = expired` and `endedReason = 'stale'` in a **second** short transaction after the rollback, audit `approval.expired`, and return `CONFLICT stale` with the message.
8. A concurrent decision loses on the `(request_id, position)` unique key → "Aisha Bello approved this a moment ago."

`cancel(ctx, id)`: maker only, while pending. `cancelForLeaver(tx, memberId)` is called from `members.remove` in its transaction. `expireDue(db, now)` expires pending requests whose time has passed, in batches of 500, auditing each one.

### 6.2 Plug-in contract: `src/approvals/registry.ts`
```ts
export type ApprovalPlugin<P> = {
  key: ApprovalActionKey
  payload: z.ZodType<P>
  subject(p: P): { type: string; id: string }
  describe(tx, ctx, p: P): Promise<RequestSummary & { entityId: string | null }>
  excluded(tx, ctx, p: P): Promise<{ userId: string; reason: string }[]>
  execute(tx, ctx: ExecuteContext, p: P, meta: { approvedBy: Approver[] }): Promise<{ notice: string }>
}
```
`registry.ts` imports every plug-in, and a test checks that its keys equal the catalog's keys. Plug-ins live beside their module: `src/modules/roles/approvals.ts` and `src/modules/members/approvals.ts`. That is the pattern receipts, POs and the other money actions follow.

### 6.3 The three plug-ins
- **`access.role.update`** (`roles.service.updateRole`):
  - Today's checks stay in place: built-in role, own role, ceiling, all companies.
  - The service then calls `requestOrRun` with payload `{ roleId, version, permissions, requiresTwoStep }`. A rename alone runs at once, because the rule guards permissions only.
  - `describe`: the changes from `permissionChanges()`, for the Field/Before/After table.
  - `excluded`: anyone whose own permissions don't cover the new set ("This change gives access you don't have…"), and anyone who holds that role.
  - `execute`: re-checks `version`, then does today's update and audit. A version mismatch raises `StaleError`.
  - Edits to a role **nobody holds** run at once (plan question 1).
- **`access.member.make_owner`** (`members.service.updateMemberAccess` when the new role is owner and the old one isn't):
  - payload `{ memberId, roleId, entityIds }`;
  - `excluded`: the target member;
  - `execute`: today's path, including the new-owner alert emails.
- **`access.invitation.owner`** (`invitations.service` when any invitation in a batch is for owner):
  - Owner rows split off into one request per invitation; the other rows send as today.
  - `execute` creates and sends the invitation, so no invitation exists while it waits. The invitation's 7 days start at approval.

### 6.4 Rules: `src/modules/approval-rules/approval-rules.service.ts`
- **Create, update, delete:**
  - lock the organization row (as 3c does), validate the roles (active, `approve` in the module), check for a duplicate scope, and write the rows;
  - audit `approval_rule.*` with before and after as chain text;
  - after commit, email every other owner (plan question 4).
  - `update` takes `version` (on `approval_rules`, as with roles). The rule sheet's Undo after a delete re-creates the rule.
- **`list`:** rules with their chain text, company names and `gaps` (a step nobody can approve, per company in scope). Computed with the eligibility predicate turned around: count the members per role and company.
- **`seedDefaultRules(tx, organizationId)`:** called from `onboarding.service` when an organization is created, and by the migration backfill.

### 6.5 Audit read: `src/modules/audit/audit-read.service.ts`
- **`list`:**
  - the date range is required (default the last 7 days, at most 366 days), so every query uses `audit_events_org_created_idx`;
  - `module` filters on the set of actions for that module from `AUDIT_ACTION_META`;
  - `entityId` matches `target_type='entity' and target_id=$1` or `metadata->>'entityId' = $1` (approval and future module events write `entityId` into metadata);
  - `q` matches `actor_name` and `target_label` (ILIKE, escaped with `lib/like.ts`) or the actions whose label contains `q`.
- **`get`:** the row, its labelled fields, and the decisions of its `metadata.approvalRequestId`, if any.
- **`export`:** the same query in pages of 1,000 into a CSV, capped at 50,000 rows (`CONFLICT too_many` with the count). Cells starting with `= + - @` or a tab get a leading `'` (CSV injection). Audited as `audit.exported` with the filters and count.
- **The before → after view** is built on the server from `FIELD_LABELS`. Unknown keys become "Other details changed", so raw JSON never leaves the API.

### 6.6 Email: `src/email/templates/`
- `approval-needed.ts` (EmailApproval board), `approval-decided.ts`, `approval-rule-changed.ts`, all on `layout.ts` and `escape.ts`;
- sent after commit with `sendAll` (console in development, as today);
- approver lists are computed inside the transaction and capped at 50 recipients per step.

### 6.7 Command: `src/platform/cli/approvals.ts`
- `approvals expire` runs `expireDue`;
- it needs `VENTO_CRON=1` or `--by`, like `plans notify-trials`;
- `docs/RUNBOOK.md` adds it to the daily schedule.

## 7. Web (`apps/web`)
- **Routes:**
  - `routes/_app/_shell/approvals.tsx` (search params `tab`, `id`, `entity`);
  - `routes/_app/_shell/approvals.$id.tsx` (the phone detail, also a deep link);
  - `routes/_app/_shell/settings/approval-rules.tsx`;
  - `routes/_app/_shell/settings/audit-log.tsx` (filters in search params; `orgWide` on the settings pages).
- **`features/approvals/`:**
  - `approvals-page.tsx` (tabs, two panes from `md`, list then page below it);
  - `approval-row.tsx` (the ApprovalRow component);
  - `approval-detail.tsx` (summary, `changes-table.tsx`, `steps-chain.tsx` using TimelineItem, the comment and buttons);
  - `own-request-note.tsx`;
  - `use-decide.ts` (optimistic removal from *Waiting for me*, the next row opens, a toast; on CONFLICT it refetches and shows the message);
  - `use-approval-keys.ts` (J/K/A/R, using `use-shortcuts.ts`);
  - `approvals-queries.ts`;
  - `irreversible-confirm.tsx`.
- **`features/approvals/send/`:**
  - `send-for-approval-sheet.tsx` (summary, chain from `approvals.preview`, **Why?**);
  - `waiting-for-approval.tsx` (status and **Cancel request**);
  - `use-request-or-run.ts`: wraps a mutation whose result is `requestOutcome`, and opens the sheet when `preview.needed`.
- **Changed screens:**
  - **Role page:** `role-save-bar.tsx` reads **Send for approval** when `preview.needed`, and has no Undo for a request. `role-page.tsx` shows `WaitingForApproval` and makes the grid read-only while a request is pending, adds an "Approves:" line from `approvalRules.list`, and puts **View history** in `role-actions.tsx`.
  - **Team:** the Make owner confirm in `team-confirms.tsx` and `use-change-role.ts` goes through the sheet. The role cell reads "Owner · waiting for approval". **View history** goes in `member-sheet.tsx`, and the invite sheet notes "Owner invitations need approval before they're sent".
- **`features/approval-rules/`:** `rules-page.tsx`, `rules-table.tsx` (grouped, gaps in amber), `rules-cards.tsx` (phones), `rule-sheet.tsx` (react-hook-form + zod from shared, step builder with up to 3 steps and a role multi-select with disabled reasons), `delete-rule-confirm.tsx`.
- **`features/audit-log/`:** `audit-page.tsx`, `audit-toolbar.tsx` (search debounced at 300 ms, Module, Person, Company, Dates), `audit-table.tsx` (TanStack Table, cards on phones), `audit-entry-sheet.tsx`, `use-audit-search.ts`. Export downloads the `File`.
- **Shell:**
  - `features/shell/nav.ts`: Approvals under Overview when `canSeeApprovals`;
  - `components/shell/top-bar.tsx`: an Approvals link with the `approvalsWaiting` badge (from `meQuery`, 30-second stale time, refetch on focus);
  - `components/shell/mobile-tabs.tsx`: an Approvals tab for owners and admins in place of Sales, as planned in 3a;
  - `more-sheet.tsx`: Approvals for everyone else who can see it;
  - `use-shell-actions.ts`: three ⌘K entries.
- **Settings:** `features/settings/sections.ts` gains `approval-rules` (settings view) after Roles, and `audit-log` (settings edit plus all companies) last in the organization group.
- **Offline:** decide, cancel and save are disabled through the existing `useOnline()`, with the spec's line.

## 8. Files
**New:**
- **shared:** `packages/shared/src/approvals/{catalog,schema,match,copy,contract,index}.ts` with tests; `packages/shared/src/audit/{labels,contract,schema}.ts` with tests.
- **api schema and migrations:** `apps/api/src/db/schema/approvals.ts`; two migrations in `apps/api/drizzle/`.
- **api engine:** `apps/api/src/approvals/{engine,registry,eligibility,errors,emails}.ts` with tests.
- **api modules:** `apps/api/src/modules/roles/approvals.ts`, `apps/api/src/modules/members/approvals.ts`, `apps/api/src/modules/invitations/approvals.ts`, `apps/api/src/modules/approvals/approvals.{router,service}.ts`, `apps/api/src/modules/approval-rules/approval-rules.{router,service}.ts`, `apps/api/src/modules/audit/audit-read.service.ts`, `apps/api/src/modules/audit/audit.router.ts`, `apps/api/src/modules/audit/csv.ts`.
- **api email and command:** `apps/api/src/email/templates/{approval-needed,approval-decided,approval-rule-changed}.ts`, `apps/api/src/platform/cli/approvals.ts`.
- **web:** `apps/web/src/features/{approvals,approval-rules,audit-log}/…` and the four routes in §7.
- **e2e:** `apps/web/e2e/platform/approvals-inbox.spec.ts`, `apps/web/e2e/settings/approval-rules.spec.ts`, `apps/web/e2e/settings/audit-log.spec.ts`, `apps/web/e2e/settings/accessibility-approvals.spec.ts`.

**Changed:**
- **shared:** `packages/shared/src/contract.ts`, `audit/actions.ts`, `access/role-rules.ts` (+ test), `account/schema.ts` (`me`).
- **api:** `apps/api/src/router.ts`, `db/schema/index.ts`, `access/middleware.ts` (`requireOwner`), `modules/roles/roles.service.ts`, `modules/members/members.service.ts`, `modules/invitations/invitations.service.ts`, `modules/onboarding/onboarding.service.ts`, `modules/account/account.service.ts`, `platform/cli/main.ts`, `db/seed.ts`, `test/isolation.test.ts`, `test/permissions-matrix.test.ts`, `test/factories.ts`.
- **web:** the shell and settings files in §7, and `features/roles/*` and `features/team/*` as listed.
- **docs:** listed in §12.

### Overlap with the admin console (`feat/admin-console`)
Brick 4 works only on the organization audit (`audit_events`) and the approvals engine. It doesn't touch platform audit: `platform/platform-audit.ts`, `platform_audit_events`, the platform tables and the console router are all left alone. Expected touch points in shared areas:

| Area | Brick 4 touches | Kind of change |
|---|---|---|
| `apps/api/src/modules/audit/` | `audit.service.ts` (no change in behaviour; it may export the `row()` shape); new `audit-read.service.ts`, `audit.router.ts`, `csv.ts` | Additive |
| `apps/api/src/access/` | `middleware.ts` (adds `requireOwner()`) | Additive, one new export |
| `apps/api/src/router.ts` | Mounts `approvals`, `approvalRules`, `audit` in the customer router | Three lines |
| `apps/api/src/db/schema/index.ts` | Exports `approvals.ts` | One line |
| `apps/api/drizzle/` | Two new migrations, generated after the rebase | New files |
| `apps/api/src/platform/cli/main.ts` | Registers the `approvals expire` command | One line |
| `apps/api/src/db/seed.ts`, `test/isolation.test.ts`, `test/permissions-matrix.test.ts`, `test/factories.ts` | Seed data and new tables in the tests | Additive |
| `packages/shared/src/contract.ts` | Adds `approvals`, `approvalRules`, `audit` | Three lines |
| `packages/shared/src/audit/actions.ts` | Appends ten `AUDIT_ACTIONS` | Append only |
| `packages/shared/src/audit/` | New `labels.ts`, `contract.ts`, `schema.ts` | New files |
| `packages/shared/src/access/role-rules.ts` | `roleNeedsTwoStep` includes `approve` | Behaviour change |
| `packages/shared/src/account/schema.ts` | `me` gains `approvalsWaiting`, `canSeeApprovals` | Additive |

If the console adds organization-side audit actions (for example "Vento viewed your data" for read-only support access), `labels.ts` needs a label for each one. The labels test will flag any that are missing after the rebase.

**The console's shared-file list** (from the coordinating session, 26 Nov 2026), and what to do after rebasing on it:
- **`audit/actions.ts`:** the console appends `plan.add_on_changed` and `console.opened`. Give both plain-words labels and modules in `labels.ts`.
- **`account/schema.ts`:** the console adds `me.console` and a `console` next step. Keep both alongside `approvalsWaiting` and `canSeeApprovals`.
- **`access/middleware.ts`:** the console changes about 3 lines in `authenticate()`. `requireOwner()` is separate, so only the file is shared.
- **`router.ts`:** the console adds a `console` key, and its new `apps/api/src/api-contract.ts` composes the customer and console contracts. Mount `approvals`, `approvalRules` and `audit` in the **customer** contract.
- **Migrations:** the console takes `0011_console`. Brick 4 merges second, so its migrations are regenerated after it.
- **Unchanged by the console:** `contract.ts`, `role-rules.ts`, `platform/cli/main.ts` and `modules/audit`.

## 9. Tests
- **Shared unit tests:**
  - `match.test.ts`: company beats all; highest threshold wins; equal to the threshold isn't "over"; foreign amount uses `ngnAmount`; "any" fallback; no rule.
  - `catalog.test.ts`.
  - `labels.test.ts`: every action has a label and module.
  - `role-rules.test.ts`: approve requires two-step.
  - `copy.test.ts`.
- **Engine service tests (real Postgres, `apps/api/src/approvals/engine.test.ts`):**
  - no rule runs at once;
  - a rule creates a request and nothing changes;
  - the maker can't decide, including a maker who is an owner;
  - the same person can't decide two steps;
  - an excluded person is refused with the reason;
  - a 2-step chain runs on the second approval, and the action's audit carries `approvedBy`;
  - reject leaves nothing changed;
  - stale (role version bumped) expires, and the role is unchanged;
  - timeout expiry on read and in `expireDue`;
  - a concurrent decision on the same step: two parallel transactions, one wins;
  - a duplicate pending request is refused with its id;
  - `whenNoApprover` proceed and refuse;
  - an edited rule doesn't change a pending request;
  - removing the maker cancels the request;
  - company scoping: an approver limited to another company isn't eligible.
- **Plug-in tests:** each of the three plug-ins, through its real service. A catalog-walk test fails if a registry key has no `*.approvals.test.ts`.
- **Rules:**
  - owner only, all companies;
  - duplicate scope refused;
  - roles without approve refused;
  - gaps computed;
  - deleting a role used in a rule is refused (service and trigger);
  - other owners emailed (memory transport).
- **Audit read:**
  - filters, search escaping, date bound required;
  - a label for every row;
  - CSV injection escaped;
  - the 50,000 cap;
  - export audited;
  - 403 for limited admins and for Settings view.
  - A **1-million-row timing test** (`describe.skip` unless `PERF=1`) shows page 1 under 1 s.
- **Isolation and permissions:** `isolation.test.ts` and `permissions-matrix.test.ts` extended. Approval decisions are append-only: UPDATE and DELETE are refused.
- **Web component tests:** `approval-detail` (own request, excluded, irreversible confirm), `rule-sheet` (steps, disabled roles), `role-save-bar` (Send for approval wording), `audit-table` (unknown fields).
- **E2E:**
  - the inbox: Kunle requests a role change, Olumide approves in 2 clicks, and the role is changed;
  - reject with a comment;
  - an owner invitation waits, then is sent;
  - rules (add, edit, delete, read-only admin);
  - audit log (search, open, export);
  - axe at 375 px and 1280 px, in light and dark.

## 10. Seed (`apps/api/src/db/seed.ts`)
- **Ope Martins becomes an admin** (facility work moves to a second facility member), so the role-change rule has a second approver for the owner's hands-on review. Alternatively, Aisha Bello gets a second all-company admin seat (plan question 6).
- Default rules for Vento Homes Ltd.
- One pending request ("Site engineer: Projects approve added", by Ope, reason "Halima signs off site POs now") waiting for Olumide.
- One rejected request and one approved one, so *Decided* and *My requests* aren't empty.
- About 40 audit events across the last 7 days, spread over modules (written through `recordAudit`, never raw inserts), so the audit log reads like the board.

## 11. Build order
1. **Rebase on `main` after the admin console merges.** Done: migrations number from 0016; the decision is 0024 (the console took 0021); the journeys are J-ONB-12 and J-ONB-13 (the console reserved J-ONB-11).
2. Shared: catalog, schemas, matcher, copy, audit labels, role-rules change, contracts (types compile end to end with stubbed routers).
3. Schema, migrations, triggers and backfill; isolation test.
4. Engine, eligibility, registry and errors, with the engine test suite, using a test-only plug-in.
5. The three platform plug-ins, wired into roles, members and invitations; their tests; `members.remove` cancellation; the `roles.delete` guard.
6. The rules service and router, with tests; default rules on onboarding.
7. The audit read service, router and CSV, with tests.
8. `account.me` additions, the emails, and the `approvals expire` command.
9. Web: shell (nav, top bar, tabs, ⌘K), then the Approvals inbox, then the send sheet and waiting state on the role page and Team, then the Rules page, then the Audit log.
10. Seed, e2e and axe.
11. Docs (§12), the combined review (code + design), and the **security audit** (this brick touches permissions). Fix, then the PR.

## 12. Docs (same PR)
- Journeys J-EXE-02, J-ONB-12, J-ONB-13, J-ONB-06 and J-ONB-08 set to `built`.
- `SCREENS.md` statuses and `CHANGES.md` rows for the spec's departures.
- **`DOMAIN.md`:**
  - Approval rule, Approval request (adds `cancelled`), Approvable action;
  - `approve` permission, and the two-step access rule now includes approvers.
- Help articles in `docs/help/`: approve or reject, set approval rules, read the audit log.
- `CHANGELOG.md`.
- `RUNBOOK.md`: the daily `approvals expire` schedule.
- The `review-checklist` skill gains one line: "a sensitive action calls `requestOrRun`, never its executor directly".
- The `add-module` skill gains the plug-in recipe.

## 13. Risks
- **R1. Execution as someone else.** The action runs when the checker approves, but it is the maker's change.
  - *Mitigation:* `execute` gets an `ExecuteContext` with the maker as actor, re-loaded live (still active, still has the permission). If the maker lost the permission meanwhile, the request expires as stale.
  - Plan question 3 confirms that the maker's permissions are checked again.
- **R2. A module forgets the engine** and calls its write path directly.
  - *Mitigation:* plug-in `execute` functions are the only exported writers for guarded actions, and the catalog-walk test.
  - The review checklist gains the line in §12, and the security audit checks it.
- **R3. Loopholes around the role rule.** Assigning a role to someone isn't guarded, and creating a role isn't either.
  - Both stay bounded by the 3c ceiling (nobody gives more than they have) and are audited.
  - Plan question 1 records it; the owner can ask for "Change someone's role" as a later rule.
- **R4. Merge with the admin console.** It changes core files (`router.ts`, `contract.ts`, the schema index, migrations, likely `middleware.ts` and `seed.ts`).
  - *Mitigation:* build only after it merges and cut from fresh `main`; generate migrations after the rebase, never before.
- **R5. Audit search at volume.** ILIKE over 1M rows is slow without a date bound.
  - *Mitigation:* a mandatory date range of at most 366 days, the existing org+date index, and the PERF test.
  - Trigram indexes later if real data needs them.
- **R6. Two-step change surprises Land & legal and PM holders.**
  - The 3d grace banner and 7-day window apply. CHANGELOG and a help line explain why.
- **R7. Email fan-out to many approvers.** Capped at 50 per step, and sent after commit so a mail failure never undoes a decision.

## 14. Plan questions (owner approved all recommendations, 26 Nov 2026)
Each has a recommendation.

1. **Role edits that need approval.** *Recommended:* **only edits to a role at least one person holds.** A role nobody holds changes nobody's access, so its edits (and creating roles) run at once. Assigning a role to someone stays instant (the 3c ceiling bounds it), as the spec left it. **Confirmed after the security audit (owner, 27 Nov 2026).**
2. **Owner invitations.** *Recommended:* **inviting someone as an owner goes through approval** (its own catalog action, covered by the "Make someone an owner" default rule). Otherwise the make-owner rule could be bypassed by inviting instead. The invitation is created and emailed only on approval.
3. **Whose change it is when it runs.** *Recommended:* **the maker's.** The audit entry's actor is the maker, with the approvers listed. The maker must still be an active member with the permission when the last approval lands; if not, the request expires as stale.
4. **Which rule changes email the other owners.** *Recommended:* **every create, edit and delete**, not just "loosening". A new company-specific rule can loosen an all-company one, so "looser" is hard to judge, and rule changes are rare.
5. **Two-step for approvers: how it lands.** *Recommended:* the migration marks **every role with Approve** (built-in Land & legal and Project manager, and any custom ones) as requiring two-step. Holders without it get the 3d banner and 7 days. No email.
6. **Seed for the hands-on review.** *Recommended:* **make Ope Martins an admin** in the demo data, so the role-change approval has a second approver, and add a second facility member for her old work.
7. **Expiry job.** *Recommended:* **no in-process scheduler.** Expiry is applied on every read and decision, plus a daily `approvals expire` command scheduled like `plans notify-trials`.
8. **Audit log date range.** *Recommended:* **always bounded:** the last 7 days by default, at most 1 year per search or export. That keeps the page fast without new indexes. Older entries are still reachable by moving the dates.
