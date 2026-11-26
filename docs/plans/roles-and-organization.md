# Plan: Roles and organization (brick 3c)

- **Status:** draft for the owner's review (26 Nov 2026). Build after brick 3b merges (or stacked on it).
- **Spec:** [docs/specs/roles-and-organization.md](../specs/roles-and-organization.md) (approved, all 14 recommendations, 26 Nov 2026)
- **Journeys:** J-ONB-07 and J-ONB-08 (new), J-ONB-01 step 7, J-ONB-05 step 3, and copy changes in J-ONB-02 and J-ONB-06
- **Branch:** `brick/03c-roles-org`, cut from `brick/03b-team`. **One pull request.**
- **Decision record:** [0018 Entities are called companies on screen](../decisions/0018-entities-are-called-companies-on-screen.md) (committed with this plan)
- **Written by:** the architect agent on 26 Nov 2026, against the code on `brick/03c-roles-org` (3b merged state: oRPC 1.16.5, Drizzle, TanStack Router 1.170)

## Summary (plain English)
Settings grows from one section to four: **Organization**, **Companies**, **Team** and **Roles & permissions**.

- **Organization:** Olumide can fix the group's name, head office state and financial year.
- **Companies:** he can add each SPV, edit its RC number, TIN and VAT status, archive one that's wound up (with Undo), and restore it later. The company switcher in the top bar gets **+ Add company**, and the word "entity" disappears from every screen (decision 0018).
- **Roles & permissions:** everyone who can open Settings sees, in a grid, exactly what each role can do. Owners and admins can duplicate any role into a custom one ("Site engineer"), tick what it may do, and give it to people on Team. A change applies on the holder's next click.
- **Guardrails, standing in for a second approver until brick 4:**
  - Nobody can give access they don't have themselves.
  - Nobody can edit the role they hold.
  - Only people who can see every company can make changes that affect the whole group.
  - Any role that can touch money, payroll or people's access requires two-step sign-in.
  - Two people editing the same role can't overwrite each other.
- **Plan limits:** the active-company limit is checked inside the transaction when adding and when restoring, so two people can't both take the last place.
- **Home:** the setup checklist gains "Add your other companies (SPVs)". It ticks itself when a second company exists, or when someone answers "We only have one company".

---

## 1. Summary (technical)
- **Schema (one generated migration plus one custom):**
  - `roles`: `archived_at`, `version`, a consistency check, and the name index made partial (`archived_at is null`).
  - `entities`: `archived_by_user_id`.
  - `organizations`: `single_company_confirmed_at` and `single_company_confirmed_by_user_id`.
  - The custom migration adds a backfill and two **guard triggers**: no active member or pending invitation may point at an archived role.
- **New procedures:**
  - `entities.restore`
  - `roles.get`, `roles.create`, `roles.update`, `roles.delete`
  - `checklist.answerSingleCompany`
- **Changed procedures:**
  - `entities.list` gains `q` and `counts`, and each entity gains `archivedByName`.
  - `entities.archivePreview` now returns names, not just a count.
  - `entities.update` refuses archived companies.
  - `roles.list` adds people counts, `version`, `can` flags and a read-only reason.
  - `account.me` gains `canAddCompany`.
  - New error reasons.
- **Rules:**
  - **Pure role rules** go in `packages/shared/src/access/role-rules.ts`, so the grid and the server can't drift: the ceiling, the two-step lock, grid toggling, normalising, and diffing for audit and the save bar.
  - **Who may do what to whom** stays in `apps/api/src/access/manage-rules.ts`. It gains the `wider_permissions` reason (members, invitations and role grants) and the role refusals (built-in, own role, all companies, ceiling).
  - A new middleware, `requireAllEntities(doing)`, guards every organization-wide change.
- **Web:**
  - Three new settings sections (Organization, Companies, Roles & permissions), all organization-wide (`staticData.orgWide`).
  - A lazy Company sheet overlay that opens from five places, and a lazy plan-message dialog.
  - Role list and role page with a `PermissionsGrid` (desktop), `PermissionsMobileList` with a switch sheet (phones), a save bar with Undo, and the New role and Delete confirms.
  - The switcher becomes "Company", with **+ Add company** and a "No company" state.
  - The "Entity" → "Company" copy pass across 3a, 3b and 2a screens and server messages.
- **No new runtime dependencies.** The Switch, Popover and ToggleGroup primitives come from the `radix-ui` package already installed. Home's first load grows by about 1.5 KB.

## 2. Domain model

```
Organization 1─* Entity (company)   status active ⇄ archived; archivedByUserId
     │        + singleCompanyConfirmedAt/By (checklist answer)
     ├──1─* Role ── key (built-in) | null (custom); version; archivedAt (custom only)
     │        └─* RolePermission (module × action)
     ├──1─* Member ──▶ Role (active members never on an archived role)
     └──1─* Invitation ──▶ Role (pending invitations never on an archived role)
```
**Ownership:** everything here is organization-scoped. Nothing in 3c belongs to an entity. Companies *are* the entities.

**Entity lifecycle**
```
(create, plan limit) ─▶ active ──archive (not last active; org lock)──▶ archived
                          ▲                                               │
                          └──── restore (plan limit; org lock + plan lock)┘
archived: read-only (update refused), not grantable, not in the switcher, keeps its RC number
```

**Custom role lifecycle**
```
create (from any role; ≤ 50 live custom roles; org lock) ─▶ live (version 1)
live ──update (version must match; +1)──▶ live
live ──delete, nobody holds it, no history──▶ erased (row and its permissions deleted)
live ──delete, nobody holds it, has history (removed members, past invitations)──▶ archived (hidden; name reusable)
```
- "Holds it" means an **active member** or a **pending invitation**, live or expired, because expired ones can be resent (plan question 4).
- Built-in roles never change state. `syncSystemRoles` remains their only writer.

**Invariants (database and service)**
- Role names are unique per organization, ignoring case, among live roles. Built-in names are included. *DB:* partial unique index.
- `key is null` ⇔ `is_system = false`. Archived roles are custom only. *DB:* check constraints.
- No active member or pending invitation on an archived role. *Service:* role row locked `for share` on assign and `for update` on delete. *DB:* guard triggers (backstop).
- At least one ticked action per custom role. Any action implies `view`. *Shared:* `normalisePermissions` and `isEmptyPermissionSet`, used on both sides.
- Two-step: `roleNeedsTwoStep(permissions) ⇒ requiresTwoStep`. *Shared rule, server-enforced.* A test proves it agrees with every built-in role.
- At least one active entity. *Existing:* org lock plus count.
- `archived_by_user_id is null or status = 'archived'`. *DB:* check.
- `single_company_confirmed_at` and `…_by_user_id` are both set or both null. *DB:* check.
- **A member's entity limit keeps archived entity ids.** `loadMembership` must never filter limits by status. Otherwise a member limited only to archived companies would read as `entityIds = null`, which means *all* entities (risk R1; pinned by a test).

**Who may do what (applied in this order; the first refusal wins)**

| Subject | Refusals |
|---|---|
| Change, reset or remove a member | self (`own_access`) → owner rules (`owner_only`) → **target's role wider than the viewer's (`wider_permissions`, new)** → **new role wider than the viewer's (`wider_permissions`, change only, new)** → wider company access (`entity_limit`) → last owner (`last_owner`, service) |
| Resend an invitation | owner-role invitation by a non-owner (`owner_only`) → **invitation's role wider (`wider_permissions`, new)** → `entity_limit` → once a minute |
| Withdraw an invitation | **invitation's role wider (`wider_permissions`, new)** → `entity_limit` |
| Invite (each role in the batch) | owner role by a non-owner (`owner_only`) → **role wider than the inviter's (`wider_permissions`, new)** → `entity_limit` |
| Create a role | permission → **all companies (`all_entities_required`)** → **the source role's permissions wider than the creator's (`wider_permissions`)** → 50-role guard |
| Edit a role | permission → all companies → **built-in (`built_in_role`)** → **own role (`own_role`)** → **role currently wider than the editor (`wider_permissions`; read-only, plan question 1)** → **new permissions wider (`wider_permissions`)** → stale version (`role_changed`) |
| Delete a role | permission → all companies → built-in → own role → held (`role_in_use`) |

- **"Wider"** means: some (module, action) in the target set isn't in the viewer's. Owners and admins hold everything, so nothing changes for them today.
- **Messages:**
  - `wider_permissions` on a person: "Kemi Adebayo can do things you can't. Ask Olumide Bankole (owner) to change it."
  - On a grant: "You can only give access you have yourself."

