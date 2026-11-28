# Plan: Land & title, slice 2 (encumbrances)

- **Status:** approved (owner, 28 Nov 2026): all eight §13 questions answered as recommended.
- **Spec:** [docs/specs/land-and-title.md](../specs/land-and-title.md) (approved 27 Nov 2026). Slice 2 rows, *Encumbrance*, *Approvals*, acceptance criteria "Encumbrances (slice 2)", and the archive criterion under Parcels.
- **Journey:** J-LND-03 (rewritten, §12).
- **Branch:** `feat/land-encumbrances`, from `feat/land-web` (PR #13), or from `main` once #11–#13 merge. Migrations continue from `0021_land_guards.sql`; renumber if `main` moves first.
- **Decision records:** 0026 *An approvable action can require a rule* and 0027 *The sales block is a rule, not a stored status* (drafted in §6).
- **Written:** 28 Nov 2026 by the architect.

## 1. Summary

**The jobs:**
- Ngozi records a court order, caveat, lien, family dispute or mortgage on a parcel in 3 clicks plus typing. From the moment it is saved, the parcel is blocked for new sales. That is a server rule, in the same transaction.
- Clearing one takes 3 clicks plus the evidence. It goes to the approvals engine as **Clear an encumbrance**: Land & legal, Finance or Admin first, then Owner. Nothing unblocks until the last approval.
- Olumide (MD) sees blocked parcels on his Home. Owners are emailed when an encumbrance is recorded.

**What slice 2 ships:**
- An `encumbrances` table and its state machine (`active → cleared`, cleared only by the approval's `execute`).
- The **sales-block rule** that Projects and Sales will call.
- Record, edit and ask-to-clear procedures.
- A new approvable action and its default rule, written for every organization. Finance gets Approve in Land & title.
- Evidence kept in the existing document vault, as type `encumbrance_evidence`.
- Archiving refused while an encumbrance is active.
- The list's *Encumbrance* column, *Encumbered* chip and "N blocked" in the subtitle.
- On the parcel page: the rose or amber banner, an *Encumbered* badge, an *Encumbrances* tab, the add, edit and clear sheets, and a "Waiting for approval" line with **Cancel request**.
- Land & legal Home: the *Encumbrances blocking sales* tile, the *Encumbrances* panel and the next-date queue item. MD Home: a *Needs attention* item.
- ⌘K **Add encumbrance** on a parcel page.
- An email to owners, seed data and J-LND-03.

**Not in this slice (spec):**
- Linked-unit counts and refusing reservations. Projects and Sales call the rule when they ship.
- Notifications panel, WhatsApp, and any ledger effect.
- **No titling block:** a parcel with a court order can still become `titled`, because the registry doesn't stop. Only archiving is refused.

**Codebase facts that shaped the design:**
- The engine already has everything clearing needs except two things. A no-rule action runs at once today (decision 0024), and catalog actions carry no feature key, so Approval rules lists every action whether or not the organization has the feature.
- The approval summary has no field the approve button can read the encumbrance type from, so `approveLabel` can't say "Clear caveat and unblock sales" without a small addition.
- Approved files that aren't attached are deleted after 24 h (`pnpm files sweep`), but requests live for 7 days. So clearance evidence must be attached when the request is sent, not when it's approved.
- Built-in roles are never edited by customers. They come from `DEFAULT_ROLES` via `syncSystemRoles`, so Finance's new permission is a default-table change plus a backfill migration.
- Home's first load is 199.3 of 200 KB (`pnpm bundle:check`). Land code reaches Home only through `features/land/home/land-home-lazy.tsx`.
- Neither the web nor `land.ts` reserves a banner slot. The banner's data arrives in `land.parcels.get`, so it renders with the page (no layout shift).

---

## 2. Data model

### Encumbrance state machine
```
(record) ──▶ active ──[last approval of "Clear an encumbrance", in that transaction]──▶ cleared
active: details editable (not type, not blocks_sales, not evidence link); blocks sales if blocks_sales
active + a pending clearing request: still active, still blocks; details locked (open question 2)
cleared: frozen forever (DB trigger); no delete, no "un-clear"; recorded in error = clear with that note
```

**Invariants (each held by the DB and by the service):**
- `blocks_sales` is true unless the type is `mortgage`, and fixed after insert.
- `type`, `parcel_id` and `evidence_document_id` are fixed.
- `cleared` ⇔ `cleared_on`, `clearance_document_id` and `cleared_at` are set.
- `cleared_on ≥ served_on`.
- No row is ever deleted.
- An encumbrance can't be recorded on an archived parcel, and a parcel can't be archived while one is active.
- At most one pending clearing request per encumbrance: the engine's partial unique index on `(subject_type, subject_id) where pending`.

**Ownership.** An encumbrance belongs to its parcel. Company scope comes through the parcel join, like stages and documents. There is no `entity_id` column, because the parcel can move between companies and the encumbrance follows it.

### The sales block (decision 0027)
- *A parcel is blocked while any of its encumbrances is `active` and `blocks_sales`.*
- It is computed from a partial index and never stored, so it can't drift.
- One module, `apps/api/src/modules/land/sales-block.ts`:
  - `blockedParcels(db, ctx, parcelIds) → Map<parcelId, { type, reference, others }>` for display.
  - `assertParcelsNotBlocked(tx, ctx, parcelIds)` for Projects and Sales. It locks the parcel rows `FOR SHARE`. Recording an encumbrance locks the parcel `FOR UPDATE` (the existing `loadParcel(..., { lock: true })`), so a reservation and a new court order on the same parcel run one after the other. On a block it throws CONFLICT `sales_blocked`: "Court order FHC/L/CS/1182/2026 blocks new sales on Plot 22, Folu Ayo."
- `parcelBlockedSql` is a SQL `exists` fragment for lists and Home.
- There are no callers in this slice apart from land itself and the tests. The Sales spec must say that reservations and subscriptions call `assertParcelsNotBlocked` for every parcel of the unit's project (spec open question 3).

### Severity (shared, no zod: `packages/shared/src/land/encumbrance.ts`)
- `ENCUMBRANCE_TYPES = ['court_order','caveat','family_dispute','lien','mortgage']` in severity order (spec).
- Labels ("Court order") and mid-sentence words ("court order").
- `alwaysBlocks(type) = type !== 'mortgage'`.
- `mostSerious(list)`: blocking ones first, then by severity, then oldest `served_on`.
- `nextDateLabel(type)`: "Hearing" for a court order, else "Next date".
- `NEXT_DATE_WINDOW_DAYS = 30`. This is a product setting, not a statutory number, so a constant is fine. Nothing in this slice is a statutory rate or threshold (nigeria-compliance).

### Evidence lives in the vault
- New document type `encumbrance_evidence` (`multiple: true`, `stageType: null`, label "Encumbrance evidence"). It reuses versions, preview, download, the audited 5-minute links, and remove-with-reason.
- Each encumbrance has two named documents:
  - **evidence**, created when recording, named `"{Type} · {reference}"`, or `"{Type} · {served date}"` without a reference;
  - **clearance**, created when clearing is requested, named `"Clearance · {same suffix}"`.
  The server appends " (2)" when a name is taken, so two caveats never share a document. Names are capped at 80 characters (existing check).
- A better scan of either is uploaded through the vault's **Upload as v2**. `land.documents.upload` refuses to create a *new* `encumbrance_evidence` document ("Add evidence from the encumbrance."), and the web type pickers leave the type out.
- Remove guard: the only kept version of a document an encumbrance points at can't be removed. "This is the evidence for the caveat. Upload the right file first." This mirrors `evidence_for_granted`.

---

## 3. Tables and migrations

### `encumbrances` (`apps/api/src/db/schema/encumbrances.ts`; `land.ts` stays slice 1's)

| Column | Type / rule |
|---|---|
| `id` | `id()` |
| `organizationId` | NOT NULL, FK |
| `parcelId` | NOT NULL, composite FK `(organization_id, parcel_id) → parcels` |
| `type` | pgEnum `encumbrance_type` (5 values) |
| `status` | pgEnum `encumbrance_status` = `active \| cleared`, default `active` |
| `blocksSales` | boolean NOT NULL |
| `claimant` | text NOT NULL, 2..200 ("Claimant or holder"; personal data, never logged) |
| `servedOn` | date NOT NULL ("Date served or lodged"; ≤ Lagos today, checked in the service) |
| `reference` | text, null (suit number, caveat number) |
| `lawyer` | text, null |
| `nextOn` | date, null (hearing or next date; may be past, see §7) |
| `notes` | text, null, ≤ 2000 |
| `evidenceDocumentId` | uuid NOT NULL, FK `(organization_id, parcel_id, evidence_document_id) → title_documents(organization_id, parcel_id, id)` |
| `recordedByUserId` | FK users, restrict |
| `clearedOn` | date, null |
| `clearanceDocumentId` | uuid, null, same composite FK as evidence |
| `clearanceNote` | text, null, ≤ 1000 |
| `clearedAt` | timestamptz, null |
| `clearedByUserId` | FK users, null (the maker; approvers are in the audit) |
| `version` | int, default 1 |
| timestamps | standard |

Constraints:
- `unique(organization_id, id)`, plus `unique(organization_id, parcel_id, id)` for future same-parcel references.
- check `encumbrances_mortgage_choice`: `type::text = 'mortgage' or blocks_sales`.
- check `encumbrances_cleared_consistent`: all of `cleared_on`, `clearance_document_id`, `cleared_at` and `cleared_by_user_id` are null while active, and all set when cleared.
- check `cleared_on is null or cleared_on >= served_on`.
- check `claimant` length, check `version >= 1`.

Indexes:
- `(org, parcel_id)`.
- `encumbrances_blocking_idx (org, parcel_id) where status = 'active' and blocks_sales`. The rule, the list filter and the tile all use it.
- `(org, next_on) where status = 'active' and next_on is not null` for the queue.
- `(org, served_on) where status = 'active'` for "Oldest since" and the panel.
- `evidence_document_id`, `clearance_document_id`, `recorded_by_user_id`, `cleared_by_user_id`.

### Changes to `title_documents`
- Enum `title_document_type` gets `encumbrance_evidence` (`ALTER TYPE … ADD VALUE`).
- New `unique(organization_id, parcel_id, id)` (`title_documents_org_parcel_id_unique`). The table is small, so a plain index is fine.
- `title_documents_single_unnamed` is dropped and re-created with `encumbrance_evidence` in the named list. New check `type::text <> 'encumbrance_evidence' or name is not null`.
- **Migration safety:** both checks compare `type::text`, never the enum literal. Postgres refuses "unsafe use of new value" for a value added in the same transaction. drizzle-kit's migrator should apply every pending migration in one transaction (verify), so separate files don't help. Test `pnpm db:migrate` from a database at 0021.

### Migrations
- `0022_encumbrances.sql` (generated): the enums, the table, the enum value, the `title_documents` unique and checks. Read the SQL (db-migration skill) and make sure the check rewrite is a drop and add of the constraint only.
- `0023_encumbrances_guards.sql` (`--custom`), triggers raising `check_violation` with the constraint named:
  - `encumbrances` refuses DELETE.
  - UPDATE of `organization_id`, `parcel_id`, `type`, `blocks_sales`, `evidence_document_id`, `recorded_by_user_id` or `created_at` is refused.
  - `status` may only go `active → cleared`, and a `cleared` row refuses every UPDATE.
  - INSERT on an archived parcel is refused.
  - `parcels` refuses setting `archived_at` while an active encumbrance exists. This backs up the service check; both paths lock the parcel row.
  - Add the guard names to `GuardName` in `apps/api/src/lib/errors.ts`.
- `0024_encumbrance_clear_rule.sql` (`--custom`, the 0017 pattern):
  - (a) For every organization with an active owner and no rule for `land.encumbrance.clear`: one all-company rule, *Any* amount, step 1 roles `land_legal`, `finance`, `admin`, step 2 `owner`, created by the first owner.
  - (b) `insert into role_permissions … ('land','approve')` for every built-in `finance` role, `on conflict do nothing`, and bump that role's `version`.
  - Finance already requires two-step, so 0017's two-step rule holds.
  - New organizations get both from `syncSystemRoles` and `seedDefaultRules`, which read the catalog.

---

## 4. oRPC contract (`packages/shared/src/land/encumbrance-schema.ts`, `contract.ts`)

All on `forFeature('land')`. Inputs are `strictObject`, so `status`, `type` or `blocksSales` sent to update is BAD_REQUEST.

| Procedure | Input (sketch) | Output | Errors |
|---|---|---|---|
| `land.encumbrances.record` | `{ parcelId, type, blocksSales: boolean, claimant, servedOn, reference?, lawyer?, nextOn?, notes?, evidence: { fileId } }` | `parcelDetail` | BAD_REQUEST: evidence missing ("Attach the court order, caveat or other evidence."), `blocks_required` for a non-mortgage with false ("A court order always blocks sales."), `future_date`, `file_unavailable`. CONFLICT `parcel_archived`, `entity_archived`. NOT_FOUND |
| `land.encumbrances.update` | `{ id, expectedVersion, claimant?, servedOn?, reference?, lawyer?, nextOn?, notes? }` | `parcelDetail` | CONFLICT `stale` (names the updater), `clearing_pending` ("A request to clear this caveat is waiting. Cancel it to change the details."), `encumbrance_cleared`, `parcel_archived`, `entity_archived`. BAD_REQUEST `future_date`. NOT_FOUND |
| `land.encumbrances.requestClear` | `{ id, expectedVersion, clearedOn, evidence: { fileId }, note?, reason }` | `{ parcel: parcelDetail, notice, pendingRequestId: id \| null }` | BAD_REQUEST `future_date`, `cleared_before_served` ("Enter a date on or after 4 Nov 2026."), `reason_required`, `file_unavailable`. CONFLICT `approval_pending` (requestId; "There's already a request waiting for this. Open it"), `no_approver`, `no_rule` (§6), `stale`, `encumbrance_cleared`, `parcel_archived`, `entity_archived`. NOT_FOUND |
| `land.blockers` | `{ entityId? }` | `{ items: [{ parcelId, parcelName, type, reference, others, since: isoDate }] (≤ 10), total }` | NOT_FOUND (feature) |

Changed slice-1 shapes:
- `listParcelsInput.filter` adds `'encumbered'`: not archived and any **active** encumbrance (open question 5). `listParcelsOutput.summary` adds `blocked: int`.
- `parcelRow` adds `encumbrance: { blocked: boolean, top: { type, blocksSales, claimant }, count } | null` (active only). It is batch-loaded for the page, like `stageSummaries`, with no N+1.
- `parcelDetail` adds:
  - `blocked: boolean`;
  - `encumbrances: encumbrance[]`, active first by `mostSerious`, then cleared newest first. Not paginated, because the list is bounded in practice;
  - `can.record` (land.create) and `can.clear` (land.edit and land.create, since clearing needs an upload);
  - each `encumbrance`: `{ id, type, status, blocksSales, claimant, servedOn, reference, lawyer, nextOn, notes, version, recordedBy {name}, evidence: titleDocument, clearance: { clearedOn, note, clearedAt, document: titleDocument } | null, pendingClear: PendingApproval | null }`. `pendingClear` comes from the existing `pendingApprovals()`, one query for all ids.
- `landHome` adds:
  - `encumbrances: { blockedParcels, oldestBlockingSince: isoDate | null, byEntity: [{ entityId, name, count }], activeCount, active: [{ id, parcelId, parcelName, type, blocksSales, claimant, servedOn, nextOn }] (≤ 5) }`;
  - `landQueueItem` becomes a discriminated union on `kind`, with a new `'next_date'` variant: `{ encumbranceId, encumbranceType, parcelId, parcelName, due, days }`.
- `common/errors.ts`: the new `BadRequestReason` and `ConflictReason` values, plus `encumbered` on `land.parcels.archive` ("Clear the caveat before archiving this parcel.", naming the most serious active type).
- `documents.upload`: BAD_REQUEST `evidence_from_encumbrance` for a new `encumbrance_evidence` document. `documents.removeVersion`: CONFLICT `evidence_for_encumbrance`.

---

## 5. Permissions

| Procedure | Module × action | Default roles |
|---|---|---|
| `encumbrances.record` | land.create ("record encumbrances") | Owner, Admin, Land & legal |
| `encumbrances.update` | land.edit ("edit encumbrances") | Owner, Admin, Land & legal |
| `encumbrances.requestClear` | land.edit ("clear encumbrances"); the evidence upload also needs land.create, as in the stage sheet | Owner, Admin, Land & legal |
| Approve a clearing request | land.approve **and** a role named in the request's current step **and** company access (engine) | Owner, Admin, Land & legal, **Finance (new)** |
| `land.blockers`, `encumbrances` in get, list, home | land.view | Owner, Admin, Land & legal, PM, Sales, Finance, Viewer |

- **Company scope:** every read and write goes through `parcelScope` (the parcel join). Another company's encumbrance id is NOT_FOUND. A pending request carries the parcel's company, so only approvers with access to that company are eligible (engine).
- **`DEFAULT_ROLES`:** Finance's `land` level goes from `view` to `viewApprove` (spec open question 1). Its other Land rights stay View. The role page and the module lines update from the table.
- **Owner emails** go to active owners whose company access includes the parcel's company (all companies, or that one).

---

## 6. Audit and approvals

### Audit (`packages/shared/src/audit/actions.ts`, `labels.ts`, `FIELD_LABELS`)
- `land.encumbrance.recorded`, `land.encumbrance.updated` (before and after of the editable fields) and `land.encumbrance.cleared` (with `approvalMetadata(meta)`: approvers in order and the request id).
- Like every slice-1 event, they target `{ type: 'parcel', id, label }`. Metadata: `entityId`, `encumbranceId`, `encumbranceType`, `blocksSales`, `documentId`, `versionId`. Evidence files also write the existing `land.document.uploaded`.
- The engine's `approval.*` events target the subject `{ type: 'encumbrance', id }`. `land.parcels.activity` therefore also reads events targeting this parcel's encumbrance ids (still on `audit_events_org_target_idx`), so the parcel's Activity shows "Ngozi Adeyemi asked to clear the caveat", "Aisha Bello approved step 1" and so on.
- `audit-read.service.ts` `recordLink`: `'encumbrance'` resolves to `/land/{parcelId}?tab=encumbrances`, with one batch lookup per page.

### Approvable action `land.encumbrance.clear`
**Catalog** (`packages/shared/src/approvals/catalog.ts`):

| Field | Value |
|---|---|
| `module` | `'land'` |
| `feature` | `'land'` (new field, below) |
| `label` / `chip` | "Clear an encumbrance" / "Land" |
| `hasAmount` / `irreversible` | false / false |
| `whenNoApprover` | `'refuse'` |
| `whenNoRule` | `'refuse'` (new field, decision 0026) |
| `extraCondition` / `rulesFrom` | null / null |
| `approveLabel` | `(s) => s.actionLabel ?? 'Clear encumbrance'` |
| `defaults` | `[{ minAmount: null, steps: [['land_legal','finance','admin'], ['owner']] }]` |

**Plug-in** (`apps/api/src/modules/land/approvals.ts`):
- `permission`: `{ land, edit }`.
- `payload`: `{ encumbranceId, version, parcelId, entityId, clearedOn, clearanceDocumentId, clearanceVersionId, note }`. No secrets.
- `subject`: `{ type: 'encumbrance', id }`.
- `describe`:
  - title "Clear caveat · Plot 22, Folu Ayo"; recordLabel "Caveat on Plot 22, Folu Ayo" (reads well in `staleMessage`); recordLink `/land/{parcelId}?tab=encumbrances`;
  - `entityId` = the parcel's company; amount null;
  - changes: *Status* Active → Cleared; *Cleared on* — → 14 Jan 2027; *Evidence* — → the file name; *Sales on this parcel* Blocked → Unblocked, or "Still blocked by the court order" when another blocking one remains;
  - `actionLabel` "Clear caveat and unblock sales", or "Clear mortgage" when it didn't block.
- `excluded`: none beyond the maker (spec).
- `execute` → `applyEncumbranceClear(tx, ctx, p, meta)` in `encumbrance-clear.ts`, the **only** writer of `cleared`:
  - lock the parcel (as the maker), then the encumbrance;
  - `StaleError` if it isn't active, if its version or the parcel's company changed, or if the clearance version was removed;
  - update, audit `land.encumbrance.cleared`, touch the parcel;
  - notice "Caveat cleared. Sales on Plot 22, Folu Ayo are unblocked." (or "…still blocked by the court order.").
- **Service** `requestClear`, in one transaction:
  1. lock the parcel and check it is writable;
  2. load the encumbrance (active, `expectedVersion`);
  3. check the dates;
  4. file the clearance evidence (`addVersion`, attaching the file so the 24 h sweep never deletes it);
  5. `requestOrRun(tx, ctx, encumbranceClearPlugin, { payload, reason })`.
  Any refusal (pending, no approver, no rule) rolls the document back. The router sends the engine's emails after commit (`sendAll`).
- Register it in `apps/api/src/approvals/registry.ts`.

### Engine changes (small, cross-module; PR 1's first commit)
1. **`ApprovalActionMeta.whenNoRule: 'run' | 'refuse'`.** Existing actions are `'run'`, so nothing changes for them.
   - `requestOrRun` with no matching rule and `'refuse'` throws CONFLICT `no_rule`: "Clearing an encumbrance needs an approval rule for Lekki Pearl Estates Ltd. Ask an owner to add one in Approval rules."
   - `previewApproval` returns `needed: true` with `blocked` set to that text, so the web says it before any upload.
   - The rules page shows the action's uncovered companies as a gap, using the existing gap display.
2. **`ApprovalActionMeta.feature: FeatureKey | null`.** `listRules`, the rule sheet's action list and the rules `create` input skip or refuse actions whose feature isn't in `ctx.features`. `access.*` are `null`.
3. **`approvalSummary.actionLabel`** becomes optional and nullable (older stored summaries still parse). `ApproveLabelInput` gains it.
4. **Tests:** `catalog.test.ts` covers the new fields, and `engine.test.ts` adds no-rule refuse and the preview block. `registry.test.ts` then demands `land/encumbrances.approvals.test.ts`.

### Draft decision record 0026
```
# 0026 · An approvable action can require a rule

- **Date:** 2026-11-28
- **Status:** proposed

## Context
Decision 0024 runs a guarded action at once when no rule matches, so owners can switch approvals
off. Clearing an encumbrance unblocks sales on land under a court order or caveat; the approved
spec says nothing unblocks it except the last approval. Deleting the rule, or narrowing it to some
companies, would let one person clear it in the others.

## Decision
- The approvals catalog gains `whenNoRule: 'run' | 'refuse'`. `run` keeps 0024's behaviour;
  `refuse` makes `requestOrRun` refuse (CONFLICT `no_rule`) and `approvals.preview` report it.
- `land.encumbrance.clear` is the first `refuse` action. Money actions that must never run on one
  person's say-so (receipt reversal, refunds, payroll, payments out) should declare it too.
- The rules page shows companies an action with `refuse` doesn't cover as a gap.
- The catalog also declares each action's feature, so rules for unavailable features stay hidden.

## Consequences
- Owners still choose who approves and in which order, but can't turn approval off for these.
- Every new action must choose `run` or `refuse`; the catalog test fails without it.
- An organization whose rule is deleted can't clear until an owner adds one (the message says so).

## Alternatives considered
- Forbid deleting the last rule for an action: doesn't cover company-limited rules, and the engine
  would still run at once if data drifted.
- Execute only when a request exists, inside the land plug-in: puts approval policy in a module,
  which 0024 avoided.
- Keep 0024 as is: contradicts the spec's success criterion and the purpose of 0006.
```

### Draft decision record 0027
```
# 0027 · The sales block is a rule, not a stored status

- **Date:** 2026-11-28
- **Status:** proposed

## Context
A court order, caveat, lien or family dispute (and a mortgage when chosen) must stop new sales on a
parcel's units from the moment it's recorded until clearing is approved. Units belong to projects,
projects sit on one or more parcels, and neither exists yet. DOMAIN said units become `blocked`.

## Decision
- A parcel is blocked while any of its encumbrances is active and blocks sales. Nothing stores
  it: `apps/api/src/modules/land/sales-block.ts` works it out from a partial index.
- Projects and Sales call `assertParcelsNotBlocked(tx, ctx, parcelIds)` before a reservation or a
  subscription (it locks the parcels FOR SHARE; recording an encumbrance locks the parcel FOR
  UPDATE), and `blockedParcels` to show it. Neither keeps its own copy or flag.
- A unit's own `blocked` status, if Sales keeps one, means "held back by the developer", never this.
- Existing subscriptions keep collecting; only new reservations and subscriptions are refused.

## Consequences
- Recording and clearing take effect everywhere in the same transaction, with nothing to resync.
- Every sell path must call the rule; review and the Sales tests check it.
- Showing "blocked" on many units costs one indexed query per page of parcels.

## Alternatives considered
- Set units to `blocked` when an encumbrance is recorded: has to be kept in sync with clearing,
  project links and new units, and units don't exist yet.
- A `blocked` flag on parcels: a second source of truth that triggers would have to maintain.
```

---

## 7. Role homes

Everything follows `?entity=`. Under *All companies* each tile has a per-company bar, and a limited member sees only their companies.

**Land & legal (`land_legal`):**
- **Tile.** Replace "Active encumbrances" (`home-kpis.ts`, currently "—") with **Encumbrances blocking sales**, `live: 'land_encumbrances'`. It keeps its slot after *Titles in progress* (board order; logged in CHANGES).
  - Value: blocked parcels. Line: "Oldest since 4 Nov 2026", or "Nothing blocks sales" at 0. Before any parcel: "Add your first parcel".
  - Opens `/land?filter=encumbered`. Sales later turns it into *Units blocked* with ₦ value.
- **Queue item** `next_date` (land.edit), for active encumbrances with `next_on ≤ today + 30`:
  - "Hearing on 14 Jan · court order on Plot 22", or "Next date 20 Dec · caveat on Idu family land", with action **Open parcel** (`?tab=encumbrances`).
  - A date already passed stays as "Hearing was on 14 Jan · set the next date" until it's updated (open question 6).
  - It is a blocker when the encumbrance blocks sales: rose, and it sorts first on a due tie.
  - One more bounded query in `queueOf`'s union, within the same 20-item limit.
- **Encumbrances panel** (`HomePanel`, under *Title pipeline* in the right column):
  - up to 5 active, blocking ones first then by next date;
  - each row: "Court order · Plot 22"; "Blocks sales" or "Doesn't block sales"; "Hearing 14 Jan", or "Lodged Sep 2026" without a next date;
  - "See all {n}" opens the Encumbered list. Empty: "No claims on any parcel."

**MD / owner (executive home), *Needs attention*:**
- One item per blocked parcel: "Court order blocks sales on Plot 22, Folu Ayo" (blocker), "and 1 more" when several, due = `since`, action **Review** (`/land/{id}?tab=encumbrances`).
- Source: `land.blockers`. Shown to owners and admins with land.view (open question 4).
- It leaves when the parcel is unblocked. No tick-off, as in slice 1.

**Home first-load budget (199.3 / 200 KB): slice 2 adds no static import to Home.**
- `home-page.tsx`: the `kpi.live === 'land_titles' ? <LazyTitlesTile …>` branch becomes `kpi.live ? <LazyLandTile live={kpi.live} …>`, a net few bytes. Everything that renders encumbrances is in the existing lazy `features/land/home/land-home.ts` chunk:
  - `LandTile` switches between the titles and encumbrances tiles;
  - `LandHomeSection` picks Land & legal or executive content from the role inside the chunk;
  - `ExecutiveLandQueue`.
- `land-home-lazy.tsx` changes one picker (`m.LandTile`). `showsLandSection` and `needsLandHome` widen to the owner and admin roles (a few bytes in `home-kpis.ts`). Expected change: about +0.2 KB.
- The Home loader prefetches `land.home` and, for executive roles, `land.blockers` through `land-home-prefetch.ts` (already lazy).
- `bundle-check.mjs` FORBIDDEN gains `features/land/detail/` and `features/land/home/encumbrances-` so a stray static import fails CI.
- **If `pnpm bundle:check` still exceeds 200 KB**, trim in this order and report the numbers before and after (performance skill):
  1. lazy-load `HomeChecklist`, prefetched by the Home loader only for owners and admins, the only people who see it;
  2. lazy-load `TrialLine` (shown only during a trial).

---

## 8. Web

**Address.**
- `parcel-search.ts`:
  - `PARCEL_TABS` adds `'encumbrances'` (desktop: a tab beside Documents in the main card, activity still the side column; below 1024 px: Documents · Encumbrances · Activity);
  - `PARCEL_SHEETS` adds `'encumbrance'` (add), `'encumbrance-edit'` and `'clear'`, with `enc=<id>` for the last two. Back closes them.
- `parcels-search.ts`: `PARCEL_FILTER_VALUES` adds `'encumbered'` (the test already expects it).

**Screens**

| Screen | Board | Build from |
|---|---|---|
| Parcels list | LandTitle, LandTitleMobile | **Encumbrance** column after *Title stage*: rose `StatusBadge` "Court order" / "Caveat + 1", amber "Mortgaged to Sterling Bank" for a non-blocking mortgage, muted "None". Chip **Encumbered**. Subtitle "6 parcels · 45.00 ha · 1 blocked by encumbrances" (`parcelsSummaryLine`). Cards show the badge under the stage. |
| Parcel header | ParcelDetail | Rose **Encumbered** badge beside the status (amber "Mortgaged" when nothing blocks). ⋯ menu: **Add encumbrance**. **Archive** is disabled with "Clear the caveat first" while one is active (the server refuses too). |
| Encumbrance banner (between header and tracker) | ParcelDetail | `encumbrance-banner.tsx`. Rose: "Court order FHC/L/CS/1182/2026 · New sales on this parcel's units are blocked until it's cleared. Hearing: 14 Jan 2027." (+ "and 2 more" linking to the tab), **Clear** (`can.clear`). Amber: "Mortgaged to Sterling Bank · sales aren't blocked". While a request waits, the shared `WaitingForApproval` (new optional `detail` prop) shows "Clearing waiting for approval by Finance · Requested 2 h ago · sales stay blocked until it's approved" with **Cancel request** (maker). "See the request" shows only to the maker or a viewer with land.approve. Data comes in `parcels.get`, so there is no layout shift. |
| Encumbrances tab | ParcelDetail (enc tab) | Card per encumbrance: type badge, claimant, dates, reference, lawyer, evidence (Preview and Download through `use-document-link`), **Edit** and **Clear** on active ones, and the cleared ones below ("Cleared 14 Jan 2027 · approved by Aisha Bello, Olumide Bankole"). Empty: "No claims recorded on this parcel." → **Add encumbrance**. |
| Add encumbrance | EncumbranceAdd, EncumbranceMobile | Side sheet, full screen on phones. **Type** (no default), **Claimant or holder**, **Date served or lodged** (today), **Reference**, **Evidence** (`FileDrop`, one file, required, uploads on drop), **Lawyer** (pre-filled with the last one used in the organization), **Next date** (labelled *Hearing* for a court order), *More options*: Notes. **Block sales on this parcel's units**: locked on with "A court order always blocks sales." (type word varies); for a mortgage a switch, off. Primary **Record and block sales** / **Record mortgage**. Toast "Caveat recorded. Sales on this parcel are blocked." / "Mortgage recorded". |
| Edit encumbrance | – (`pattern`) | Same sheet without Type, Block or Evidence (shown read-only, with "Upload a better copy in Documents"). Refused while clearing waits (banner copy). |
| Clear encumbrance | EncumbranceClear | Sheet: the encumbrance ("Court order FHC/L/CS/1182/2026 · since 4 Nov 2026"), **Cleared on** (today), **Evidence of clearance** (required), **Note** (with a quiet "Recorded in error" chip that fills it). Who approves comes from `approvals.preview`: "{chain} Sales unblock once it's approved." (mortgage: no second sentence). `preview.blocked` (no approver or no rule) shows as an alert and disables sending. **Send for approval** opens the shared `SendForApprovalSheet` (*Why?*) → **Send for approval**. Toast is the engine's notice ("Sent to Aisha Bello for approval"). |
| Documents tab | ParcelDetail | Encumbrance evidence rows show stage "Encumbrance". The upload type pickers leave out `encumbrance_evidence`. |
| ⌘K | – | **Add encumbrance** on a parcel's page (`parcel-commands.tsx`, like **Update title stage**), for `land.create`. |
| Land & legal home additions | HomeLand, HomeLandMobile | `encumbrances-tile.tsx` (StatCard), `encumbrances-panel.tsx` (HomePanel), queue rows via `land-queue.ts`. |
| Executive *Needs attention* | ExecutiveHome | `executive-land-queue.tsx` using `HomeQueue`. Empty: board's "Nothing needs you right now." |
| Email: encumbrance recorded | – (EmailApproval layout) | `pattern`. |

**States everywhere:**
- Skeletons in the final layout, and inline errors with Retry.
- Offline disables Record, Save and Send with the slice-1 line, and form input is kept.
- An archived parcel or company is read-only (no Add or Clear).
- 375 px: full-screen sheets, 44 px targets, the banner stacks with **Clear** full width.
- Dark mode, tokens only. Rose and amber use the existing `status-rose-*` and `status-amber-*` tokens.

**Performance:** the three sheets load in one lazy chunk (`encumbrance-sheet-lazy.tsx`), preloaded on intent like `parcel-actions-lazy.tsx`. The per-route chunk stays ≤ 80 KB; report the size.

---

## 9. Seed (golden thread), `apps/api/src/db/seed-land-encumbrances.ts`

Called from `seed-land.ts`. It is idempotent: skip a parcel that already has an encumbrance. It uses the existing sample-file generator ("Fictional sample · not a real document").

| Parcel | Seed |
|---|---|
| **P-0012 Plot 22, Folu Ayo** | Caveat by the "Ogunleye family" (fictional), lodged in 2025 with evidence. Then the **real services run in order**: Ngozi `requestClear` (withdrawal letter, reason "Family withdrew the caveat"), Aisha decides step 1, Olumide step 2. The request, decisions, audit and `cleared` state are exactly what the engine writes, dated at seed time. |
| **P-0015 Parkview Block B** | Mortgage to Sterling Bank, `blocksSales` false, reference "Construction facility", lodged Mar 2026. |
| **P-0018 Idu family land** | Active caveat (blocking), claimant "Okafor family" (fictional), next date today + 12, so the queue and the MD item show. |

- The default rule comes from `seedDefaultRules`, and Finance's Approve from `syncSystemRoles`.
- The subtitle reads "6 parcels · 45.00 ha · 1 blocked by encumbrances".
- `e2e-fixtures.ts`'s `land` command can reset P-0012 to "no active encumbrance" for the J-LND-03 spec.

---

## 10. File-by-file change list, in build order

**PR 1: Encumbrances API, engine tweak, seed (no screens)**
- `docs/decisions/0026-an-approvable-action-can-require-a-rule.md`, `0027-the-sales-block-is-a-rule.md`; `docs/decisions/README.md`.
- `packages/shared/src/approvals/catalog.ts` (`whenNoRule`, `feature`, new key), `schema.ts` (`actionLabel`), `copy.ts` (no-rule message), `catalog.test.ts`.
- `apps/api/src/approvals/engine.ts` (no-rule refuse), `apps/api/src/modules/approvals/approvals.service.ts` (preview), `apps/api/src/modules/approval-rules/approval-rules.service.ts` (feature filter, gaps), `engine.test.ts`.
- `packages/shared/src/access/default-roles.ts` (Finance land `viewApprove`).
- `packages/shared/src/land/encumbrance.ts` (+ test), `encumbrance-schema.ts` (+ test), `catalog.ts` (`encumbrance_evidence`), `schema.ts` (row, detail, home, filter), `contract.ts`, `index.ts`; `common/errors.ts`; `audit/actions.ts`, `labels.ts`.
- `apps/api/src/db/schema/encumbrances.ts`, `land.ts` (title_documents unique and checks), `index.ts`.
- `apps/api/drizzle/0022_encumbrances.sql`, `0023_encumbrances_guards.sql`, `0024_encumbrance_clear_rule.sql`; `apps/api/src/lib/errors.ts` (`GuardName`).
- `apps/api/src/modules/land/`:
  - new: `sales-block.ts` (+ test), `encumbrance-read.ts`, `encumbrances.service.ts` (+ test), `encumbrance-clear.ts`, `approvals.ts`, `encumbrances.approvals.test.ts`, `encumbrance-emails.ts`, `land-home-encumbrances.ts`;
  - changed: `land.router.ts`, `parcels.service.ts` (filter, summary), `parcel-read.ts` (row and detail), `parcel-changes.service.ts` (archive refusal), `documents.service.ts` (remove guard, upload refusal), `land-home.service.ts` (union queue, encumbrance section), `land-activity.service.ts` (encumbrance-targeted events), `land.guards.test.ts`, `land.concurrency.test.ts`.
- `apps/api/src/approvals/registry.ts`.
- `apps/api/src/email/mailer.ts` (`'land_alert'` tag), `templates/encumbrance-recorded.ts`, `templates.test.ts`.
- `apps/api/src/modules/audit/audit-read.service.ts` (`'encumbrance'` link).
- `apps/api/src/test/factories.ts` (`createEncumbrance`), `isolation.test.ts`, `permissions-matrix.test.ts`, `e2e-fixtures.ts`.
- `apps/api/src/db/seed-land-encumbrances.ts`, `seed-land.ts`, `seed-land.test.ts`.
- `docs/DOMAIN.md`.

**PR 2: Encumbrances web, homes, e2e, docs**
- `apps/web/src/features/land/`: `parcels-search.ts`, `parcels-table.tsx`, `parcels-cards.tsx`, `parcels-toolbar.tsx`, `land-words.ts` (+ test), new `encumbrance-words.ts` (+ test), `encumbrance-badge.tsx`, `parcel-commands.tsx`.
- `apps/web/src/features/land/detail/`:
  - changed: `parcel-search.ts` (+ test), `use-parcel-address.ts`, `parcel-page.tsx`, `parcel-content.tsx`, `parcel-header.tsx`, `parcel-menu.tsx`, `parcel-abilities.ts`, `document-vault.tsx`, `upload-fields.tsx`;
  - new: `encumbrance-banner.tsx`, `encumbrances-tab.tsx`, `encumbrance-sheet-lazy.tsx`, `encumbrance/` (`add-encumbrance-sheet.tsx` (+ test), `encumbrance-fields.tsx`, `encumbrance-values.ts` (+ test), `use-record-encumbrance.ts`, `edit-encumbrance-sheet.tsx`, `clear-encumbrance-sheet.tsx` (+ test), `use-request-clear.ts`).
- `apps/web/src/features/approvals/send/waiting-for-approval.tsx` (`detail` prop).
- `apps/web/src/features/land/home/`: `land-home.ts`, new `land-tile.tsx`, `encumbrances-tile.tsx`, `encumbrances-panel.tsx`, `executive-land-queue.tsx`, `land-home-section.tsx`, `land-queue.ts` (+ test), `land-home-prefetch.ts`, `land-home-queries.ts`.
- `apps/web/src/features/shell/home-kpis.ts` (+ test), `home-page.tsx`, `apps/web/src/features/land/home/land-home-lazy.tsx`; `apps/web/scripts/bundle-check.mjs` (FORBIDDEN).
- `apps/web/e2e/land/encumbrance.spec.ts`; `e2e/home/land-home.spec.ts` (tile, panel, next-date item, executive item).
- Docs listed in §12.

---

## 11. Tests

**Shared:**
- `mostSerious` ordering (a blocking mortgage ranks below a lien, non-blocking ones last).
- `alwaysBlocks`; record input refuses `blocksSales: false` for every non-mortgage type with the copy; evidence required.
- `nextDateLabel`.
- The catalog test covers `whenNoRule`, `feature` and the defaults' role keys.

**Encumbrances service:**
- Record: in one transaction it is active, blocking (rule true), evidence filed as a named `encumbrance_evidence` document, `land.encumbrance.recorded` audited, and emails returned for owners in scope only (a limited owner of another company gets none).
- Non-blocking mortgage: rule false, amber facts in row and detail.
- Future date refused; archived parcel or company refused; a foreign or used file refused; a name clash gets " (2)".
- Update: editable fields audited; `type`, `blocksSales` or `status` → BAD_REQUEST (strict); stale names the updater; `clearing_pending`; `encumbrance_cleared`.
- Several active: the row's `top` is the most serious, `count` is right, and the parcel stays blocked until every blocking one is cleared.
- Archive refused with "Clear the caveat before archiving this parcel." (named by severity); allowed once cleared.
- Vault: removing the only evidence version is refused; uploading a new `encumbrance_evidence` document is refused; a v2 of an existing one works.

**Approvals (`encumbrances.approvals.test.ts`, through the real service):**
- With the default rule, a request waits and nothing changes (still active and blocking).
- Step 1 by Finance, step 2 by Owner: cleared, unblocked, `land.encumbrance.cleared` with approvers in order.
- Maker can't approve; nobody approves two steps; Finance without access to the company isn't eligible.
- A second request gives `approval_pending` with its id.
- An edit, a company move or a removed clearance version since the request → expired as stale, still blocking.
- Reject, cancel and expire: nothing changes.
- No eligible approver → `no_approver` with the company name, and nothing saved (no clearance document).
- Rule deleted → `no_rule`, and preview reports it (if open question 1 holds).
- Only the plug-in sets `cleared`: the procedures' strict inputs refuse `status`, and the DB trigger refuses `cleared → active` and any update of a cleared row.

**Sales block (`sales-block.test.ts`):**
- Blocked for each of the four types and for a blocking mortgage; not blocked for a non-blocking mortgage or a cleared one.
- Another organization's parcel is never blocked by ours (isolation).
- `assertParcelsNotBlocked` locks: a concurrent `record` waits for it (`land.concurrency.test.ts`).

**Guards (`land.guards.test.ts`):** delete refused; immutable columns; status direction; archiving an encumbered parcel at the SQL level; insert on an archived parcel.

**Migrations:** 0022–0024 apply from a database at 0021 in one `pnpm db:migrate`. 0024 writes exactly one rule per organization, is safe to re-run, and gives Finance `land.approve`.

**Home:**
- Tile counts, "Oldest since", per company; next-date window at 30 and 31 days and a past date.
- Panel order; the executive items per role (owner and admin yes, viewer and land_legal no).
- Entity filter and a limited member; feature off → NOT_FOUND.

**Cross-cutting:**
- `isolation.test.ts`: `encumbrances.record` (other organization's parcel), `update`, `requestClear`, `blockers` with a foreign entity, and `approvals.preview` with a foreign encumbrance subject → NOT_FOUND or no data, no writes.
- `permissions-matrix.test.ts`: every new procedure × nine roles, plus a member limited to Parkview.
- `procedure-guard.test.ts` covers the feature declarations automatically.

**Web unit:** banner text per case (blocking, mortgage, "and 2 more", waiting); sheet values; locked block switch per type; clear sheet shows `preview.blocked`; queue rows for `next_date`.

**e2e** (`e2e/land/encumbrance.spec.ts`, J-LND-03; desktop and 375 px; axe in light and dark):
- Ngozi records a court order on Plot 22 with a PDF: banner, list badge, Encumbered chip, subtitle; archive is disabled.
- Edit the hearing date.
- Clear with evidence and Why?: the waiting line, Cancel request, then send again.
- Aisha approves step 1 (the banner stays); Olumide approves step 2 (the banner goes, the activity shows both).
- Parkview's mortgage shows amber and nothing is blocked.
- Sales role sees the banner without Clear.
- Offline disables Record and Send for approval.
- `e2e/home/land-home.spec.ts`: tile, panel and hearing item for Ngozi; *Needs attention* item for Olumide.

---

## 12. Docs in the same PRs

- **Decisions 0026 and 0027** (§6), added to the index.
- **DOMAIN.md:**
  - Encumbrance: the spec's replacement text, plus *next date*, evidence in the vault, edits locked while clearing waits, no delete.
  - New **Sales block** term (spec wording; "computed, never stored", decision 0027).
  - Title document: `encumbrance_evidence` ("one evidence and one clearance document per encumbrance, named after it").
  - Land parcel: "archiving refused while an encumbrance is active; titling is not affected".
  - Approvable action: *Clear an encumbrance*, and `whenNoRule`.
  - Approval rule: "three rules ship …" (adds *Clear an encumbrance*: Land & legal, Finance or Admin, then Owner).
  - Permission defaults: Finance has Approve in Land & title.
- **SCREENS.md:**
  - "Add / clear encumbrance" → `built`. Parcel detail → `built` (encumbrances).
  - Parcels list row text: Encumbrance column, Encumbered chip, blocked count.
  - New rows: Edit encumbrance sheet (`pattern`), Email: encumbrance recorded (`pattern`).
  - Role-homes row: "Land & legal: Encumbrances tile, panel, next-date item"; ExecutiveHome: "Needs attention: land blockers".
- **CHANGES.md:**
  - The spec's EncumbranceAdd and EncumbranceClear departures.
  - Mortgage not blocking is amber (board shows it rose).
  - Encumbered chip includes non-blocking mortgages.
  - Tile label "Encumbrances blocking sales" in the board's second slot.
  - "Sales unblock once it's approved" instead of "after the second approval" (step count comes from the rule).
  - Next-date items for passed dates.
  - Banner placement between the header and tracker (board).
  - Remove the slice-1 rows that said "until slice 2" (103, 104, 123).
- **Journey `docs/journeys/02-land-and-title.md`:** J-LND-03 rewritten from the spec's flows (3 + 3 clicks, approvers from the rule, mortgage choice, email to owners, the rule enforced on units when Projects and Sales ship), test `apps/web/e2e/land/encumbrance.spec.ts`, status `built`. Update the header line.
- **Help:** `docs/help/land-and-title/record-and-clear-an-encumbrance.md`.
- **CHANGELOG.md:** "Land & title (early access): record encumbrances that block sales; clearing needs two approvals."
- **Spec:** note `whenNoRule` and the evidence-in-vault naming in *Behind the scenes*. The implementer edits only with the owner's OK; otherwise these live in the plan.

---

## 13. Risks and open questions

**Risks:**
1. **Home budget.** §7 keeps the change to a few bytes; the CI check is the gate, with two named trims ready.
2. **Enum value in one migration transaction.** Use `type::text` checks, and test from 0021. If drizzle's migrator is found to split transactions, nothing breaks.
3. **Sales must call the rule.** Decision 0027 and the DOMAIN term make it a contract. Add "calls `assertParcelsNotBlocked`" to the review checklist when Sales starts.
4. **Archived company with an active encumbrance.** The parcel becomes read-only and can't be cleared until the company is restored. Follow-up: Companies should refuse archiving a company whose parcels are encumbered (outside this slice).
5. **Small firms.** With only Ngozi and one owner, step 1 has nobody and the request is refused with the spec's message. The owner then edits the rule (spec-accepted).
6. **Seed drives the real engine.** It's slower but can't drift. The seed test must keep it idempotent.
7. **The parcel's Activity depends on where the engine aims its events.** I assumed the engine's approve, reject, cancel and expire events target the request's record, as `approval.requested` does; I didn't check. If they don't, the parcel's Activity misses the decisions. Check `decide`, `cancelRequest` and `expireDue` while building PR 1.

**Questions for the owner** (each has a recommendation):
1. **If someone deletes or narrows the approval rule for clearing, what should happen?** Today, every other approval simply stops being needed when its rule is removed. *Recommended:* for clearing, refuse instead: "Clearing an encumbrance needs an approval rule. Ask an owner to add one." Then sales on land under a court order can never be unblocked by one person (decision 0026).
2. **Can someone edit an encumbrance's details (e.g. a new hearing date) while a request to clear it is waiting?** *Recommended:* no. The page says "A request to clear this caveat is waiting. Cancel it to change the details." Otherwise approvers could approve something that changed under them, and the request would expire.
3. **Recorded in error: is a document still required to clear it?** *Recommended:* yes, always. Attach whatever shows the mistake (e.g. the order naming the right parcel, or a note from the lawyer). The rule stays simple and approvers always see something.
4. **Who sees "Court order blocks sales on Plot 22" on their Home?** *Recommended:* owners and admins (both use the executive Home), not viewers. Owners also get the email.
5. **Should the "Encumbered" filter include a mortgage that doesn't block sales?** *Recommended:* yes. The filter lists every parcel with a claim on it, and the colour shows which ones block. The subtitle and the Home number count only parcels that block sales.
6. **Hearing reminders.** *Recommended:* show a court date on the Land & legal Home from 30 days before. If the date passes without an update, keep it there as "Hearing was on 14 Jan · set the next date" until someone updates it.
7. **Where does the clearing document go before approval?** *Recommended:* into the parcel's documents as soon as the request is sent, so approvers can open it before deciding. If the request is rejected, the document stays in the history. Sending it again adds a new version.
8. **Email for a mortgage that doesn't block sales?** *Recommended:* yes, owners are still told, with the line "Sales aren't blocked."

---

## 14. Size and split

About **6–7 developer-days**, in two PRs behind `land` (still `internal`):

| PR | Contents | Size | Backend / frontend parallelism |
|---|---|---|---|
| 1 · Encumbrances API, engine tweak, seed | §10 PR 1 | ~3 days, ~2,000 lines | The engine tweak and the shared contract go in the first commit; frontend starts PR 2 against them the same day |
| 2 · Encumbrances web, homes, e2e, docs | §10 PR 2 | ~3.5 days, ~2,200 lines | The list, banner and tab in parallel with the sheets and the Home additions; the tester writes `encumbrance.spec.ts` from the rewritten J-LND-03 alongside |

PR 1 needs a security look at the engine change and the guards migration. Slice 2 must be released before or together with Sales (spec open question 11). Slice 3 (boundary and map) doesn't depend on it.

**Follow-ups (not planned):**
- Refuse archiving a company with encumbered parcels.
- Linked-unit counts and *Units blocked* (₦) when Projects and Sales ship.
- Optionally a mortgage amount and lender release tracking, if Finance asks for it.
- Tracking governor's consent to a mortgage (Land Use Act s.22) belongs with Finance or Compliance, not here.

---
