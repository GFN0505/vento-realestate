# Plan: Team (brick 3b)

- **Status:** approved by the owner on 26 Nov 2026 (all recommendations, incl. section 15 questions 1–7), plus: real emails may be sent during manual browser testing in development, through Postmark with an allow-list (13.3). Build after PR #4 merges (or stacked on it).
- **Spec:** [docs/specs/team.md](../specs/team.md) (draft)
- **Journeys:** J-ONB-02 (now the full screen flow), J-ONB-06 (new), J-ONB-01 step 7 (setup checklist)
- **Branch:** `brick/03b-team`, cut from `brick/03-feature-flags` (PR #4 merges first)
- **Two pull requests:** **PR A "3b Team"** (sections 1–12) and **PR B "3b Email delivery"** (section 13). PR A carries every migration, so PR B is code and configuration only.
- **Written by:** the architect agent on 26 Nov 2026, against the code on `brick/03b-team` (oRPC 1.16.5, Better Auth 1.7.28, Hono 4.13, TanStack Router 1.170)

## Summary (plain English)
Olumide can now bring his team in himself. **Settings** appears in the sidebar, the user menu and More, but only for owners and admins. It opens straight onto **Team**: one list of everyone in the organization plus everyone who has been invited and hasn't answered yet. Each row shows the person's role, which companies (entities) they can see, whether two-step sign-in is on, and when they were last active.

- **Inviting:** **Invite people** opens a side sheet. He pastes up to 20 emails, picks one role, and presses **Send 5 invitations**. If some of those people are already in or already invited, nothing is sent, and every one of them is marked on its own row.
- **Changing a role:** pick it from the row's menu. It saves at once and the toast offers **Undo**.
- **Confirms:** removing someone, resetting their two-step and making someone an owner each ask first. Making someone an owner also emails every owner.
- **Limited admins:** an admin limited to one company only sees and manages people within that company.
- **Plan limits:** the server checks the plan's people limit in the same transaction. Only owners see plan wording ("8 of 10 people on your Starter plan"). Everyone else gets "ask the owner".
- **Setup checklist on Home:** owners and admins see *Finish setting up*. It ticks itself from real data, and **Invite your team** opens the same invite sheet over Home.

The second pull request makes emails actually arrive:

- Emails go out through Postmark from a dedicated mail subdomain, with tracking off.
- Staging can only email an allowed list of addresses.
- Tests can never reach Postmark: the API refuses to start if they try.
- A bounced or spam-flagged invitation shows **Email not delivered** on the Team page within minutes.

---

## 1. Summary (technical)
- **Two new procedure groups:**
  - `team.list` replaces the web's use of `members.list` and `invitations.list`. It is one paginated union of members and open invitations (or removed members). Every row carries server-computed `can` flags and a `readOnly` reason, and entity names are filtered to the viewer's own limit.
  - `checklist.get`, `checklist.hide` and `checklist.show` drive the Home card.
- **One rule source for "who may manage whom":** a new pure module, `apps/api/src/access/manage-rules.ts`, holds the rules. The members and invitations services throw its refusals, and `team.list` uses the same functions to compute the flags, so the UI and the server can't drift. It adds the **limited-granter rule** (open question 4).
- **Schema changes (PR A):**
  - `members`: `last_active_at`, `removed_by_user_id`, `checklist_hidden_at`, `checklist_completed_at`
  - `invitations`: `delivery` (new enum), `delivery_changed_at`, `delivery_message_id`
  - One generated migration plus one custom migration for the backfill.
- **The mailer returns a result:** `Mailer.send` and `sendAll` now return `SendResult`, so the router records an invitation's delivery state after commit. This is not audited: it's a delivery fact, not a change by a person. Dev and memory transports report `sent`, and the memory transport can simulate failures.
- **Smaller server rule changes:**
  - Conflict refusals carry every clashing email.
  - Resend is limited to once a minute per invitation, enforced in the database using `last_sent_at`.
  - Resending an owner-role invitation is owner-only.
  - Archived entities can't be granted.
  - A new security alert tells every owner when someone becomes an owner.
- **Web:**
  - A Settings layout with a section registry. The sub-navigation is drawn only when there are 2 or more sections.
  - The Team page: a plain semantic table on desktop and cards on phones.
  - Member, invitation and invite sheets. The invite sheet is a shell overlay, so Home, ⌘K and Team all open the same lazy chunk.
  - Confirms, an optimistic role change with Undo, and the Home checklist card.
- **PR B:**
  - A fetch-based `postmark` transport with no SDK.
  - An allow-list wrapper for staging.
  - Start-up guards, including a hard refusal in test, CI and e2e.
  - A Basic-auth bounce and complaint webhook at `POST /webhooks/postmark/bounce`.
  - Pruning of the dev mailbox.
  - Decision record 0017.
- **No new runtime dependencies in either PR.**

## 2. Domain model

```
Organization 1─* Member ──▶ User (identity: twoFactorEnabled, twoStepSetupRequired, passwordResetRequired)
                  │ role, entity limits, status active|removed
                  │ + lastActiveAt, removedByUserId, checklistHiddenAt, checklistCompletedAt
Organization 1─* Invitation ── role, entity limits, status, lastSentAt
                  │ + delivery, deliveryChangedAt, deliveryMessageId
```
- **Ownership:** everything here is organization-scoped. Nothing is entity-owned.
  - **Entity limits:** a limited viewer sees every member of the organization (people aren't entity-owned), but only the entity names inside their own limit.
  - **Managing:** a limited viewer can manage only rows whose access lies within their own (see the rules below).

**Two-step state** (derived, not stored; two-step belongs to the person, so it is the same in every organization)
```
twoFactorEnabled                                  → on              (emerald "On")
passwordResetRequired (after a reset by someone)  → reset_pending   (amber "Reset, waiting for new password")
role.requiresTwoStep or twoStepSetupRequired      → setup_required  (amber "Set up at next sign-in")
otherwise                                         → off             (slate "Off")
```
Lifecycle: `on ─reset by owner/admin─▶ reset_pending ─new password─▶ setup_required ─sets up─▶ on`.

**Invitation delivery** (separate from `status`; tracked only while the invitation is `pending`)
```
insert/resend ─▶ queued ─send accepted─▶ sent ─webhook hard bounce─▶ bounced
                   │                       └─webhook spam complaint─▶ complained
                   └─send refused / failed after 1 retry / skipped on staging─▶ failed
resend (any state) ─▶ queued (message id cleared)
```
- `queued` and `sent` show no badge. `failed`, `bounced` and `complained` show the rose **Email not delivered** badge, with their own line in the sheet.
- A `queued` row older than 10 minutes reads as `failed` in the list (the process died between commit and send). This is derived; no job is needed.
- Webhook marks apply only when the invitation is still `pending` **and** the event's MessageID equals `delivery_message_id`. A late bounce for an older send can't mark a fresh resend.

**Last active:** `members.last_active_at` is written at most once an hour per member. The write is a conditional UPDATE in `memberMiddleware` and `getMe`, using the value `loadMembership` already reads, so it adds no extra read. The web shows it by day in Lagos time.

**Setup checklist** (per viewer, derived; registry in `apps/api/src/modules/checklist/items.ts`)
```
item = { key, feature: FeatureKey | null, visibleTo(ctx), done(ctx), detail(ctx) }
visible items = registry where feature available ∧ visibleTo
card shown   = settings.create ∧ checklistHiddenAt is null
               ∧ ¬(all visible done ∧ checklistCompletedAt < start of today, Lagos)
checklistCompletedAt: set by checklist.get when it first sees all done; cleared when an open item reappears
```
Open question 11 is applied: once hidden, the card stays hidden even if later bricks add items, until ⌘K **Show setup checklist**.

**Manage rules** (`access/manage-rules.ts`; pure; the viewer is `{ userId, roleKey, permissions, entityIds }`)

| Action on a member | Refused when (first match wins) | Refusal |
|---|---|---|
| change access (`edit`) | target is self | FORBIDDEN `own_access` "You can't change your own access. Ask another owner or admin." |
| | target is an owner, or new role is owner, and viewer isn't an owner | FORBIDDEN `owner_only` (2a copy) |
| | **target's access is wider than the viewer's limit** (target "all", or any entity outside the viewer's limit) | FORBIDDEN `entity_limit` "Aisha Bello has access to entities you can't see. Ask Olumide Bankole (owner) to change it." **(new, open question 4)** |
| | demoting the last active owner | CONFLICT `last_owner` (2a) |
| reset two-step (`edit`) | self · owner by non-owner · wider access | as above |
| remove (`delete`) | self · owner by non-owner · wider access · last owner | as above |
| resend invitation (`create`) | invitation's access wider · **owner-role invitation by a non-owner (new)** · sent less than 60 s ago | `entity_limit` · `owner_only` · TOO_MANY_REQUESTS "We sent it less than a minute ago. Try again shortly." |
| withdraw invitation (`delete`) | invitation's access wider | `entity_limit` |

The permission check (`requirePermission`) always runs first. The list's `can` flags combine the permission with these rules. Reset two-step is also offered only when the target's two-step state is `on`.

**Invariants**
- At least one active owner per organization. This is already enforced by a deferred trigger (`0001_access_guards`) and the services' `last_owner` check.
- One pending invitation per (organization, email). This is already enforced by the partial unique index.
- `members.removed_by_user_id` is set only on removed rows: `check (removed_by_user_id is null or status = 'removed')`. Legacy removed rows may have no value.
- Entity grants must be active entities of this organization, within the granter's limit.
- Delivery marks never change `status`, never write an audit event, and never touch any other organization's row (looked up by primary key with a message-id match).

## 3. Database (PR A)

**Migration `0005_team` (generated)**

| Table | Change | Notes |
|---|---|---|
| `members` | `last_active_at timestamptz null` | Shown by day |
| `members` | `removed_by_user_id uuid null → users(id) on delete restrict` | check `removed_by_user_id is null or status = 'removed'`; index `(removed_by_user_id)` for the FK |
| `members` | `checklist_hidden_at timestamptz null`, `checklist_completed_at timestamptz null` | Per person per organization; "every device" |
| `invitations` | enum `invitation_delivery ('queued','sent','failed','bounced','complained')`; `delivery invitation_delivery not null default 'queued'`, `delivery_changed_at timestamptz null`, `delivery_message_id text null` | Webhook looks up by `id` (PK) from metadata, so no new index |

**Migration `0006_team_backfill` (`drizzle-kit generate --custom`)**
```sql
update invitations set delivery = 'sent', delivery_changed_at = last_sent_at;
update members m set last_active_at = s.at from (
  select user_id, active_organization_id as org, max(last_active_at) as at
  from sessions group by 1, 2) s
  where s.user_id = m.user_id and s.org = m.organization_id and m.status = 'active';
update members m set removed_by_user_id = (
  select a.actor_user_id from audit_events a
  where a.organization_id = m.organization_id and a.action = 'member.removed'
    and a.target_type = 'member' and a.target_id = m.id
  order by a.created_at desc limit 1)
where m.status = 'removed';
```

**Indexes for `team.list`**
- The existing indexes cover it: `members_org_status_idx`, `members_org_role_idx`, `invitations_org_status_idx`.
- Search is `ILIKE` within one organization's team (hundreds of rows at most), so there is no trigram index. Run `EXPLAIN ANALYZE` on the union query with the seed, and revisit if a team ever passes about 2,000 rows.

**Migration safety**
- The changes are additive: nullable columns, plus one NOT NULL column with a constant default (a metadata-only change on Postgres 18).
- The backfill touches small tables and runs once.
- Old code ignores the new columns, so old and new code can run side by side.
- Nothing is dropped. `members.list` and `invitations.list` leave the contract in PR A (section 4), which needs no schema change.

## 4. Contract (`packages/shared`, all procedures on `platform`, no feature flag)

**New `src/team/schema.ts`** (sketch)
```ts
export const teamShow = z.enum(['everyone', 'invited', 'removed'])
export const listTeamInput = paginationInput.extend({
  q: z.string().trim().max(100).optional(),
  roleId: id.optional(),
  show: teamShow.default('everyone'),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
}).strict()

export const entityAccess = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('all') }),
  // Only entities inside the viewer's limit; hiddenCount drives "and 1 other".
  z.object({ kind: z.literal('some'), entities: z.array(entityRef), hiddenCount: z.number().int().min(0) }),
])
export const twoStepState = z.enum(['on', 'off', 'setup_required', 'reset_pending'])
export const invitationDelivery = z.enum(['queued', 'sent', 'failed', 'bounced', 'complained'])
export const readOnly = z.object({ reason: z.enum(['self', 'owner', 'wider_access']), message: z.string() }).nullable()

const memberRow = z.object({ kind: z.literal('member'), id, userId: id, name, email, isYou: z.boolean(),
  role: roleRef, access: entityAccess, twoStep: twoStepState, joinedAt: datetime, lastActiveAt: datetime.nullable(),
  can: z.object({ changeAccess: z.boolean(), resetTwoStep: z.boolean(), remove: z.boolean() }), readOnly })
const invitationRow = z.object({ kind: z.literal('invitation'), id, email, role: roleRef, access: entityAccess,
  status: z.enum(['pending', 'expired']), invitedByName, lastSentAt, expiresAt,
  delivery: invitationDelivery, deliveryChangedAt: datetime.nullable(),
  can: z.object({ resend: z.boolean(), withdraw: z.boolean() }), readOnly })
const removedRow = z.object({ kind: z.literal('removed'), id, userId: id, name, email, role: roleRef,
  removedAt: datetime, removedByName: z.string().nullable() })
export const teamRow = z.discriminatedUnion('kind', [memberRow, invitationRow, removedRow])
export const listTeamOutput = paginated(teamRow).extend({
  counts: z.object({ members: int, invited: int, removed: int }), // organization-wide, for the context line and chips
})

export const checklistItemKey = z.enum(['organization', 'first_entity', 'two_step', 'invite_team'])
export const checklist = z.object({
  shown: z.boolean(), hidden: z.boolean(),
  items: z.array(z.object({ key: checklistItemKey, done: z.boolean(), detail: z.string().nullable() })),
  allDone: z.boolean(),
})
```

**`src/team/contract.ts`**
```ts
export const teamContract = { list: platform.input(listTeamInput).output(listTeamOutput) }
export const checklistContract = {
  get: platform.output(checklist),
  hide: platform.output(notice),   // not audited (no data changes)
  show: platform.output(notice),
}
```
Register both in `src/contract.ts`.

**Changed**

| Procedure | Change |
|---|---|
| `members.updateAccess` | Output becomes `notice.extend({ row: memberRow })`, so the web replaces the row in place. Undo calls it again with the previous `roleId` and `entityIds`. |
| `invitations.create` | Output adds `invitations: z.array(invitationRow)` (pins the new rows; see section 15, question 1). Refusals below. |
| `members.list`, `invitations.list` | **Removed** from the contract. They return unfiltered entity names, and the web never used them. Their permission-matrix and isolation cases move to `team.list`. If the owner prefers to keep them, they must get the same name filtering. |
| Error map `CONFLICT.data` | Adds `alreadyMembers: z.array(z.string()).optional()` and `alreadyInvited: z.array(z.object({ email, id })).optional()`. `reason` is `already_member` when any member clashes, else `already_invited`. The message is "3 of these people are already in or invited. Nothing was sent." |
| `conflictReason` | Adds `entity_unavailable`: an archived entity of this organization, "One of the entities you chose is no longer available. Choose again." An unknown or other-organization id stays NOT_FOUND, and the web shows the same copy and refetches entities and roles. |
| `TOO_MANY_REQUESTS` | Reused for the resend limit, with `retryAfterSeconds`. |
| `AUDIT_ACTIONS` | No new actions. |
| `EmailTag` (API) | No new tag: the new-owner alert is `security_alert`. |

**Errors per procedure**

| Procedure | Errors |
|---|---|
| `team.list` | FORBIDDEN `permission`; tab guard CONFLICT; a `roleId` from another organization gives an empty list, never an error (it's a filter, like decision 0014) |
| `checklist.get/hide/show` | FORBIDDEN `permission` |
| `invitations.create` | CONFLICT `already_member`/`already_invited` (full lists), `entity_unavailable`; FORBIDDEN `owner_only`, `entity_limit`, `plan_limit`; NOT_FOUND (role or entity not visible) |
| `invitations.resend` | NOT_FOUND; CONFLICT `invitation_not_pending`/`invitation_withdrawn`; FORBIDDEN `entity_limit`, `owner_only`, `plan_limit` (expired); TOO_MANY_REQUESTS |
| `invitations.withdraw` | NOT_FOUND; CONFLICT not pending; FORBIDDEN `entity_limit` |
| `members.updateAccess` | NOT_FOUND (removed meanwhile); FORBIDDEN `own_access`, `owner_only`, `entity_limit`; CONFLICT `last_owner`, `entity_unavailable` |
| `members.remove`, `members.resetTwoStep` | NOT_FOUND; FORBIDDEN `own_access`, `owner_only`, `entity_limit`; CONFLICT `last_owner` (remove) |

**`team.list` query** (`team.service.ts`)
- **Everyone:** `UNION ALL` of active members and invitations with `status='pending'`, keeping expired-but-pending ones (shown as expired). Order: **open invitations first, by `last_sent_at desc`, then members by `lower(name), id`** (see section 15, question 1).
- **Invited:** invitations only, ordered by `last_sent_at desc`.
- **Removed:** `distinct on (user_id)` over removed members, latest first. It excludes users who are active members again.
- **Filters:** `q` is `ILIKE` on name or email, with `%`/`_` escaped. `roleId` is equality.
- **Queries per page:** one page query, plus three counts in one statement, plus one batched entity-limits query (`inArray` over the page's member and invitation ids), plus the viewer's owner name. The owner name is computed only when any `readOnly` needs "Ask … (owner)", via `firstOwner`.
- **Speed:** no N+1. Target p95 is under 200 ms, and a 50-row page is about 20 KB.

## 5. Permissions

| Procedure | Module × action | Default roles | Extra limits |
|---|---|---|---|
| `team.list` | settings `view` | owner, admin | Names filtered to the viewer's entity limit; flags from manage rules |
| `checklist.get` / `hide` / `show` | settings `create` | owner, admin | Counts only the active organization's rows |
| `invitations.create` | settings `create` | owner, admin | Owner role only by owners; entities within the granter's limit, active |
| `invitations.resend` | settings `create` | owner, admin | **New:** within the granter's access; owner-role invitations by owners only; once a minute |
| `invitations.withdraw` | settings `delete` | owner, admin | **New:** within the granter's access |
| `members.updateAccess` | settings `edit` | owner, admin | Not self; owners by owners; **within access (new)**; last owner kept |
| `members.resetTwoStep` | settings `edit` | owner, admin | Not self; owners by owners; **within access (new)** |
| `members.remove` | settings `delete` | owner, admin | Not self; owners by owners; **within access (new)**; last owner kept |
| `POST /webhooks/postmark/bounce` (PR B) | none (Basic auth with a secret) | Postmark | Writes delivery columns only |

All procedures are built on `member`, so two-step is required for owner and admin, and the tab guard (decision 0013) and the feature gate (`platform`, never gated) apply. No new entries go on `PUBLIC_PROCEDURES` or `PERSONAL_PROCEDURES`.

## 6. Email changes in PR A (transport-agnostic)

**`apps/api/src/email/mailer.ts`**
```ts
export type EmailMessage = { to; subject; html; text; tag;
  fromName?: string                        // "Vento Homes Ltd via Vento"
  replyTo?: { name: string; email: string } // the inviter
  metadata?: { invitationId: string } }    // ids only, never personal data
export type SendResult =
  | { status: 'sent'; messageId: string }
  | { status: 'skipped' }                                       // staging allow-list (PR B)
  | { status: 'failed'; kind: 'inactive' | 'rejected' | 'transient' | 'config'; code?: number }
export type Mailer = { send(m): Promise<SendResult>; sendBatch(ms): Promise<SendResult[]> }
export async function sendAll(mailer, messages): Promise<SendResult[]>   // never throws; logs tag + kind + code only
```
- **Transports:** `dev` and `memory` return `{ status: 'sent', messageId: 'dev-<uuid>' }`. Memory adds `failNext(kind)` for tests.
- **Callers:** existing callers (`auth/hooks/deps.ts`, `notify-trials.ts`, routers) ignore the result unchanged.
- **Invitations:** a new helper `deliverInvitations(context, messages)` in `modules/invitations/delivery.ts` runs `sendAll`, then `recordDelivery(db, organizationId, invitationId, result)`:
  - `sent` sets `delivery='sent'` and `delivery_message_id`.
  - `failed` or `skipped` sets `delivery='failed'`.
  - The update is `where organization_id = ctx.org and id = ? and status = 'pending'`, it is not audited, and it runs after commit. A failure here is logged and never fails the request.
- **Sender details:** the invitation message sets `fromName` to `${organizationName} via Vento` (sanitized: strip `"`, `\`, CR/LF, control characters; truncate to 60), `replyTo` to the inviter, and `metadata.invitationId`.
- **New template:** `newOwnerAlert` in `email/templates/security-alert.ts` (spec copy). `updateMemberAccess` returns one message per active owner, including the new one, when the role changes to owner. Recommended: `joinOrganization` does the same when an owner-role invitation is accepted (section 15, question 3).

## 7. Settings, Team and checklist UI (apps/web)

**Designs:**
- Team list: [RolesSettings](../design/claude-design/RolesSettings.dc.html) (users tab).
- Settings layout: SetOrg, DSAdditions (settings nav) and SettingsMobile.
- Checklist: Onboarding (checklist) and DSAdditions (ChecklistRow).
- The invite sheet and the member and invitation sheets have **no design** (status `pattern`). SCREENS.md already has the three new rows; the departures listed in the spec go into `docs/design/CHANGES.md` when built.

**Routes**

| Route | What |
|---|---|
| `routes/_app/_shell/settings.tsx` | Becomes the layout. It keeps `moduleGuard('settings')` (403 for others, before any data) and renders `<SettingsLayout>` with `<Outlet/>`. |
| `routes/_app/_shell/settings/index.tsx` | `beforeLoad` redirects to the first visible section (2+ sections on phones: the SettingsMobile list) |
| `routes/_app/_shell/settings/team.tsx` | `validateSearch` (`q`, `role`, `show`, `page`); loader `ensureQueryData(team.list)`; `placeholderData: keepPreviousData` |

**Shell**
- In `features/shell/nav.ts`, the `settings` entry gets `built: true`. It is still `module: 'settings'`, so it is visible only with settings `view` and hidden in Preview for roles without it.
- New `features/settings/sections.ts` registry: `{ key, label, to, can(access) }`. In 3b it holds only `team`.
- `visibleSections(access)` decides the layout: with 1 section there is no sub-navigation; with 2 or more, `SettingsNav` (left column at `lg`) or the SettingsMobile list on phones. The content column keeps the same max width either way, so 3c doesn't shift it.

**Team page** (`features/team/`)
- **Context line.**
  - Default: "8 people · 3 invited" from `counts`.
  - Owners with a `me.plan` people limit: "8 of 10 people on your Starter plan", plus **Talk to Vento** at the limit (`TalkToVentoButton`).
  - The line reserves its height while loading.
- **Toolbar.**
  - Search, debounced 300 ms; `/` focuses it.
  - Role filter (`Select`, roles from the cached `roles.list`).
  - Chips: Everyone · Invited · Removed.
  - The state is held in the URL and remembered per device under `vento.team.filters.<orgId>` (`lib/storage.ts`).
- **Desktop.** A semantic `<table>`, not TanStack Table: there is no sorting, column picker or virtualization, at most 50 rows, and the plain table keeps the route chunk small. The shared `DataTable` arrives with the first module list page.
  - Columns per spec.
  - **RoleMenu** appears in place only when `can.changeAccess`.
  - The ⋯ menu uses `LazyMenu` (`components/ui/lazy-menu.tsx`) and shows only the actions whose `can` is true. A row with no actions has no menu.
- **Phones (<768 px).**
  - Rows become cards (avatar, name, role · access, badge).
  - A tap opens the sheet full height, and actions live in the sheet.
  - The sticky **Invite people** button sits above the tabs and the home indicator.
- **Badges.** `StatusBadge` tones per spec. "Last active" comes from `lastActiveLabel()`: Today / Yesterday / n days ago / `formatDate`, in Lagos time.
  - Access shows as "All entities", one name, or "2 entities" with a tooltip, plus "and 1 other".
- **Member sheet** (`Sheet`).
  - Facts first.
  - **Access** form (react-hook-form with zod from shared): role select with the two-step note, entity access radio (`RadioGroup`) with a tick list (`Checkbox`) from `entities.list` (already scoped to the viewer). The two-step note comes from `roles.list` `requiresTwoStep`.
  - **Save changes** stays disabled until something differs.
  - Quiet **Reset two-step** and rose **Remove** at the bottom.
  - A `readOnly.message` line replaces the form when the row is read-only.
- **Invitation sheet.** Facts plus the delivery line ("The address bounced. Check it and invite again." / "The person marked it as spam." / "We couldn't send this email. Try Resend."), then **Resend** (primary) and **Withdraw**.
- **Confirms.** A new reusable `components/confirm-dialog.tsx` (Dialog) serves make owner, remove and reset two-step, with the spec's copy.
- **Role change with Undo** (`use-change-role.ts`).
  - Optimistic `setQueryData` on the current page key, then the mutation.
  - The toast reads "Aisha Bello is now Finance" with an **Undo** action for 8 s. Undo re-calls `updateAccess` with the previous role and `entityIds`.
  - On error the row rolls back and the toast shows the server message.
  - Offline (`connection` store): no optimistic change; the 3a offline message.
  - Choosing **Owner** opens the confirm first, and then there is no Undo.
- **Stale rows.** NOT_FOUND on a row action shows "{name} is no longer a member. The list is up to date." (or the invitation equivalent) and invalidates `team.list`.
- **States.**
  - Loading: skeleton in the final layout.
  - Owner alone: the owner's row plus an `EmptyState` panel.
  - Filtered empty: **Clear filters**.
  - Invited or Removed empty: the spec's lines.
  - Error: `ErrorState` with **Try again**.
  - Offline: the banner.
- **Keyboard.** Rows are focusable, Enter opens the sheet, Esc closes it and focus returns to the row. `i` and `/` are page-scoped entries in `features/shell/shortcuts.ts` (new optional `route: '/settings/team'`), listed under `?`.

**Invite people sheet** (`features/team/invite/`, a lazy chunk mounted once in the shell as overlay `invite` in `shell-ui.ts`)
- **Email parsing.** `parseEmails(text)` is pure and unit-tested. It handles commas, spaces, new lines and tabs (Excel columns), and `Name <addr>` lists. It lowercases and trims, dedupes ("Removed 1 duplicate"), caps at 20 (the rest stays in the box with the spec's line), and adds typo hints through `lib/email-typo.ts` (`suggestEmail`).
- **Keys.** Enter adds a row, Enter on an empty box sends, Backspace on an empty box removes the last row.
- **Rows.** Each row has its own role menu, defaulting to the batch role.
  - Problems show on the row: "Check this email", "Did you mean…", "That's you" (checked against `me.user.email`).
  - After a CONFLICT, `alreadyMembers` and `alreadyInvited` mark the rows. **Resend instead** calls `invitations.resend(id)` and removes the row.
- **Role for everyone.** No preset. **Owner** is listed only when `me.member.role.key === 'owner'`. Under the menu: "Can approve: …" from `role.canApprove` and `MODULE_LABELS`, plus the two-step note.
- **Entity access.**
  - Unlimited granter: All / Only some.
  - Limited granter: only their entities, all ticked, and "All entities" isn't offered.
  - Granter limited to one entity: fixed text.
- **Plan places** (owners only, from `me.plan`).
  - `placesLeft = included − used`. If rows exceed it, the spec's sentence and **Talk to Vento** appear, and Send is disabled.
  - Non-owners rely on the server; `PlanLimitMessage` shows above Send, and the rows stay.
- **Send** names the count, shows a pending state and can't double-submit.
  - On success: toast, invalidate `team.list`, `account.me` (plan usage) and `checklist.get`, then close.
  - The typed state lives in the overlay store, so it survives the session-expired dialog and a failed request.
  - At 375 px, Send sits in a sticky footer with `env(keyboard-inset-height)` and a `visualViewport` fallback, so it stays above the keyboard.

**Home checklist** (`features/checklist/setup-checklist.tsx`, small and static in the Home chunk)
- **Visibility.** Rendered only when the effective access has settings `create`, so it is hidden in Preview. It sits under the hero and above the numbers, and it ignores `?entity=` (it is organization-wide).
- **Card.** "Finish setting up", "3 of 4 done", and a thin progress bar in the action colour. Rows use the ChecklistRow pattern.
  - **Invite people** calls `shellUi.open('invite')`.
  - The ⋯ menu has **Hide checklist**: toast "Checklist hidden" with **Undo** (calls `checklist.show`).
- **All done.** The spec line plus **Hide checklist**. The server stops sending `shown` from the next Lagos day.

**⌘K** (`command-results.tsx`, each item gated on effective access)
- *Actions:* **Invite people** (settings create) and **Show setup checklist** (settings create, and only when the cached checklist says `hidden`).
- *Go to:* **Team**, from the sections registry.

**Bundle**
- The Team route chunk must stay at or under 80 KB. The invite sheet is its own chunk, preloaded on hover or focus of any **Invite people** button.
- Home's first load grows only by the checklist card (about 2 KB).
- Report the chunk sizes from `pnpm --filter web build` before and after.

## 8. Files (PR A)

**packages/shared**
- `src/team/schema.ts`: team rows, list input/output, checklist schemas (new)
- `src/team/contract.ts`: `teamContract`, `checklistContract` (new)
- `src/team/schema.test.ts`: input defaults, discriminated rows, `q` trimming (new)
- `src/contract.ts`: register `team` and `checklist`
- `src/access/contract.ts`: drop `members.list` and `invitations.list`; change the `updateAccess` and `invitations.create` outputs
- `src/access/schema.ts`: export `entityRef`; remove the list inputs
- `src/common/errors.ts`: CONFLICT data fields, `entity_unavailable`
- `src/index.ts`: export team

**apps/api**
- `src/db/schema/access.ts`: new member and invitation columns, `invitation_delivery` enum, check
- `drizzle/0005_team.sql`, `drizzle/0006_team_backfill.sql` and meta (generated, then custom)
- `src/access/manage-rules.ts`: pure rules returning refusals; `canManageMember`, `canManageInvitation`, `withinGranterAccess` (new)
- `src/access/manage-rules.test.ts`: exhaustive table of viewer × target × action (new)
- `src/access/context.ts`: `loadMembership` selects `last_active_at`; `touchMemberActivity()`
- `src/access/middleware.ts`: call `touchMemberActivity` after the two-step check
- `src/auth/policy.ts`: `MEMBER_ACTIVITY_WRITE_INTERVAL_MS = HOUR`, `INVITATION_RESEND_INTERVAL_MS = MINUTE`
- `src/modules/account/account.service.ts`: `getMe` touches activity
- `src/modules/team/team.service.ts`: `listTeam` (union, counts, entity filtering, flags) (new)
- `src/modules/team/team.router.ts`: `list` with `requirePermission('settings','view','see the team')` (new)
- `src/modules/team/team.service.test.ts` (new)
- `src/modules/checklist/items.ts`: item registry (new)
- `src/modules/checklist/checklist.service.ts`: `get`, `hide`, `show` (new)
- `src/modules/checklist/checklist.router.ts`: `requirePermission('settings','create','finish setting up')` (new)
- `src/modules/checklist/checklist.service.test.ts` (new)
- `src/modules/members/members.service.ts`:
  - use manage rules
  - set `removed_by_user_id`
  - active-entity check in `assertGrantableEntities` (`entity_unavailable`)
  - return the row and the owner-alert emails
  - drop `listMembers` (keep `queryMembers` as the row loader, or move it to team)
- `src/modules/members/members.router.ts`: send owner alerts after commit; drop `list`
- `src/modules/invitations/invitations.service.ts`:
  - collect all conflicts
  - resend interval, owner-role resend, within-access checks
  - `delivery='queued'` on insert and resend
  - metadata, `fromName` and `replyTo` on messages
  - return created rows
  - drop `listInvitations`
- `src/modules/invitations/delivery.ts`: `deliverInvitations`, `recordDelivery` (new)
- `src/modules/invitations/invitations.router.ts`: use `deliverInvitations`; drop `list`
- `src/email/mailer.ts`: `SendResult`, `sendBatch`, the new message fields; `sendAll` returns results
- `src/email/transports/dev.ts`, `memory.ts`: return results; memory `failNext`
- `src/email/templates/security-alert.ts`: `newOwnerAlert`
- `src/email/templates/templates.test.ts`: new-owner alert copy
- `src/router.ts`: register `team`, `checklist`
- `src/test/factories.ts`: `createMember(..., { lastActiveAt, twoStep })`, `createInvitation(..., { delivery, lastSentAt, entityIds })`, `removeMember` helper
- `src/test/isolation.test.ts`, `permissions-matrix.test.ts`: new and changed procedures
- `src/db/seed.ts`: a removed member, an expired and a bounced invitation, last-active spread across days, a Parkview-limited admin in Vento Homes

**apps/web**
- `src/routes/_app/_shell/settings.tsx`: layout plus guard
- `src/routes/_app/_shell/settings/index.tsx`, `settings/team.tsx` (new)
- `src/features/settings/sections.ts`, `sections.test.ts`, `settings-layout.tsx`, `settings-nav.tsx`, `settings-mobile-list.tsx` (new)
- `src/features/shell/nav.ts`: settings `built: true`
- `src/features/shell/nav.test.ts`: Settings visible to owner and admin only, hidden in Preview
- `src/features/shell/shell-ui.ts`: `invite` overlay with prefill payload (emails, roleId)
- `src/features/shell/command-results.tsx`: Invite people, Show setup checklist, Team
- `src/features/shell/shortcuts.ts`: page-scoped `i` and `/`
- `src/features/shell/home-page.tsx`: render `SetupChecklist`
- `src/features/team/team-page.tsx`, `team-search.ts`, `team-queries.ts`, `team-context-line.tsx`, `team-toolbar.tsx`, `team-table.tsx`, `team-cards.tsx`, `row-menu.tsx` (lazy), `role-menu.tsx` (lazy), `member-sheet.tsx`, `invitation-sheet.tsx`, `removed-row.tsx`, `badges.tsx`, `last-active.ts` with test, `use-change-role.ts` with test, `team-confirms.tsx`, `read-only-line.tsx` (new)
- `src/features/team/invite/invite-sheet.tsx`, `parse-emails.ts` with test, `invite-rows.tsx`, `role-for-everyone.tsx`, `entity-access-field.tsx`, `plan-places.ts` with test, `use-invite-draft.ts` (new)
- `src/features/checklist/setup-checklist.tsx`, `setup-checklist.test.tsx`, `checklist-queries.ts` (new)
- `src/components/confirm-dialog.tsx` (new, shared)
- `src/lib/format.ts`: `relativeDayInLagos`
- `e2e/settings/invite-members.spec.ts`, `e2e/settings/manage-members.spec.ts`, `e2e/home/setup-checklist.spec.ts` (new)
- `e2e/support/fixtures.ts`: team fixtures (limited admin, Starter organization near the people limit)

## 9. Tests (PR A)

**Unit (pure)**
- `manage-rules.test.ts` covers every row of the rules table:
  - viewer role {owner, admin, view-only custom} × target {self, owner, admin, sales}
  - viewer limit {all, [Parkview], [Parkview, Lekki]} × target limit {all, [Parkview], [Lekki], [Parkview, Lekki]}
  - × action {change, reset, remove, resend, withdraw}
- `parse-emails.test.ts`: Excel column, Gmail `"A B" <a@b>` list, mixed separators, duplicates, 25 pasted (20 kept plus remainder), uppercase, junk tokens.
- `plan-places.test.ts`: places left, unlimited, internal, exact fit.
- `last-active.test.ts`: Lagos midnight boundaries (23:30 UTC).
- `sections.test.ts`: 1 section gives no sub-navigation and redirects to it; 2+ sections give the sub-navigation and the mobile list; a section the role can't view is absent.
- `templates.test.ts`: new-owner alert.

**Service (Vitest, real Postgres, `withRollback`)**
- `team.service.test.ts`:
  - Ordering: invitations first, then A–Z.
  - Each chip, `q` with `%`, and `roleId`.
  - Removed list excludes re-joined people and shows `removedByName`.
  - Expired-but-pending reads as `expired`; `queued` older than 10 minutes reads as `failed`.
  - A limited viewer sees `hiddenCount` and never the hidden names; check the response JSON for absent names.
  - `can` flags match the manage rules; `twoStep` derivation in all four states.
  - Counts are organization-wide.
  - Pagination totals, and the query count is constant per page (`counting-db.ts`).
- `invitations.service.test.ts`:
  - A batch with 2 members and 1 invited gives one CONFLICT with full lists, and nothing is inserted.
  - Resend within 60 s gives TOO_MANY_REQUESTS; after 60 s it succeeds.
  - Owner-role resend by an admin is refused; an out-of-access resend or withdraw is refused.
  - An archived entity gives `entity_unavailable`.
  - Rows are `queued`, then `sent` after `deliverInvitations` with the memory transport.
  - `failNext('transient')` gives `failed`; the invitation still exists and the audit row is still there.
- `members.service.test.ts`:
  - Within-access rule for change, reset and remove.
  - `removed_by_user_id` is set.
  - Promotion to owner emails every owner, including the new one.
  - Undo (second update) writes a second `member.access_changed`.
  - Concurrent mutual owner removal: two transactions, the second gets `last_owner`.
- `checklist.service.test.ts`:
  - Items done from data only.
  - Another organization's members and invitations don't tick "Invite your team".
  - `hide` and `show` round trip.
  - All done today is shown with `allDone`; the next Lagos day it isn't shown.
  - A reappearing open item clears `completedAt` but stays hidden once hidden.
  - Items for unavailable features are absent (registry test with a fake gated item).
- `access/context` test: `touchMemberActivity` writes once per hour, never on every request.
- **Limits:**
  - An owner and an admin each at 9/10 sending 2 get `plan_limit` with role-specific messages.
  - Two concurrent batches for the last place: one succeeds (extend `limits.concurrency.test.ts`).
  - An expired resend takes a place.

**Isolation** (`isolation.test.ts`)
- `team.list` with a foreign `roleId` returns an empty list and no foreign rows.
- `checklist.*` counts only its own organization.
- `invitations.resend` and `withdraw` with a foreign id, and `members.*` with foreign ids, return NOT_FOUND and change nothing (existing cases kept).
- `recordDelivery` with a foreign organization changes nothing.

**Permission matrix** (`permissions-matrix.test.ts`)
- Add `team.list` (view) and `checklist.get/hide/show` (create). Expected results are read from `defaultRoleAllows`, as today.
- Remove `members.list` and `invitations.list`.

**Procedure guard:** the walk covers the new procedures automatically. Confirm `team.list` and `checklist.*` refuse a mismatched tab before any query.

**Web component (Vitest + Testing Library)**
- `setup-checklist.test.tsx`: hidden for sales and in Preview; Invite opens the overlay.
- Invite sheet: rows from paste, row problems from a CONFLICT payload, Send count label, double-submit blocked.
- `use-change-role.test.ts`: optimistic update, rollback on error, Undo.

**e2e (Playwright, desktop and mobile)**
- **`invite-members.spec.ts` (J-ONB-02):**
  - Owner pastes 5 emails (Excel column), picks Sales, sends; 5 rows invited at the top; mails found in `.mail`.
  - A batch with an existing member and an invited email marks both rows; **Resend instead** works.
  - "That's you".
  - Owner at the Starter limit sees the places message and Send disabled; an admin there gets the server refusal and keeps the rows.
  - Invitee accepts through the 2a flow; the row becomes a member with "Last active today".
  - Mobile: 375 px, sticky Invite button, Send visible with the keyboard open.
  - axe pass on Team and the sheets.
- **`manage-members.spec.ts` (J-ONB-06):**
  - Role change in 2 clicks with toast and Undo.
  - Entity access change in the sheet.
  - Make owner confirm.
  - Reset two-step: confirm, badge, reset mail.
  - Remove: confirm, Removed chip, the removed user's next request refused.
  - Own row read-only.
  - Admin on an owner row: read-only.
  - Parkview-limited admin: "and 1 other", no menu.
  - Sales typing `/settings/team` gets the 403 with no team request (assert on the network log).
  - Preview as Sales: Settings gone.
  - Keyboard: `i`, `/`, Esc returns focus.
  - Organization switched in another tab: action refused, sheet content kept.
- **`setup-checklist.spec.ts`:** a new owner sees 3 of 4; Invite people opens over Home; after sending, 4 of 4; Hide, then ⌘K Show.

## 10. Build order (PR A)
1. **Shared contract and schemas** (backend lead, about half a day). This unblocks both tracks.
2. **In parallel:**
   - **Backend:** migration, then manage rules and their tests, then `team.list`, then checklist, then the invitation and member changes and the mailer result, then the isolation and matrix tests and the seed.
   - **Frontend:** first the settings layout and sections, nav and ⌘K entries against mocked data; then the Team page, the sheets, the invite sheet (`parseEmails` first), confirms and the checklist card.
3. **Integrate** against the real API with the seed. Then the **tester** writes the e2e journeys; the **reviewer** and **ui-designer** check (Excellence checklist, dark mode, 375 px); CHANGES.md entries; the owner's hands-on review.

PR B (section 13) can start as soon as step 1 merges, because it only depends on `SendResult` and the delivery columns.

## 11. Environment (PR A)
No new variables. `EMAIL_FROM` stays as is, and `.mail/` keeps working as today.

## 12. Docs to change (PR A; the implementer commits these)
- **`docs/DOMAIN.md`:** the spec's "Domain changes" (setup checklist; invitation delivery including `queued`; member last active; limited granter rule; resend once a minute; new-owner security alert). Also:
  - "Resending an owner invitation is for owners only."
  - "A removed person who rejoins leaves the *Removed* list."
- **`docs/ARCHITECTURE.md`:**
  - modules `team` and `checklist`
  - `access/manage-rules.ts` as the one rule source
  - `members.last_active_at` written hourly
  - `Mailer` returns `SendResult`; invitation delivery recorded after commit
- **`docs/specs/team.md`:** status "approved" once answered. Note the list order change and `members.list`/`invitations.list` removal if accepted.
- **`docs/specs/README.md`:** the team row status.
- **`docs/design/SCREENS.md`:** set the three Team rows and the layout row to `built` or `pattern` when done. Add the departures to `CHANGES.md`, plus "open invitations listed first".
- **`docs/journeys/01-onboarding-and-access.md`:** J-ONB-02 step 4 wording stays ("at the top"). Statuses become "built" when merged.
- **`.claude/skills/add-module/SKILL.md`:** one line saying a module adds its setup checklist item in `modules/checklist/items.ts` with its feature key.

---

## 13. PR B: 3b Email delivery (Postmark)

### 13.1 Transport (`apps/api/src/email/transports/postmark.ts`, fetch only, no SDK)
- **Endpoints:**
  - `send` posts to `https://api.postmarkapp.com/email`.
  - `sendBatch` posts to `/email/batch`; 20 invitations go in one call, and results are read per message.
  - Headers: `X-Postmark-Server-Token` and `Accept: application/json`.
  - `AbortSignal.timeout(10_000)`.
- **Body:**
  - `From` is `"{fromName ?? display name of EMAIL_FROM}" <address of EMAIL_FROM>`, with the name RFC 5322-quoted and sanitized.
  - `To`, `Subject`, `HtmlBody`, `TextBody`, `Tag`.
  - `ReplyTo` is `"{name}" <email>` when set.
  - `Metadata` is `{ invitationId }` only.
  - `MessageStream` is `POSTMARK_MESSAGE_STREAM` (default `outbound`, the default transactional stream).
  - **`TrackOpens: false`, `TrackLinks: 'None'`.** Links carry one-time tokens and must not be rewritten.
- **Outcomes:**
  - 200 with `ErrorCode 0`: `sent` with `MessageID`.
  - `ErrorCode 406` (inactive recipient): `failed/inactive`.
  - `300` or other 4xx/422 codes: `failed/rejected`.
  - 401 or `ErrorCode 10` (bad token): `failed/config`, logged at error level with "Postmark token rejected".
  - Network error, timeout, 429 or 5xx: **one retry after 1 s**, then `failed/transient`.
- **Logs:** `{ tag, stream, kind, code }` only. Never an address, subject, name or link.
- **Auth emails:** Better Auth emails (verify, reset, alerts) go through the same mailer. A suppressed address changes nothing in the reply to the person (no enumeration); the log notes "inactive recipient" by tag.

### 13.2 Staging allow-list (`apps/api/src/email/allow-list.ts`)
- A decorator, `withAllowList(inner, rules)`.
- `EMAIL_ALLOWED_RECIPIENTS` is comma-separated. An entry starting with `@`, or one without `@`, is a domain matched exactly on the address's domain; anything else is a full address.
- A message to a recipient outside the list is not sent and returns `skipped`. The log reads "Email skipped (not allowed on staging): invitation" (tag only). A skipped invitation shows **Email not delivered**.

### 13.3 Mailer factory and start-up guards (`email/mailer.ts`, `env.ts`)
- **New pure function** `emailConfigProblems(env, flags)` (unit-tested), called by `env.ts` before the API starts. Any problem prints the list and calls `process.exit(1)`.

| Situation | Rule |
|---|---|
| **Test, CI or e2e:** `NODE_ENV=test`, or `CI` set, or `VENTO_E2E=1` | **Refuse to start if `EMAIL_TRANSPORT=postmark` or any `POSTMARK_SERVER_TOKEN` is present:** "Postmark is never used in tests, CI or e2e. Use EMAIL_TRANSPORT=memory or dev." |
| `APP_ENV=staging` | Needs `EMAIL_TRANSPORT=postmark`, `POSTMARK_SERVER_TOKEN`, a real `EMAIL_FROM` (not `localhost`), `POSTMARK_WEBHOOK_SECRET` (32+ characters) and a non-empty `EMAIL_ALLOWED_RECIPIENTS` |
| `APP_ENV=production` | The same, but `EMAIL_ALLOWED_RECIPIENTS` must be **empty**, so production can never silently drop mail. Also `NODE_ENV=production`. |
| `APP_ENV=development` (default) | `dev` by default. **Owner's choice: manual testing in the browser may send real email**: `EMAIL_TRANSPORT=postmark` is allowed in development when `POSTMARK_SERVER_TOKEN` and a non-empty `EMAIL_ALLOWED_RECIPIENTS` are set (same allow-list rule as staging, so demo addresses like `@ventohomes.ng` and anyone not listed still go to `.mail/` instead of a real inbox). The test/CI/e2e guard above still wins: automated runs can never use Postmark. |
| `NODE_ENV=production` with `APP_ENV` unset | Refused ("Set APP_ENV to staging or production"). This replaces today's blanket refusal in `createMailer`. |

- **E2E marker:** `apps/web/playwright.config.ts` adds `VENTO_E2E: '1'` to `apiEnv`. `.github/workflows/ci.yml` already sets `CI` and `EMAIL_TRANSPORT: dev`. `src/test/setup-env.ts` keeps `memory`.
- **Guard test:** `email/config.test.ts` covers the matrix, including the case that Postmark plus `CI`, `NODE_ENV=test` or `VENTO_E2E` gives the exact message. Plus one subprocess test that runs `tsx src/env.ts` with `NODE_ENV=test EMAIL_TRANSPORT=postmark` and expects exit code 1 and the message.
- **Dev mailbox housekeeping (owner request):** the file mailbox (`.mail/`) is pruned at dev API start and in Playwright setup, keeping files from the last 7 days (and at most the newest 500), so it never grows unbounded. Small unit test.
- **Postmark's test token (`POSTMARK_API_TEST`):** used only by an opt-in script, `pnpm --filter @vento/api email:check` (`src/scripts/postmark-check.ts`, named `*.check.ts` so Vitest never includes it).
  - It runs only when `VENTO_EMAIL_INTEGRATION=1` is set **and** the token equals `POSTMARK_API_TEST`, and refuses any other token.
  - It posts one batch through the real transport and checks the response handling.
  - Never in `pnpm test`, never in CI.

### 13.4 Bounce and complaint webhook (`apps/api/src/webhooks/postmark.ts`, mounted in `app.ts`)
- **Route and limits:**
  - `POST /webhooks/postmark/bounce`: Hono, not oRPC, because the payload is Postmark's shape.
  - `bodyLimit` 64 KB.
  - Rate limit 300/min per IP through `rateLimiter`.
  - Mounted only when `EMAIL_TRANSPORT=postmark`; otherwise 404.
- **Authentication: Postmark does not sign webhooks.** There is no HMAC; its documentation recommends HTTP Basic auth and IP allowlisting. So:
  - The webhook URL embeds Basic credentials: user `postmark`, password `POSTMARK_WEBHOOK_SECRET`. HTTPS only.
  - The server compares the credentials in constant time with `crypto.timingSafeEqual` on equal-length SHA-256 digests. A mismatch gives 401 and a log line with no body.
  - Devops may also allowlist Postmark's published webhook IPs at the proxy (RUNBOOK).
  - The spec's "secret" maps onto this. If the owner wants a header token as well, Postmark supports custom webhook headers, and it is the same comparison.
- **Payload** is parsed with a lenient zod schema: `RecordType`, `Type`, `TypeCode`, `MessageID`, `Metadata`, `Tag`, `Inactive`, `BouncedAt`.
  - `RecordType=Bounce` with (`Type` in `HardBounce` or `BadEmailAddress`, or `Inactive=true`) means **bounced**.
  - `RecordType=SpamComplaint` means **complained**.
  - Anything else gives a count log by `RecordType`, `Type` and `Tag` only.
  - Confirm the exact field names against Postmark's current documentation at build.
- **Matching:** only payloads with a UUID `Metadata.invitationId` are matched:
  ```sql
  update invitations set delivery = $state, delivery_changed_at = now()
  where id = $invitationId and delivery_message_id = $MessageID and status = 'pending'
  ```
  - Idempotent: a retry sets the same value.
  - Unknown, stale or non-pending ids change nothing and still get 200, so Postmark stops retrying.
  - Invalid JSON gives 400.
  - No audit event, and no personal data in the logs.
- **NDPA:** the webhook body contains the bounced address. It is never logged or stored; only the state is stored.
- **Feature gating:** none. Team is a platform feature, and the delivery fact belongs to a row the organization already owns.

### 13.5 Dev mailbox pruning (`email/transports/prune.ts`)
- `pruneMailbox(dir, { maxAgeDays: 7, keepNewest: 500 })`, called from `createDevTransport` once at API start and from `apps/web/e2e/support/global-setup.ts` before the run (never during one, because specs read codes from it).
- Unit test against a temporary directory.

### 13.6 Environment (`.env.example`, values never in the repo)
```
# development | staging | production. Staging and production need Postmark; staging also needs the allow-list.
APP_ENV=development
# dev | memory | postmark. Postmark is refused in tests, CI and e2e, and in development.
EMAIL_TRANSPORT=dev
# Staging/production: "Vento Real Estate <no-reply@mail.{Vento domain}>"
EMAIL_FROM="Vento Real Estate <no-reply@localhost>"
# Postmark server API token (one per server: staging, production). From the secrets store only.
POSTMARK_SERVER_TOKEN=
# Default transactional stream
POSTMARK_MESSAGE_STREAM=outbound
# 32+ random characters; the Basic-auth password in the bounce webhook URL
POSTMARK_WEBHOOK_SECRET=
# Staging only: comma-separated domains (@ventohomes.ng) and addresses. Must be empty in production.
EMAIL_ALLOWED_RECIPIENTS=
```

### 13.7 Files (PR B)
- `apps/api/src/env.ts`: new variables; call `emailConfigProblems`
- `apps/api/src/email/config.ts`, `config.test.ts`: guards (new)
- `apps/api/src/email/mailer.ts`: factory picks the transport and wraps it in the allow-list on staging; drop the blanket production refusal
- `apps/api/src/email/transports/postmark.ts`, `postmark.test.ts`: fetch stubbed with `vi.fn`; body shape, tracking off, `From`/`ReplyTo` quoting, error mapping, single retry (new)
- `apps/api/src/email/allow-list.ts`, `allow-list.test.ts`: an outside address is skipped and not passed to the inner mailer (new)
- `apps/api/src/email/transports/prune.ts`, `prune.test.ts` (new)
- `apps/api/src/webhooks/postmark.ts`, `postmark.test.ts`: auth failure 401; hard bounce marks; stale message id ignored; complaint; duplicate idempotent; unknown id 200; other organizations untouched; no address in the captured logs (new)
- `apps/api/src/app.ts`: mount the webhook
- `apps/api/src/scripts/postmark-check.ts` and a `package.json` script `email:check` (new, opt-in)
- `apps/web/playwright.config.ts`: `VENTO_E2E: '1'`
- `apps/web/e2e/support/global-setup.ts`: prune `.mail`
- `apps/web/src/features/team/invitation-sheet.tsx`: delivery lines (if not already in PR A, they ship there)
- `.env.example`, `docs/RUNBOOK.md`, `docs/ARCHITECTURE.md` (Environment, Resilience), `docs/decisions/0017-…md`, `docs/decisions/README.md`

### 13.8 Tests (PR B)
- **Unit:** the files above.
- **API:** invitation sent through a stubbed Postmark gets `delivery='sent'` with the `MessageID` stored; the webhook then gives "bounced", and `team.list` shows it.
- **Manual on staging (owner):**
  - Invite an allowed address: inbox, not spam; DKIM, SPF (custom Return-Path) and DMARC pass.
  - Invite an outside address: skipped, row shows **Email not delivered**.
  - Postmark's bounce test address: the row is marked within 5 minutes.

### 13.9 RUNBOOK additions (devops)
- Postmark servers (staging, production), with tokens in the secrets store.
- Webhook URL `https://postmark:{secret}@{api host}/webhooks/postmark/bounce` on each server's default transactional stream (Bounce and Spam complaint).
- Optional IP allowlist at the proxy.
- `APP_ENV` per host; the staging allow-list.
- Restrict Postmark account access to two people with two-step on, because message content in Postmark's activity log contains live invitation and reset links.
- Set content retention to the shortest Postmark allows.
- The DPA is signed and Postmark is on the privacy notice before the first customer.

### Decision record 0017
```
# 0017 · Transactional email through Postmark, with delivery tracked on invitations

- **Date:** 2026-11-26
- **Status:** accepted

## Context
Invitations, verification codes, password resets and security alerts must reach Gmail and Outlook inboxes from staging and production. The app has had only console and in-memory transports, and production refused to start. Owners need to know when an invitation didn't arrive. Tests run constantly and must never email anyone. Postmark is a data processor in the United States (NDPA 2023).

## Decision
All email goes through the existing Mailer interface, which now returns a result per message. A fetch-based Postmark transport (no SDK) sends on the default transactional stream with open and link tracking off, from no-reply@mail.{Vento domain} (a subdomain used only for app email, DKIM and custom Return-Path, DMARC). Invitations use the display name "{Organization} via Vento" and the inviter as Reply-To. APP_ENV (development, staging, production) decides the rules: staging and production require Postmark; staging wraps it in an allow-list of domains and addresses; tests, CI and e2e refuse Postmark at startup. Invitations store a delivery state (queued, sent, failed, bounced, complained) and Postmark's message id. A bounce and spam-complaint webhook, authenticated with HTTP Basic credentials compared in constant time (Postmark does not sign webhooks), marks only pending invitations whose message id matches. Delivery marks are facts, not audit events. Other bounces are counted in logs by tag only. Logs never contain addresses or links.

## Consequences
- Email reputation is separate from staff mailboxes; per-customer sending domains would need per-customer DNS and are out of scope.
- One more processor under the NDPA: DPA, privacy notice and cross-border transfer basis before launch; Postmark's activity log holds live one-time links, so its account access and retention are restricted.
- Swapping provider is one new transport plus the webhook adapter.
- A send failure never undoes a change; people resend.
- Webhook authenticity rests on a shared secret over HTTPS (optionally plus an IP allowlist), not a signature.

## Alternatives considered
- Resend or Amazon SES: SES needs more setup and reputation work; Resend was the other candidate, and Postmark was chosen in the app-shell owner's decisions for transactional deliverability.
- The Postmark SDK: adds a dependency for two HTTP calls.
- Sending from each developer's own domain: per-customer DNS and verification; not needed for transactional mail.
- Tracking every bounce on every email type: more schema for no user-facing benefit now; invitations are the only email a person waits on someone else for.
- A sandbox flag instead of an allow-list on staging: Postmark sandbox servers deliver nothing, so staging couldn't be tested end to end.
```

---

## 14. Docs to change (PR B)
- **`docs/ARCHITECTURE.md`:** replace "Until an email provider is added, the API refuses to start with NODE_ENV=production" with the APP_ENV rules; add the webhook route under the request flow and Resilience (one retry, 10 s timeout).
- **`docs/RUNBOOK.md`:** section 13.9.
- **`docs/decisions/0017-…md`** and the README table row.
- **`.env.example`:** section 13.6.
- **`docs/journeys/01-onboarding-and-access.md`:** J-ONB-02 status "built" once both PRs merge.

## 15. Risks and open questions

**Owner questions that change the build** (defaults in bold)
1. **List order (a spec inconsistency).** The spec says the list is "sorted by name (invitations by email)" and also that new invitations "appear at the top of the list". **Recommended: open invitations first (newest sent first), then members A–Z.** It makes "who I've asked" a glance and needs no client-side tricks. The alternative is strict A–Z with the new rows pinned on the web until the next load, which is what the `invitations` array in the `create` output exists for (drop it if you choose this order).
2. **Open question 4, limited admins.** **Yes.** If no, remove `withinGranterAccess` from the manage rules. Names stay filtered either way.
3. **Open question 5, new-owner alert.** **Yes, and also when someone accepts an owner invitation** (otherwise an owner could be added without any alert). If you prefer, only on role change.
4. **Resending an owner-role invitation is for owners only** (new; it re-issues an owner grant). **Yes.**
5. **A skipped email on staging shows "Email not delivered"** on the row. **Yes** (it's true for the tester).
6. **Retire `members.list` and `invitations.list`** from the API (unused by the web, and they would show entity names outside a limited admin's access). **Yes.**
7. **Sending domain (open question 7):** needed before PR B can be tried on staging, not before PR A.

**Risks**
- **No webhook signature.** A leaked secret lets someone mark invitations undelivered (a cosmetic, low-impact change, and only on pending invitations with a matching message id). Mitigation: rotate the secret, optional IP allowlist.
- **Live links in Postmark's activity log.** Invitation (7 days) and reset (30 minutes) links are readable by anyone with Postmark dashboard access. Mitigation: restrict access, two-step on Postmark, short retention.
- **Send latency in the request.** A batch of 20 is one Postmark call (about 300 ms; worst case 10 s timeout plus one retry). Acceptable now; move sending to a job queue when bulk messaging arrives.
- **Process dies between commit and send.** The row reads `failed` after 10 minutes, so the person can resend. No outbox table yet; revisit with the jobs infrastructure.
- **Reply-To exposes the inviter's work email to the invitee.** This is intended (it's a colleague); listed so the owner knows.
- **Display-name injection.** Organization names are already validated for hidden characters, and the transport also strips quotes and line breaks.
- **In-memory rate limiter** on the webhook (one API instance). The resend limit is in the database, so it holds across instances.
- **`last_active_at` write.** At most one UPDATE per member per hour, after the tab guard. The procedure-guard "no query before refusal" tests are unaffected, but `counting-db` expectations for `me` may need adjusting.
- **NDPA.** The DPA, the privacy notice entry (purpose, United States), and the transfer basis confirmed by counsel must be done before the first customer. No buyer data goes through Postmark in this brick.

Sources:
- [Postmark webhooks overview (security: Basic auth, no HMAC)](https://postmarkapp.com/developer/webhooks/webhooks-overview)
- [Postmark Email API (TrackLinks, Metadata, MessageStream, ErrorCode 406)](https://postmarkapp.com/developer/api/email-api)
- [Postmark bounce webhook](https://postmarkapp.com/developer/webhooks/bounce-webhook)
- [Hookdeck guide to Postmark webhooks (custom headers, Basic auth)](https://hookdeck.com/webhooks/platforms/guide-to-postmark-webhooks-features-and-best-practices)