## 3. Database

**Migration `0007_roles_and_organization` (generated)**

| Table | Change | Notes |
|---|---|---|
| `roles` | `archived_at timestamptz null` | Custom roles kept for history |
| `roles` | `version integer not null default 1`, check `version >= 1` | Optimistic concurrency for `roles.update` |
| `roles` | Drop `roles_org_name_unique`; create `roles_org_name_unique` on `(organization_id, lower(name)) where archived_at is null` | A deleted role's name can be reused |
| `roles` | Check `roles_system_key_consistent`: `(key is null) = (not is_system)`; check `roles_archived_custom_only`: `archived_at is null or not is_system` | Every existing row already satisfies both (built-ins have both a key and `is_system`) |
| `roles` | Index `roles_org_archived_idx (organization_id) where archived_at is null` | Optional: roles lists are tiny, so add it only if `EXPLAIN` asks for it |
| `entities` | `archived_by_user_id uuid null → users(id) on delete restrict`; check `archived_by_user_id is null or status = 'archived'`; index `entities_archived_by_idx` for the FK | "Archived 2 Dec 2026 by Olumide Bankole" |
| `organizations` | `single_company_confirmed_at timestamptz null`, `single_company_confirmed_by_user_id uuid null → users(id) on delete restrict`; check both-or-neither; index for the FK | Checklist answer; Undo clears both |

**Migration `0008_roles_guards` (`drizzle-kit generate --custom`)**
- **Backfill:** set `entities.archived_by_user_id` from the latest `entity.archived` audit event's `actor_user_id` (same shape as 3b's `removed_by_user_id` backfill).
- **Trigger `members_role_not_archived`:** `before insert or update of role_id, status on members`. Raises when `new.status = 'active'` and the role is archived.
- **Trigger `invitations_role_not_archived`:** the same on `invitations` for `status = 'pending'`.
- **Trigger `roles_archive_unheld`:** `before update of archived_at on roles`. When it goes from null to a value and an active member or pending invitation holds the role, it raises.
- All three raise `check_violation` with a fixed message naming the guard, in the style of `0001_access_guards` (where the last-owner trigger is the backstop). A new `isGuardViolation(error, name)` in `lib/errors.ts` lets the services map a hit to the same CONFLICT copy as their own check. The services check first, so users never see a raw trigger error.

**Migration safety**
- Additive columns, plus a NOT NULL column with a constant default (metadata-only on Postgres 18).
- The index swap on `roles` runs inside the migration transaction. The table holds about 10 to 60 rows per organization, so the lock is milliseconds.
- Old code ignores the new columns, but old code would still enforce the *full* name index. Deploy the migration and the code together (normal for us).
- Nothing is dropped except the index it replaces. Rollback: recreate the full index (safe while no archived role shares a name with a live one).

**Queries**
- `roles.list` takes three statements: the roles, their permissions (`loadRoles`), and one grouped count of holders (`select role_id, count(*) filter (where kind = 'member'), … from (members active ∪ invitations pending) group by role_id`).
- `entities.list`: one page query plus one `count(*) filter (where status = …)` statement for both chip counts. `q` is `ILIKE` on name or RC, with `%`/`_` escaped (reuse `likePattern` from `team.service.ts`, moved to `lib/like.ts`). The existing indexes are enough: an organization has tens of companies at most.

## 4. Contract (`packages/shared`, every procedure on `platform`: no feature flag, decision 0016)

**New `src/access/role-rules.ts`** (pure functions; imports constants and types only)
```ts
export const MAX_CUSTOM_ROLES = 50
export const ROLE_NAME_MAX = 40
/** Any action ⇒ view; actions in PERMISSION_ACTIONS order; no duplicates. */
export function normalisePermissions(set: PermissionSet): PermissionSet
export function isEmptyPermissionSet(set: PermissionSet): boolean
/** Grid rules: ticking any action adds view; unticking view clears the module. */
export function toggleCell(set: PermissionSet, m: PermissionModule, a: PermissionAction, on: boolean): PermissionSet
/** The (module, action) pairs in `target` that `granter` lacks. Empty = within the ceiling. */
export function permissionsBeyond(granter: PermissionSet, target: PermissionSet): { module: PermissionModule; action: PermissionAction }[]
export const withinPermissions = (g: PermissionSet, t: PermissionSet) => permissionsBeyond(g, t).length === 0
/** Settings create/edit/delete, or anything beyond view in Finance or HR. */
export function roleNeedsTwoStep(set: PermissionSet): boolean
/** Per module, actions added and removed: audit before → after, and the save bar's "3 changes". */
export function permissionChanges(before: PermissionSet, after: PermissionSet): { module: PermissionModule; added: PermissionAction[]; removed: PermissionAction[] }[]
export const changeCount = (changes: ReturnType<typeof permissionChanges>) => /* sum of added + removed */
export const customRolePluralName = (name: string) => `people with the ${name} role`
```

**`src/access/schema.ts`** (changed)
```ts
export const roleName = z.string().trim()
  .min(2, { message: 'Enter a name for the role' }).max(ROLE_NAME_MAX, { message: 'Use 40 characters or fewer' })
  .refine((v) => !hasHiddenCharacters(v), { message: HIDDEN_CHARACTERS_MESSAGE })
export const roleDescription = z.string().trim().max(200).refine(noHidden)
export const roleReadOnlyReason = z.enum(['built_in', 'own_role', 'all_entities', 'permission', 'wider_permissions'])
export const role = z.object({ …as today…,
  version: z.number().int().min(1),
  memberCount: z.number().int().min(0),   // active members
  invitedCount: z.number().int().min(0),  // pending invitations, expired included
  /** For the viewer, computed by the server from manage-rules (like team.list rows). */
  can: z.object({ assign: z.boolean(), edit: z.boolean(), delete: z.boolean(), duplicate: z.boolean() }),
  readOnly: z.object({ reason: roleReadOnlyReason, message: z.string() }).nullable(),
})
export const createRoleInput = z.strictObject({ name: roleName, sourceRoleId: id })
export const updateRoleInput = z.strictObject({
  id, version: z.number().int().min(1),
  name: roleName.optional(), description: roleDescription.optional(),
  requiresTwoStep: z.boolean().optional(),
  permissions: permissionSet.refine((s) => !isEmptyPermissionSet(s), { message: 'Give this role access to at least one area' }).optional(),
})
export const entityLimit = … message 'Choose at least one company, or allow all'   // copy only
```

**`src/access/contract.ts`**
```ts
export const rolesContract = {
  list: platform.output(paginated(role)),            // still one page; ordered built-ins then custom A–Z
  get: platform.input(byId).output(role),
  create: platform.input(createRoleInput).output(notice.extend({ role })),
  update: platform.input(updateRoleInput).output(notice.extend({ role })),   // role.version is the new version (for Undo)
  delete: platform.input(byId).output(notice),
}
```

**`src/organization/schema.ts` and `contract.ts`**
```ts
export const entity = … .extend({ archivedByName: z.string().nullable() })
export const listEntitiesInput = paginationInput.extend({ status: entityStatus.optional(), q: z.string().trim().max(100).optional() }).strict()
export const listEntitiesOutput = paginated(entity).extend({ counts: z.object({ active: int, archived: int }) }) // within the viewer's access
export const entityArchivePreview = z.object({
  isLastActive: z.boolean(),
  /** Active members whose only active company is this one. Up to 3 names, A–Z; count is the total. */
  members: z.object({ count: z.number().int().min(0), names: z.array(z.string()).max(3) }),
})
entitiesContract.list → .output(listEntitiesOutput)
entitiesContract.restore = platform.input(byId).output(entity)
```
`archivePreview` has no web caller yet, so changing its output breaks nobody.

**`src/team/schema.ts`**
- `readOnlyReason` adds `'wider_permissions'`.
- `checklistItemKey` adds `'other_companies'` (after `first_entity`).

**`src/team/contract.ts`**
```ts
checklistContract.answerSingleCompany = platform
  .input(z.strictObject({ singleCompany: z.boolean() }))   // false = Undo
  .output(notice)
```

**`src/account/schema.ts`**
- `me` adds `canAddCompany: z.boolean()`: settings `create` and all-companies access, from the server.
- The web still ANDs it with the effective (preview) permissions.

**`src/common/errors.ts`**

| Map | Adds |
|---|---|
| `forbiddenReason` | `wider_permissions`, `all_entities_required`, `built_in_role`, `own_role` |
| `conflictReason` | `role_name_taken`, `role_changed`, `role_in_use`, `role_unavailable`, `role_limit`, `entity_archived`, `not_restorable` |
| `CONFLICT.data` | `entity?: { id, name, archived: boolean }` (`rc_number_taken`, for **Restore it instead**) · `changedByName?: string` (`role_changed`) · `holders?: { members: int, invited: int }` (`role_in_use`) |
| `BAD_REQUEST.data.reason` | Widened from `PASSWORD_ERROR_CODES` to also allow `role_needs_two_step` |

**`src/audit/actions.ts`:** `entity.restored`, `role.created`, `role.updated`, `role.deleted`.

**Errors per procedure**

| Procedure | Errors |
|---|---|
| `organization.update` | FORBIDDEN `permission`, `all_entities_required` |
| `entities.list` | none new. A `q` from another organization's data simply matches nothing. |
| `entities.create` | FORBIDDEN `permission`, `all_entities_required`, `plan_limit`; CONFLICT `rc_number_taken` (+ `entity`) |
| `entities.update` | NOT_FOUND (outside access or another organization); CONFLICT `entity_archived`, `rc_number_taken` |
| `entities.archivePreview` / `archive` | FORBIDDEN `permission`, `all_entities_required`; NOT_FOUND; CONFLICT `not_archivable` ("… is already archived. The list is up to date."), `last_entity` |
| `entities.restore` | FORBIDDEN `permission`, `all_entities_required`, `plan_limit`; NOT_FOUND; CONFLICT `not_restorable` ("… is already active. The list is up to date.") |
| `roles.get` | NOT_FOUND (archived roles too) |
| `roles.create` | FORBIDDEN `permission`, `all_entities_required`, `wider_permissions`; NOT_FOUND (source); CONFLICT `role_name_taken`, `role_limit` |
| `roles.update` | FORBIDDEN `permission`, `all_entities_required`, `built_in_role`, `own_role`, `wider_permissions`; NOT_FOUND; CONFLICT `role_name_taken`, `role_changed` (+ `changedByName`); BAD_REQUEST `role_needs_two_step` |
| `roles.delete` | FORBIDDEN `permission`, `all_entities_required`, `built_in_role`, `own_role`; NOT_FOUND; CONFLICT `role_in_use` (+ `holders`) |
| `checklist.answerSingleCompany` | FORBIDDEN `permission`, `all_entities_required` |
| `members.updateAccess` | adds FORBIDDEN `wider_permissions`; CONFLICT `role_unavailable` |
| `invitations.create` | adds FORBIDDEN `wider_permissions`; CONFLICT `role_unavailable` |
| `invitations.resend` | adds FORBIDDEN `wider_permissions`; CONFLICT `role_unavailable` (its role was deleted while it was expired; impossible while plan question 4 stands) |
| `invitations.withdraw` | adds FORBIDDEN `wider_permissions` |

## 5. Permissions and access

| Procedure | Module × action | All companies? | Default roles | Extra rules |
|---|---|---|---|---|
| `organization.get` | none (member) | no | everyone | unchanged |
| `organization.update` | settings `edit` | **yes** | owner, admin | only changed fields |
| `entities.list`, `get` | none (member) | no | everyone | limited to the viewer's companies (as today) |
| `entities.create` | settings `create` | **yes** | owner, admin | plan limit in the transaction |
| `entities.update` | settings `edit` | no | owner, admin | within access; archived refused |
| `entities.archivePreview`, `archive` | settings `delete` | **yes** | owner, admin | last active kept |
| `entities.restore` | settings `delete` | **yes** | owner, admin | plan limit in the transaction |
| `roles.list`, `roles.get` | settings `view` | no | owner, admin, custom with Settings: View | flags per viewer |
| `roles.create` | settings `create` | **yes** | owner, admin | ceiling; ≤ 50 custom |
| `roles.update` | settings `edit` | **yes** | owner, admin | ceiling; not built-in; not own role; version |
| `roles.delete` | settings `delete` | **yes** | owner, admin | not held; not own role |
| `checklist.answerSingleCompany` | settings `create` | **yes** | owner, admin | audited as `organization.updated` |
| `members.updateAccess`, `remove`, `resetTwoStep`; `invitations.create`, `resend`, `withdraw` | as 3b | no | as 3b | **plus the ceiling (`wider_permissions`)** |

- **`requireAllEntities(doing)`** (new, in `apps/api/src/access/middleware.ts`):
  - It runs after `requirePermission`, and only when `context.member.entityIds !== null`.
  - It throws `forbidden('all_entities_required', 'Only people with access to every company can change this. Ask {owner} (owner).')`. The owner's name comes from `firstOwner`, so a query runs only on refusal.
- **Settings: View-only custom roles** get the existing `requirePermission` refusal: "Only owners and admins can … Ask Olumide Bankole (owner)." The `doing` strings change to company wording ("add companies", "archive companies", "make roles"…).
- **Changes apply on the next request:** `loadMembership` already reads role permissions on every request, uncached. **Rule for later:** any cache of permissions must key on `roles.version`.
- **Maker-checker (non-negotiable 12):** every change is audited with before → after. The guardrails above stand in for a checker until brick 4 adds the default "Change a role's permissions" approval rule (spec question 13).

## 6. Services (apps/api)

**`modules/roles/roles.service.ts`**
- `loadRoles(db, orgId, roleIds?)`:
  - Filters `archived_at is null` unless `includeArchived`, with an order SQL `CASE` on the system key, then `lower(name)`.
  - Gains the holder counts (one grouped query).
- `listRoles(ctx)` and `getRole(ctx, id)`: each role passes through `roleRights(viewer, role, { allEntities, ownerName })` from manage-rules, which gives `can` and `readOnly`.
- `createRole(ctx, { name, sourceRoleId })`, one transaction:
  1. `lockOrganization`, which serialises the 50-role guard.
  2. Load the source; a foreign or archived one is NOT_FOUND.
  3. Check the ceiling on the source's permissions.
  4. Count live custom roles; at 50 or more, `role_limit`.
  5. Insert the role with `key = null`, `is_system = false`, `pluralName` derived, `description = "Based on {source}"`, and the source's `requiresTwoStep`.
  6. Insert the permissions.
  7. Audit `role.created` (name, source, permissions).
  8. A unique violation on `roles_org_name_unique` gives `role_name_taken` ("A role called … already exists.").
- `updateRole(ctx, input)`, one transaction:
  1. Select the role `for update`; NOT_FOUND if missing or archived.
  2. Refusals in the table's order.
  3. Merge the input over the current values.
  4. Normalise the permissions.
  5. If `roleNeedsTwoStep(merged) && !merged.requiresTwoStep`, return BAD_REQUEST `role_needs_two_step`.
  6. If `current.version !== input.version`, return `role_changed`, with `changedByName` from the newest `role.updated` audit event for this target (index `audit_events_org_target_idx`).
  7. Update the name, plural name, description, two-step and `version = version + 1`. Replace the permissions (delete, then insert).
  8. Audit `role.updated` with before and after from `permissionChanges`, plus the name and two-step diffs.
  9. Return the role with its new version and the notice "Site engineer saved".
- `deleteRole(ctx, id)`, one transaction:
  1. `lockOrganization`.
  2. Select the role `for update`.
  3. Refusals.
  4. Count holders. Any holder gives `role_in_use` with `holders` and "Move 3 people to another role first."
  5. History check: `exists` a removed member or a non-pending invitation for the role.
  6. With history, `archived_at = now()`; without, `delete` (permissions cascade).
  7. Audit `role.deleted` with `metadata: { kept: 'archived' | 'erased' }`.

**Assigning roles (`members.service.ts`, `invitations.service.ts`)**
- Read the chosen role rows `for share` with `archived_at is null`. A role that is archived meanwhile gives CONFLICT `role_unavailable` ("That role no longer exists. Choose another."); a foreign or missing one stays NOT_FOUND.
- Then apply the ceiling through `grantRefusal`.
- Lock order everywhere: **organization → member or invitation → role → plan row.** `deleteRole` takes organization → role, so there is no cycle.
- `assertMayManage` and `assertMayManageInvitation` pass the target's role permissions (one `loadRoles` call for the role ids involved).

**`access/manage-rules.ts`** (stays the one rule source; split roles into `access/role-refusals.ts` if the file passes about 250 lines)
- `MemberTarget` and `InvitationTarget` gain `permissions: PermissionSet`.
- `memberRefusal` and `invitationRefusal` gain the `wider_permissions` steps (section 2 table). `newRolePermissions` joins `newRoleKey` in the options.
- New: `grantRefusal(viewer, role)`, `roleRefusal(viewer, role, action, { allEntities })` and `roleRights(…)`.
- `needsOwnerName` returns true for `entity_limit` and for `wider_permissions` targets.
- `READ_ONLY_REASON` maps `wider_permissions` → `'wider_permissions'`.
- **Copy changes:** "has access to companies you can't see", "includes companies you can't see".

**`modules/team/team.service.ts`:** loads the organization's roles once per page (`loadRoles`, at most 59 rows) and passes `permissions` into `memberRowRights` and `invitationRowRights`. That adds one query per page and no N+1.

**`modules/entities/entities.service.ts`**
- `listEntities`: `q`, counts, and `archivedByName` (left join to users).
- `assertRcFree`: returns the conflicting row with its status, so the message reads "… (archived) already uses RC …" and the data carries `entity`.
- `updateEntity`: an archived row gives `entity_archived` ("… is archived. Restore it to make changes.").
- `archivePreview`: the names query (`string_agg` over the same membersOnlyThisEntity subquery, ordered, limited to 3).
- `archiveEntity`: sets `archived_by_user_id`. Its message changes to "… needs at least one active company."
- New `restoreEntity`, one transaction:
  1. `lockOrganization`.
  2. `findVisible … for update`.
  3. An active row gives `not_restorable`.
  4. `assertWithinLimit(tx, ctx, 'entities', 1)`.
  5. Update to `status = 'active'`, `archived_at = null`, `archived_by_user_id = null`.
  6. Audit `entity.restored`.
- Undo after archive is this same call.

**`modules/organization/organization.service.ts`:** new `answerSingleCompany(ctx, singleCompany)`:
1. `lockOrganization`.
2. Set or clear both columns.
3. Audit `organization.updated`, before → after `{ singleCompanyConfirmed }`.
4. No-op when unchanged.

**`modules/checklist`**
- `items.ts`: `ChecklistEntry` gains an optional `visibleTo(viewer: { allEntities: boolean }) → boolean`, and `evaluateChecklist` takes the viewer.
- New item `other_companies` (`feature: null`, `visibleTo: allEntities`):
  - done when `entityCount >= 2`, detail "3 companies";
  - otherwise when `singleCompanyConfirmed`, detail "Just {firstEntityName}";
  - otherwise open.
- `checklist.service.ts` `loadFacts` adds `entity_count` (any status), `single_company_confirmed_at` and `first_entity_name`, in the same single query.
- `first_entity` keeps its key; only its copy changes on the web.

**`modules/account/account.service.ts`:** `getMe` sets `canAddCompany = hasPermission(settings, create) && entityIds === null`.

**`platform/limit-words.ts`:** entities become "active company" / "active companies" / "companies", and the action becomes "Archive one,". The owner sentence then reads exactly "Your Starter plan includes 2 active companies. Archive one, or talk to Vento about Growth." Check the members wording is unaffected.

**User-facing server copy pass:**
- `access/grants.ts`: "One of the companies you chose is no longer available. Choose again." / "You can only give access to the companies you can see. Choose them instead of all companies."
- `onboarding.service.ts`: "already has its first company".
- `entities.service.ts`: "Another company already uses RC …".
- The `doing` strings in the routers.
- `grep -rn "entit" apps/api/src --include='*.ts'` for remaining string literals is part of the review checklist.

## 7. Web (apps/web)

**Designs:**
- Organization and Companies: SetOrg (partly).
- Role list and role page: SetPermissions and PermissionsMobile.
- Settings navigation: DSAdditions and SettingsMobile.
- Company sheet, plan message, New role and delete confirms: `pattern` (no board).
- The rows already exist in `docs/design/SCREENS.md`. The spec's *Departures* table goes into `docs/design/CHANGES.md` when built.

**Routes** (all under the existing `settings.tsx` layout and its `moduleGuard('settings')`, so roles without access get the 403 before any request)

| Route | What |
|---|---|
| `routes/_app/_shell/settings/organization.tsx` | `staticData: { orgWide: true }`; loader `ensureQueryData(organization.get)` |
| `routes/_app/_shell/settings/companies.tsx` | `orgWide`; `validateSearch` (`show: 'active' \| 'archived'`, `q`, `page`); loader `entities.list`; `keepPreviousData` |
| `routes/_app/_shell/settings/roles.tsx` | Layout, `orgWide`, `<Outlet/>` |
| `routes/_app/_shell/settings/roles/index.tsx` | Loader `roles.list` |
| `routes/_app/_shell/settings/roles/$roleId.tsx` | Loader `roles.get`; NOT_FOUND gives the standard not-found state ("That role no longer exists.") |

**Settings shell**
- `features/settings/sections.ts`:
  - Adds `organization`, `companies` and `roles` ahead of `team`, in the spec's order, each with `can: settings view`, summaries and ⌘K keywords.
  - `SettingsPath` widens.
  - `/settings` now lands on Organization, or on the phone list.
  - No layout change: 3b already reserved the width (its unit test covers 2+ sections).
- **Unsaved-changes guard** (new `lib/use-unsaved-guard.ts`):
  - TanStack Router `useBlocker({ shouldBlockFn, withResolver: true })` plus `beforeunload`, rendered with `components/confirm-dialog.tsx`.
  - Used by the Organization page and the role page. Also ⌘S to save.

**Organization page** (`features/organization/profile/`)
- `organization-page.tsx` and `organization-form.tsx`: react-hook-form with `updateOrganizationInput`. The form sends **only the dirty fields**, so two owners saving different fields at the same moment both win.
- The head office state uses `features/onboarding/native-select.tsx`, moved to `components/native-select.tsx` (plan question 7).
- The financial-year select shows its span ("January – December") from a pure `financialYearSpan(month)` in `lib/format.ts`.
- **Read-only** when the effective permissions lack settings edit or the member is limited, with the spec's line.
- On success: invalidate `account.me` (the sidebar organization name and the switcher list) and `organization.get`.

**Companies page** (`features/companies/`)
- `companies-page.tsx`, `companies-context-line.tsx`:
  - Owners on a limited plan see the plan line from `me.plan` and `TalkToVentoButton`.
  - Everyone else sees the counts.
- `companies-table.tsx` (semantic `<table>`, as Team) and `companies-cards.tsx` (phones).
- `company-row-menu.tsx`: uses `LazyMenu`; **Archive** is shown disabled with its reason when the company is the last active one (from `counts.active === 1`).
- **Archive flow** (`use-archive-company.ts`):
  1. Call `archivePreview`.
  2. If `members.count > 0`, open the confirm naming them ("Kunle Ojo, Ope Martins and 1 other…").
  3. Otherwise `archive` at once, with a toast and **Undo** (8 s) that calls `restore`.
  4. Stale states (`not_archivable` / `not_restorable`) toast the server message and refetch.
- **Restore** on archived rows, with plan refusals handled by the plan dialog (owner) or a `PlanLimitMessage` toast.
- Shortcut `n` scoped to `/settings/companies` (`features/shell/shortcuts.ts`).
- States: skeleton rows and cards, "No archived companies.", `ErrorState` with **Try again**.

**Company sheet and plan message** (one lazy chunk, `features/companies/sheet/`)
- **Shell overlays:** `features/shell/shell-ui.ts` adds the overlays `company` (payload `{ mode: 'add' } | { mode: 'edit', id }`) and `company-plan`, using the same payload store pattern as `invite`. Both are mounted once in the shell.
- **`features/companies/open-add-company.ts`** is tiny and has **no** import of the sheet. Its `openAddCompany(me)`:
  - opens `company-plan` when `me.plan` shows the entities limit used up (owners only, since `me.plan` is null for others);
  - otherwise opens `company` in add mode.
  - Every **Add company** button calls it: page, switcher, checklist and ⌘K.
- **`company-sheet.tsx`:**
  - The form uses the shared `entityInput` / `updateEntityInput`.
  - The fields come from a new `company-fields.tsx`, extracted from `features/onboarding/entity-step.tsx`, which then uses it too: one source of truth for the name, the type picker (`entity-type-picker.tsx`), RC normalised on blur, the TIN, and format warnings that never block.
  - Edit mode sends only the dirty fields.
  - An archived company shows read-only facts, "Archived 2 Dec 2026 by …" and **Restore**.
- **Errors in the sheet:**
  - `rc_number_taken` goes on the RC field. With `entity.archived` and the right to restore, it adds **Restore it instead** (calls `restore`, then closes and selects the row).
  - `plan_limit` shows `PlanLimitMessage` above the buttons; the fields stay.
- **After add:**
  - Toast "… added" with **Switch to it** (`useCurrentEntity().select(id)`).
  - Invalidate `entities.list`, `account.me` and `checklist.get`.
- `plan-limit-dialog.tsx`: the spec's owner copy, **Talk to Vento** · **Close**.
- Preloaded on hover or focus of any **Add company** button.

**Company switcher** (`components/shell/entity-switcher.tsx`, `entity-menu.tsx`)
- **Label:** "Company", "All companies"; sr-only ", change company".
- **+ Add company** sits under a divider in `entity-menu.tsx` (already lazy) when `me.canAddCompany && can(effective, 'settings', 'create')`, so it's hidden in Preview for roles without it.
- **Locked switcher (one company):** when `canAddCompany` is true the menu renders anyway (one radio item plus **+ Add company**). Otherwise it stays a plain label.
- **"No company":**
  - Shown when `me.member.entityIds !== null` and none of those ids is active, i.e. the active `entities.list` is empty. The switcher label reads "No company".
  - Home shows `features/shell/no-company-card.tsx` (about 0.5 KB). It names who to ask from `access.whoCanChangeAccess({ module: 'settings' })`, fetched only in this state.
- The invalid-link toast becomes "That company isn't available. Showing all companies."

**Roles** (`features/roles/`)
- **`roles-page.tsx`, `roles-table.tsx`, `roles-cards.tsx`:**
  - Built-ins in the server's order, then custom roles under a quiet divider.
  - The "Custom" tag.
  - People links to `/settings/team?role=…`.
  - The empty-custom panel.
  - Row menu: Duplicate · Preview this role · Delete role, gated by `role.can`.
  - Shortcut `n` for **New role**.
- **`role-page.tsx`:**
  - `role-header.tsx`: the in-place name and description for editable roles, the people link, **Duplicate role**, **Preview this role** (disabled while dirty, with the spec's tooltip), and ⋯ **Delete role**.
  - `role.readOnly.message` shows above the grid when present. The built-in note comes from the same field (`built_in`).
- **`permissions-grid.tsx`** (desktop and tablet):
  - A `<table>` with ten module rows (`MODULE_LABELS` plus `module-lines.ts`, the spec's one-line descriptions) and six action columns.
  - Each cell is a `PermissionCell` (`permission-cell.tsx`), a real `Checkbox` with the accessible name "Projects: Create".
  - The **Approve** header has a tooltip, and the Settings row has its explanatory line.
  - Cells the editor lacks (`permissionsBeyond(myPermissions, cell)`) are disabled with the tooltip "You can only give access you have yourself."
  - Read-only roles render the same cells as static ticks (`aria-checked`, no inputs). The layout is identical, so no jump.
- **`permissions-mobile-list.tsx` and `module-actions-sheet.tsx`** (phones, PermissionsMobile):
  - One row per module ("View · create · edit · export" / "No access").
  - On an editable role, tapping a row opens a bottom `Sheet` with six labelled switches (`components/ui/switch.tsx`, new, from `radix-ui`) and **Done**.
- **`use-role-draft.ts`:**
  - Holds `{ name, description, requiresTwoStep, permissions }` against the loaded role.
  - `toggle` uses the shared `toggleCell`.
  - Derives `changes = permissionChanges(…)`, `dirty`, and `twoStepLocked = roleNeedsTwoStep(draft.permissions)`.
  - When locked, `requiresTwoStep` is forced on in the draft, and shows "Required because…".
- **`role-save-bar.tsx`:**
  - Sticky, above the tabs on phones.
  - Reads "3 changes · applies to 4 people on their next click" / "· applies to nobody yet".
  - **Discard** · **Save changes**, and ⌘S.
- **Saving** (`use-save-role.ts`):
  1. Call `roles.update` with `version`.
  2. On success, replace the cached `roles.get` and `roles.list` entries, and toast "Site engineer saved · Undo".
  3. Undo calls `update` with the previous values and the **new** version.
  4. `role_changed` shows the server message with **Reload**, which refetches `roles.get` and drops the draft after confirming.
  5. Offline: no optimistic change.
  6. Also invalidate `team.list` (role names).
- **`new-role-dialog.tsx`:**
  - Name, prefilled "Copy of {source}" and selected.
  - **Start from** is a `Select` of all roles (preset from the page, else Viewer). Only roles with `can.duplicate` are listed, i.e. roles within the creator's ceiling.
  - `role_name_taken` goes on the field.
  - On success it navigates to the new role's page.
- **`delete-role-confirm.tsx`:**
  - Uses `confirm-dialog.tsx`.
  - When held, the menu item instead reads "Move 3 people to another role first" and links to Team filtered by the role (`role.memberCount`, `role.invitedCount`).
- **Preview:**
  - **Preview this role** calls the existing `startPreview(orgId, roleId)` and navigates to `/`.
  - `components/shell/preview-banner.tsx` already names the role from `roles.list`.
  - If the previewed role disappears from `roles.list`, `clearPreview()` (one line in `use-effective-permissions.ts`).

**Team and invite (3b) changes**
- `features/team/role-menu.tsx`, `invite/role-for-everyone.tsx` and `member-access-form.tsx`:
  - Built-ins, then a divider, then custom roles A–Z.
  - Only roles with `role.can.assign` are offered, so roles beyond the granter's ceiling are hidden, like Owner today (plan question 2).
- `features/team/team-cells.tsx` and the sheets: the `wider_permissions` read-only line comes from the server. No client logic.
- `role_unavailable` on a role change or an invite toasts "That role no longer exists. Choose another." and invalidates `roles.list`.

**Copy pass "Entity" → "Company"** (decision 0018). Every file below changes in the same commit, with e2e selectors:
- `components/shell/entity-switcher.tsx`, `entity-menu.tsx`
- `features/shell/home-page.tsx`, `home-kpis.ts` ("Cash across companies", "Cash, all companies"), `nav.ts` (comingSoon lines and keywords), `module-highlights.ts`, `command-results.tsx` (hint "Company", keywords keep "entity" so ⌘K still finds it)
- `features/team/entity-access-field.tsx`, `member-sheet.tsx`, `invitation-sheet.tsx`, `team-cells.tsx`, `invite/access-line.tsx`, `invite/use-send-invitations.ts`
- `features/invitations/invitation-summary.tsx`
- `features/onboarding/onboarding-layout.tsx` ("First company"), `entity-step.tsx` (now through `company-fields.tsx`)
- `features/checklist/checklist-copy.ts` (rename plus the new item: label, open line, actions **Add company** and **We only have one company**)
- `features/plan/plan-limit-message.tsx` ("more companies")
- `lib/error-copy.ts` if it holds any of the strings
- Help articles in `docs/help/getting-started/` that say "entity"

**Home checklist** (`features/checklist/setup-checklist.tsx`)
- The `other_companies` row has two actions:
  - **Add company** → `openAddCompany(me)`.
  - **We only have one company** → `answerSingleCompany({ singleCompany: true })`, with toast and **Undo** (`false`).
- Invalidate `checklist.get`.

**⌘K** (`features/shell/command-results.tsx`, each item gated on effective access)
- *Go to:* Organization, Companies, Roles & permissions (from the sections registry).
- *Actions:*
  - **Add company**: `canAddCompany` and effective settings create.
  - **New role**: effective settings create and `me.member.entityIds === null`. It opens `/settings/roles?new=1`, which the roles page reads to open the dialog.
- *Roles:* each role by name ("Sales role"), from the cached `roles.list`. It's listed only when that query is already in the cache, so ⌘K never fetches roles itself.

**Bundle** (performance skill: first load ≤ 200 KB gzip; `apps/web/scripts/bundle-check.mjs` runs in CI)
- **Home's first load** grows only by:
  - the checklist item copy;
  - `open-add-company.ts`;
  - `no-company-card.tsx`;
  - the switcher label.
  - Target **≤ 1.5 KB**.
  - `features/roles/*`, `features/companies/*` and `role-rules.ts` must never be imported from shell or Home modules. Add a check in `bundle-check.mjs`: fail if the entry chunk contains `permissionsBeyond`.
- **Route chunks** (targets, gzip):
  - Organization ≤ 25 KB.
  - Companies ≤ 40 KB.
  - Roles list ≤ 30 KB.
  - Role page ≤ 60 KB.
  - Company sheet ≤ 30 KB.
- The sheet and dialogs load lazily and are preloaded on intent.
- Report before and after numbers in the PR.

## 8. Files

**packages/shared**
- `src/access/role-rules.ts`, `role-rules.test.ts`: pure rules (new)
- `src/access/schema.ts`: `roleName`, `roleDescription`, role fields and flags, create and update inputs; entity-limit copy
- `src/access/contract.ts`: `roles.get/create/update/delete`
- `src/access/default-roles.test.ts`: `roleNeedsTwoStep(defaultPermissions(r)) === r.requiresTwoStep` for all nine
- `src/organization/schema.ts`, `contract.ts`: `archivedByName`, `q`, counts output, new `archivePreview` shape, `restore`
- `src/organization/schema.test.ts`: list input, `q` trimming
- `src/team/schema.ts`, `contract.ts`: `wider_permissions` read-only reason, `other_companies`, `answerSingleCompany`
- `src/account/schema.ts`: `canAddCompany`
- `src/common/errors.ts`: reasons and data fields (section 4)
- `src/audit/actions.ts`: four actions
- `src/index.ts`: export `role-rules`

**apps/api**
- `src/db/schema/access.ts`: roles `archivedAt`, `version`, checks, partial name index
- `src/db/schema/organization.ts`: entities `archivedByUserId` and check; organizations' checklist columns and check
- `drizzle/0007_roles_and_organization.sql`, `drizzle/0008_roles_guards.sql` and meta
- `src/lib/errors.ts`: `isGuardViolation` for the three guard triggers; `src/lib/like.ts`: `likePattern` moved from `team.service.ts`
- `src/access/middleware.ts`: `requireAllEntities`
- `src/access/manage-rules.ts` (and `role-refusals.ts` if split), `manage-rules.test.ts`
- `src/access/grants.ts`: copy
- `src/access/who-can-grant.ts`, `src/modules/access/access.service.ts`: ignore archived roles
- `src/access/system-roles.ts`: no change (it upserts by key). Add a test that a custom role named like a future built-in makes the sync fail loudly (risk R4).
- `src/modules/roles/roles.service.ts`, `roles.router.ts`, `roles.service.test.ts` (new test file)
- `src/modules/entities/entities.service.ts`, `entities.router.ts`, `entities.service.test.ts`
- `src/modules/organization/organization.service.ts`, `organization.router.ts`; new `organization.service.test.ts`
- `src/modules/members/members.service.ts`, `src/modules/invitations/invitations.service.ts`: role lock, `role_unavailable`, ceiling
- `src/modules/team/team.service.ts`: role permissions into row rights
- `src/modules/checklist/items.ts`, `checklist.service.ts`, `checklist.router.ts`, `checklist.service.test.ts`
- `src/modules/account/account.service.ts`: `canAddCompany`
- `src/modules/onboarding/onboarding.service.ts`, `onboarding.router.ts`: copy
- `src/platform/limit-words.ts` and its test
- `src/router.ts`: new procedures (`roles`, `entities.restore`, `checklist.answerSingleCompany`)
- `src/test/factories.ts`: `createCustomRole(db, org, { name, permissions, requiresTwoStep })`, `archiveEntity`
- `src/test/isolation.test.ts`, `permissions-matrix.test.ts`, `procedure-guard.test.ts`
- `src/test/e2e-fixtures.ts`: `companies`, `custom-role`, `role-editor`, `no-company` fixtures
- `src/db/seed.ts`: section 10

**apps/web**
- `src/routes/_app/_shell/settings/organization.tsx`, `companies.tsx`, `roles.tsx`, `roles/index.tsx`, `roles/$roleId.tsx` (new)
- `src/features/settings/sections.ts`, `sections.test.ts`
- `src/features/organization/profile/organization-page.tsx`, `organization-form.tsx` (new)
- `src/features/companies/companies-page.tsx`, `companies-search.ts` with test, `companies-context-line.tsx`, `companies-table.tsx`, `companies-cards.tsx`, `company-row-menu.tsx`, `use-archive-company.ts`, `archive-company-confirm.tsx`, `open-add-company.ts` with test (new)
- `src/features/companies/sheet/company-sheet.tsx`, `company-fields.tsx`, `plan-limit-dialog.tsx`, `use-save-company.ts` (new)
- `src/features/roles/roles-page.tsx`, `roles-table.tsx`, `roles-cards.tsx`, `role-page.tsx`, `role-header.tsx`, `permissions-grid.tsx`, `permission-cell.tsx`, `permissions-mobile-list.tsx`, `module-actions-sheet.tsx`, `module-lines.ts`, `two-step-field.tsx`, `role-save-bar.tsx`, `use-role-draft.ts` with test, `use-save-role.ts` with test, `new-role-dialog.tsx`, `delete-role-confirm.tsx`, `role-queries.ts` (new)
- `src/components/ui/switch.tsx` (new, shadcn on `radix-ui`); `src/components/native-select.tsx` (moved from onboarding)
- `src/lib/use-unsaved-guard.ts` (new); `src/lib/format.ts`: `financialYearSpan`
- `src/components/shell/entity-switcher.tsx`, `entity-menu.tsx`; `src/features/shell/no-company-card.tsx` (new), `home-page.tsx`, `shell-ui.ts`, `command-results.tsx`, `shortcuts.ts`, `nav.ts`, `home-kpis.ts`, `module-highlights.ts`
- `src/features/entity/current-entity.ts`: `noCompany` state; copy
- `src/features/preview/use-effective-permissions.ts`: clear a preview of a vanished role
- `src/features/team/role-menu.tsx`, `member-access-form.tsx`, `entity-access-field.tsx`, `member-sheet.tsx`, `invitation-sheet.tsx`, `team-cells.tsx`, `invite/role-for-everyone.tsx`, `invite/access-line.tsx`, `invite/use-send-invitations.ts`
- `src/features/checklist/checklist-copy.ts`, `setup-checklist.tsx`, `setup-checklist.test.tsx`
- `src/features/onboarding/entity-step.tsx`, `onboarding-layout.tsx`; `src/features/invitations/invitation-summary.tsx`; `src/features/plan/plan-limit-message.tsx`
- `scripts/bundle-check.mjs`: role-rules must stay out of the entry chunk
- `e2e/settings/organization-and-companies.spec.ts`, `e2e/settings/custom-roles.spec.ts` (new)
- `e2e/support/fixtures.ts`, `e2e/support/settings.ts` (new helpers: `openCompanies`, `openRole`, `gridCell(module, action)`)
- Existing specs with "Entity" selectors: `settings/manage-members.spec.ts`, `settings/invite-members.spec.ts`, `shell/navigation.spec.ts`, `shell/organizations.spec.ts`, `auth/accept-invitation.spec.ts`, `onboarding/new-organization.spec.ts`, `home/setup-checklist.spec.ts`

## 9. Tests

**Unit (pure)**
- `role-rules.test.ts`:
  - `normalisePermissions`, plus `toggleCell` (tick Create adds View; untick View clears the row; untick Create keeps View).
  - `permissionsBeyond` and `withinPermissions` (owner ⊇ everything; Sales ⊄ Project manager; equal sets).
  - `roleNeedsTwoStep` against **every built-in role**, derived from `DEFAULT_ROLES`.
  - `permissionChanges` and `changeCount` for the J-ONB-08 example (3 changes).
- `manage-rules.test.ts`, extended:
  - viewers {owner, admin, custom Settings-edit "Office manager" without Finance, custom view-only} × targets {owner, admin, finance, office manager} × actions {change, reset, remove, resend, withdraw};
  - × new role {sales, admin} for change;
  - `roleRefusal` for {built-in, own, wider, limited viewer} × {edit, delete};
  - the order of refusals (self before wider; owner before wider).
- `limit-words.test.ts`: the exact owner and non-owner company sentences.
- Web: `use-role-draft.test.ts` (lock forces two-step; dirty; discard), `open-add-company.test.ts` (owner at limit → plan; admin → form; unlimited → form), `sections.test.ts` (four sections in order; landing Organization; phone list).

**Service (Vitest, real Postgres, `withRollback`)**
- **`roles.service.test.ts`:**
  - list order and counts (members plus pending invitations, expired included);
  - create copies permissions and two-step, sets "Based on …" and plural name, and audits;
  - duplicate name in any case, built-in names included → `role_name_taken`;
  - the name of an archived role is reusable;
  - the 51st custom role → `role_limit`;
  - update replaces permissions, bumps the version and audits added and removed per module;
  - a stale version → `role_changed` with `changedByName`;
  - Undo with the new version succeeds and writes a second event;
  - `requiresTwoStep: false` with Finance edit → `role_needs_two_step`;
  - built-in → `built_in_role`; own role → `own_role`; limited admin → `all_entities_required`;
  - a ceiling breach on create (the source is wider) and on update;
  - delete when held → `role_in_use` with counts;
  - delete without history → the row is gone; with a removed member → archived, hidden from the list, `get` NOT_FOUND;
  - **a holder's next request uses the new permissions** (`loadMembership` before and after; no sign-out). Two-step newly required → the member middleware returns `two_step_setup_required`.
- **Concurrency** (two connections, as `limits.concurrency.test.ts`):
  - assign versus delete: one wins, the other gets `role_unavailable` or `role_in_use`;
  - two updates on version 1: one `role_changed`;
  - two creates at 49 custom roles: one `role_limit`.
- **Guard triggers:** a direct insert of an active member on an archived role fails; archiving a held role fails.
- **`entities.service.test.ts`:**
  - `q` (name and RC, `%` escaped), counts within a limited viewer's access, `archivedByName`;
  - RC clash with an active and with an archived company (message, `entity` data), and `rc-1789234` versus `RC 1789234`;
  - update of an archived company → `entity_archived`;
  - `archivePreview` names (3, A–Z) and count, never counting members with another active company;
  - archive sets `archived_by`; restore clears it and audits `entity.restored`;
  - restore at the limit → `plan_limit` (owner and admin messages);
  - restore of an active company → `not_restorable`; archive of an archived one → `not_archivable`;
  - two concurrent restores into the last place → one `plan_limit`;
  - **a member limited only to an archived company still has `entityIds = [id]`, never null (R1)**.
- **`organization.service.test.ts`:** only changed fields audited; two concurrent updates of different fields both apply; limited admin refused; `answerSingleCompany` true then false (two audit rows; columns both null after).
- **`checklist.service.test.ts`:**
  - `other_companies` open, then done by a second company (archived counts), then done by the answer with "Just …", with the count winning over the answer;
  - hidden for a limited admin;
  - another organization's companies don't count.
- **`team.service.test.ts`:** a custom Settings-edit viewer sees an admin row read-only with `wider_permissions` and the owner's name; `can` flags false.
- **`members` and `invitations` tests:** giving or inviting with a wider role → `wider_permissions`; an archived role → `role_unavailable`; resend and withdraw of a wider-role invitation refused.
- **`account.service.test.ts`:** `canAddCompany` for an owner, a limited admin, and Sales.

**Isolation** (`isolation.test.ts`)
- With another organization's ids: `roles.get`, `update` and `delete`; `roles.create` with a foreign `sourceRoleId`; `entities.restore`, `update` and `archivePreview`; `members.updateAccess` and `invitations.create` with a foreign custom role id. Each returns NOT_FOUND, changes nothing and writes no audit row.
- `entities.list` with `q` matching only a foreign company returns nothing.
- `checklist.answerSingleCompany` writes only its own organization.
- `roles.list` never includes a foreign role, and its counts ignore foreign members.

**Permission matrix** (`permissions-matrix.test.ts`)
- Every new procedure × the nine built-ins, with the expected result read from `defaultRoleAllows`.
- Two extra columns:
  - **the Parkview-limited admin**: refused exactly the "all companies" rows;
  - **a Settings: View-only custom role**: reads allowed, every change refused with the permission message.

**Procedure guard** (`procedure-guard.test.ts`): the walk covers the new procedures. Confirm that a mismatched tab is refused before any query, and that `requireAllEntities` refuses with no write.

**Web component (Vitest and Testing Library)**
- `permissions-grid.test.tsx`:
  - **The built-in grids equal `defaultPermissions` cell for cell**, for all nine roles (spec success measure).
  - Labelled checkboxes; Tab and Space toggle.
  - Cells beyond the editor are disabled.
  - Read-only roles render no inputs.
- `role-save-bar.test.tsx`: the count and audience wording.
- `company-sheet.test.tsx`: RC normalised on blur; warnings don't block; `rc_number_taken` with **Restore it instead**; `plan_limit` keeps the fields.
- `setup-checklist.test.tsx`: the new item's actions; hidden in Preview.
- `entity-switcher.test.tsx`: the label "Company"; **+ Add company** only with `canAddCompany` and not in Preview; a one-company owner gets a menu; "No company".

**e2e (Playwright, desktop and mobile projects)**
- **`organization-and-companies.spec.ts` (J-ONB-07):**
  - Settings opens on Organization; four sections; switcher hidden.
  - Edit the financial year, then the toast; leaving with changes asks first.
  - Add Lekki Pearl from Companies in 3 clicks (RC normalised); toast, then **Switch to it** selects it in the switcher.
  - Add from the switcher's **+ Add company** over Home.
  - RC clash with an archived company → **Restore it instead**.
  - Edit Parkview's TIN.
  - Archive with Undo; archive with the confirm naming people (fixture member limited to it); restore from the Archived chip.
  - Last active company: Archive disabled with the reason.
  - **Starter owner at 2 of 2:** the plan message opens instead of the form, with **Talk to Vento**. **Starter admin:** the form opens and the server refusal names the owner; fields kept.
  - **Parkview-limited admin:** only Parkview; no Add, Archive or Restore; Organization read-only with the line.
  - **No company:** a member limited only to an archived company sees "No company" and the Home card.
  - Sales types `/settings/companies` → 403, with **no `entities` or `organization` request** (network log).
  - The organization switched in another tab: save refused, typing kept.
  - Offline save keeps the input.
  - 375 px: cards, a full-height sheet, a sticky **Add company**.
  - axe on the Organization page, the Companies page and the sheet.
- **`custom-roles.spec.ts` (J-ONB-08):**
  - Roles list shows nine built-ins with counts and two-step.
  - Project manager is read-only with the note.
  - **Duplicate role** → "Site engineer" → **Create role** (4 clicks).
  - Untick Sales: View and Land & title: View, tick Documents: Create; the bar reads "3 changes · applies to nobody yet"; **Save**; toast with **Undo** (Undo restores, then redo).
  - Two-step locked when Finance: Edit is ticked.
  - **Preview this role** is disabled while dirty; after saving, Home as Site engineer shows Projects and Documents only; **Stop preview**.
  - Team → give the role to the fixture member (custom roles under a divider). That member's **next click** shows the new sidebar, with no sign-out.
  - Delete when held → "Move 1 person to another role first" linking to the Team filter. After moving them, **Delete Site engineer** removes it from the Team role menu.
  - The duplicate-name error.
  - **Two tabs editing one role:** the second save shows "… changed Site engineer a moment ago" with **Reload**.
  - **Role-editor fixture** (custom role with Settings create and edit, without Finance): Finance cells disabled; the Admin row on Team read-only with "can do things you can't"; Admin absent from its role menus.
  - A member holding a custom role opens its page: read-only, "You have this role…".
  - Keyboard: Tab and Space on the grid, ⌘S saves, Esc closes the dialog, `n` opens New role.
  - 375 px: the module sheet of switches, and the save bar above the tabs.
  - axe on the role list, the role page and the dialog.
- **Existing specs:** update their "Entity" selectors and keep them green. `setup-checklist.spec.ts` covers "We only have one company" with Undo, and that adding a second company ticks it.

## 10. Seed (`apps/api/src/db/seed.ts`, idempotent upserts)
- **Vento Homes Ltd:**
  - **Custom role "Site engineer"**, made from Project manager:
    - Projects full; Documents view and create; Facility view; Compliance view; no Land, no Sales.
    - `requiresTwoStep: false`; description "Based on Project manager".
    - Held by a new member, **Bayo Ogunleye** (`bayo@ventohomes.ng`, limited to Parkview, active 1 day ago). The journey narrative's "Emeka" is **not** used in the seed, because Emeka Nwosu is the removed member.
  - **Custom role "Auditor"**: every module View, Settings View, no Approve, no two-step. **Nobody holds it**, so Delete role is offered, and it gives a ready Settings: View-only role for manual read-only checks.
  - **An archived company, "Ikoyi Crest SPV Ltd"** (SPV, RC 1832276, no TIN), archived 30 days ago by Olumide Bankole, with its `entity.archived` audit row. It shows the Archived chip, "Archived … by …" and the RC clash with **Restore it instead**.
  - The checklist's `other_companies` reads done ("4 companies").
- **Lekki Partners Ltd** (already Starter, at 2 of 2 active companies): unchanged. It is the "owner at the company limit" demo: **Add company** opens the plan message for its owner.
- The seed upserts custom roles by `(organization_id, lower(name)) where archived_at is null`, and their permissions by delete plus insert (as `syncSystemRoles`).
- The seed summary log lists the two custom roles and the archived company.

## 11. Build order
1. **Shared contract, schemas and `role-rules.ts` with tests** (backend lead, about half a day). This unblocks both tracks; the web can mock procedures from the contract types.
2. **In parallel:**
   - **Backend:**
     1. Migrations 0007 and 0008 and the error mapping.
     2. `requireAllEntities`, then the manage-rules ceiling and its exhaustive tests.
     3. Roles service and router (create, update, delete, list flags, holder counts).
     4. Entities changes (list, RC clash data, archived read-only, preview names, restore).
     5. Organization `answerSingleCompany`, the checklist item and `me.canAddCompany`.
     6. Members, invitations and team changes (role lock, ceiling, row permissions).
     7. The copy pass in server messages and `limit-words`.
     8. The isolation, matrix and procedure-guard tests, then the seed and e2e fixtures.
   - **Frontend:**
     1. Sections, routes and the `orgWide` flags.
     2. `use-unsaved-guard`, then the Organization page.
     3. `company-fields` extraction (onboarding still passes its tests), the Company sheet overlay and the plan dialog.
     4. The Companies page, then the switcher changes and the "No company" card.
     5. The permissions grid, mobile list and draft hook (against `DEFAULT_ROLES` fixtures), then the role page and save bar, the roles list, and the New role and delete dialogs.
     6. The Team role menus.
     7. Checklist and ⌘K.
     8. **The copy pass**, as one commit with the selector updates.
3. **Integrate** against the real API and the seed. The **tester** writes the two e2e journeys and updates the existing specs. The **reviewer** and **ui-designer** check (excellence checklist, dark mode, 375 px, axe). Then bundle numbers, `CHANGES.md` and the owner's hands-on review.

## 12. Docs (in the same PR)
- **`docs/DOMAIN.md`:** the spec's "Domain changes" are **applied with this plan**. At build, add "Lock order: organization → member/invitation → role → plan row" to ARCHITECTURE, not to DOMAIN.
- **`docs/decisions/0018-…`:** **committed with this plan**, plus its README row.
- **`docs/ARCHITECTURE.md`:**
  - `access/role-rules.ts` (shared) next to `manage-rules.ts`;
  - `requireAllEntities`;
  - the guard triggers;
  - the lock order;
  - "permission caches must key on `roles.version`";
  - the overlays `company` and `company-plan`.
- **`docs/design/SCREENS.md`:** the seven 3c rows to `built` or `pattern`; App shell and Team rows noted. **`CHANGES.md`:** the spec's departures, plus "head office state uses the native select" if question 7 stands.
- **`docs/journeys/01-onboarding-and-access.md`:**
  - J-ONB-07 and J-ONB-08 become `built`.
  - J-ONB-05 step 3 drops "(draft)".
  - J-ONB-02 and J-ONB-06 get the "Company access" wording.
  - J-ONB-01 step 7 gets the new item.
- **`docs/help/`:**
  - New articles: "Set up your organization and companies" and "Make a role that fits the job".
  - Existing getting-started articles: "entity" → "company".
- **`CHANGELOG.md`:** Organization, Companies, Roles & permissions, custom roles, and the "Company" wording.
- **`.claude/skills/ux-writing/SKILL.md`:** one line: never show "entity" to a user; say "company" (decision 0018).
- **`docs/specs/README.md`:** this spec's row is `planned`.

## 13. Risks
- **R1. A limit made only of archived companies reading as "all companies".**
  - Today `entity_ids` comes from `array_agg` over *all* limit rows, so it is never null for a limited member.
  - Anyone who later "optimises" it to active entities only would turn a "No company" member into an all-companies member.
  - Mitigations: a test pins it, and a comment goes in `loadMembership`. Module services must intersect with active entities themselves where that matters (question 8).
- **R2. The ceiling locks custom admins out of their own work.**
  - A custom "Office manager" with Settings edit but no Finance can't touch Admin or Finance people, and can't save a role that includes Finance.
  - That is the intent (spec question 3). The read-only lines say who to ask.
- **R3. Lock ordering.**
  - New locks: role row `for share` / `for update`, and organization before plan in restore.
  - Mitigations: the order is documented and the concurrency tests cover both new pairs.
- **R4. A future built-in role whose name clashes with a custom role.**
  - `syncSystemRoles` would hit the partial unique index and the migration would fail.
  - Mitigation: when a brick adds a built-in, its migration renames clashing custom roles to "{name} (custom)" first. The test in section 8 makes the failure loud rather than silent.
- **R5. Stale web caches after a role change.**
  - The holder's next *request* uses the new permissions. Their sidebar follows when `me` refetches: on focus, on navigation via the existing live module re-check, or on a 403.
  - A page they still have open may show buttons that the server now refuses with the normal 403 message. This is acceptable and already the 3a behaviour.
- **R6. The copy pass touches many files and selectors.** One commit, a grep checklist (`entit` in visible strings), and the full e2e run before the PR.
- **R7. Bundle growth on Home.**
  - Guarded by `bundle-check.mjs` and the new rule that `role-rules` must not reach the entry chunk.
  - The switcher menu and sheet stay lazy.
- **R8. Trigger errors leaking to users.** The services check first. The mapping in `lib/errors.ts` turns any trigger hit into the same CONFLICT copy, and the tests exercise both paths.
- **R9. The audit trail as the only checker until brick 4.**
  - A rogue admin can make a wide custom role and give it.
  - This is no worse than giving Admin today (spec question 5). Brick 4's approval rule closes it.

## 14. Plan questions (recommendations in bold)
1. **Editing a role that can do more than you.** The spec says a saved role must stay within the editor's permissions, but not what the page shows when the role is already wider (for example an "Office manager" with Settings edit opening "Finance lead"). **Recommended: read-only, with "Finance lead can do things you can't. Ask Olumide Bankole (owner) to change it."**, matching the Team rule. The alternative is editable with the extra cells locked, but then a save must keep actions the editor can't see change, which is confusing.
2. **Roles beyond your permissions in role menus (Team, invite).** **Recommended: hidden**, like Owner for non-owners today. The roles list still shows every role. The alternative is listed but disabled with a reason, which is noisier and offers something you can't do.
3. **Ceiling on resend.** The spec lists change, reset, remove and withdraw. Resending re-issues a grant. **Recommended: yes, resend is refused for an invitation whose role is wider than yours** (`wider_permissions`).
4. **Which invitations block deleting a role.** **Recommended: every pending invitation, expired ones included**, because they're still on Team and can be resent. The role list counts them in "· 1 invited". Withdrawing them frees the role.
5. **Database guard triggers** for "no active member or pending invitation on an archived role". **Recommended: yes.** It's cheap, matches the `0001_access_guards` last-owner trigger, and protects against a future code path that forgets the lock.
6. **Who archived a company:** a column (`archived_by_user_id`, backfilled from audit) rather than reading the audit trail on every list. **Recommended: column**, like `members.removed_by_user_id` in 3b.
7. **Head office state control.** The spec says "searchable select". **Recommended: reuse the onboarding native select** (37 options, type-ahead on desktop, the phone's own picker on mobile, no new chunk weight), logged in `CHANGES.md`. A Popover plus Command combobox would add about 6 KB to the Organization chunk for little gain.
8. **Data of an archived company for members limited to it.** 3c has no company-owned records, so nothing leaks today. **Recommended: decide per module** (the Finance spec first). The default rule to write into those specs: "records of an archived company stay visible read-only to all-companies members, and members limited only to it see nothing". Noted in `DOMAIN.md` once Finance confirms.
9. **Onboarding copy.** The decision says every screen, so onboarding's "First entity" and "Entity name" become **"First company" / "Company name"**, and onboarding shares the new `company-fields.tsx`. **Recommended: yes, in this brick.**
10. **`me.canAddCompany` versus deriving it on the web.** The web could compute it from `me.member`. **Recommended: keep the server field** as the spec says, so a later rule (for example a plan or approval condition) has one home. The web still ANDs it with the preview permissions.
