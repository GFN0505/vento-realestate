# Plan: Land & title, slice 1 (parcels and title)

- **Status:** approved (owner, 27 Nov 2026, all six points in §13 as recommended: lawyer checks the stages before PR 2's migration; Cloudflare R2 EU unless production hosting is on AWS, then S3 af-south-1; NDPA basis and DPIA before `land` leaves `internal`; Chainguard MinIO locally; no malware scan while `internal`; at least one stage per parcel and named separate documents). Three PRs, storage first.
- **Changed while building PR 1 (27–28 Nov, after review and security audit):** keys are now `incoming/org/{org}/{id}` until attached, then copied to `kept/org/{org}/{id}` (one `objectKey` column that moves once from the `incoming/` key to the `kept/` key at attach, plus `incomingDeletedAt` for the sweep's removal of the incoming copy). `attachFile(tx, ctx with storage, fileId, purpose)` and `signDownload(ctx, fileId, { purpose, disposition, filename })` live in `apps/api/src/modules/files/files.records.ts`, not `files.service.ts`; `signDownload` only signs attached files of the matching purpose. Files have a `deleting` status (tombstone). Part links sign their exact size. The 20-upload cap counts unattached ready files too. PR 2's `land.documents.link` must write an audit event for each link issued (decision 0025).
- **Spec:** [docs/specs/land-and-title.md](../specs/land-and-title.md) (approved 27 Nov 2026, all 12 recommendations)
- **Journeys:** J-LND-01 (without the boundary), J-LND-02
- **Branch:** `feat/land-and-title`, from `main` at `6af2840` (brick 4 merged in PR #10; migrations up to `0017_approvals_guards.sql`)
- **Decision record:** 0025 Private file storage (drafted in §2, proposed)
- **Written:** 27 Nov 2026 by the architect

## 1. Summary

**The job.** Ngozi, the Land & legal officer, registers a parcel with two documents in under 2 minutes. She moves a title stage in 2 clicks plus the upload. Anyone with `land.view` can answer "has the C of O come out?" in 2 clicks from ⌘K.

**What slice 1 ships:**
- Private file storage.
- The parcels list.
- Add, edit, archive and restore a parcel.
- Parcel detail: title stage tracker, stage-update sheet with Undo, Edit stages, a document vault with versions, preview, download and remove-with-reason, and an activity timeline read from the audit trail.
- ⌘K entries.
- Land & legal home contributions.
- Golden-thread seed data.
- J-LND-01 (without the boundary) and J-LND-02.

**What it leaves room for.** Encumbrances (slice 2) arrive as a new table pointing at `parcels`. Boundary columns (slice 3) arrive as nullable columns on `parcels`. Neither needs a slice-1 change.

**Firsts in the codebase.** This is the first module built on `forFeature`, the first file feature, the first record timeline, the first ⌘K record search and the first role-home queue. Each becomes the pattern later modules copy.

**Codebase facts that shaped the design:**
- `/rpc` bodies are capped at 1 MB (ARCHITECTURE "Resilience"), so files can't go through oRPC.
- There is no DataTable, MoneyInput or DatePicker yet. Companies is a hand-built list, and audit-toolbar uses native `type="date"` inputs.
- Home has StatCards only. No queue or panel component exists.
- Nigerian states already exist in `packages/shared/src/common/nigeria.ts`. LGAs do not.
- `land` is already in the catalog and in all three plan JSONs.

---

## 2. Private file storage and decision record 0025

### Design
- **Upload path: straight to the bucket in pieces, never through the API.**
  - Every file uses one path, an S3 multipart upload with 5 MiB parts. A 25 MB file is at most 5 parts; a small file is 1 part.
  - The API only signs URLs and finishes the upload.
  - The browser keeps the `File` in memory and retries each part with backoff. It pauses on `offline` and continues on `online`, and asks for fresh part URLs (`files.signParts`) when the old ones expire. This gives the spec's "resumes while the page is open".
- **Checking the file on `files.completeUpload`.** The server completes the multipart upload, then:
  - checks the size with HEAD (≤ the purpose's limit and equal to the declared size);
  - reads the first 4 KB with a ranged GET and checks the file's magic bytes (`%PDF-`; JPEG `FF D8 FF`; PNG `89 50 4E 47`; HEIC `ftyp` with brand heic/heix/hevc/hevx/mif1/msf1);
  - streams the object once to compute SHA-256 (integrity evidence for title documents).
  - If it fails, the object is deleted, the row is marked `rejected`, and the user sees the spec copy.
  - The sniffing is about 30 lines in `apps/api/src/storage/sniff.ts`. No `file-type` dependency for four types.
- **Purposes registry** (`packages/shared/src/files/purposes.ts`), for example `title_document: { feature: 'land', module: 'land', action: 'create', maxBytes: 25 MiB, types: [pdf, jpeg, png, heic] }`.
  - `files.*` procedures are `platform`. The service checks `ctx.features.has(feature)` (NOT_FOUND when off) and `hasPermission` (FORBIDDEN), so the two checks run in the same order as the middleware.
  - One upload pipeline, with per-purpose rules as data the web also reads. Receipts, site photos and KYC add one registry entry each.
- **Downloads only through the record.** A file row doesn't know its record. Links come from the owning module (`land.documents.link`), which checks `land.view` and company access first.
  - The link is a presigned GET valid for **300 s**. It forces `response-content-type` to the sniffed type and `response-content-disposition` (inline or attachment, with the file name).
  - The web fetches links with a mutation, never a cached query.
- **Object key** is `org/{organizationId}/{fileId}`. File names and personal data never go in keys or logs.
- **Lifecycle:**
  - `uploading → ready → attached` (stored as `attachedAt`), or `uploading → rejected`.
  - Unfinished multipart uploads are aborted by a bucket rule after 1 day.
  - `pnpm files sweep` (daily cron, beside `approvals expire`) deletes rows and objects that are `uploading` or `rejected`, or `ready` but never attached, after 24 h.
  - Attached files are never deleted by the app: a DB trigger refuses it.

### Draft decision record

```
# 0025 · Private file storage: one S3-compatible bucket, direct multipart uploads, short-lived signed links

- **Date:** 2026-11-27
- **Status:** proposed (provider and region need the owner's choice; see "Owner choices")

## Context
Land & title is the first feature that stores files: title documents that name sellers and families
(personal data under the NDPA 2023). Receipts, site photos, contracts and KYC will reuse whatever we
choose. Users are often on phones on weak networks; files are up to 25 MB; nothing may be lost or be
public; "remove" must keep history. The API caps /rpc bodies at 1 MB and should not carry file bytes.

## Decision
- **Storage:** one private S3-compatible bucket per environment, reached only through
  `apps/api/src/storage` (a driver interface with `s3` and test-only `memory` implementations, using
  `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`). Block all public access; bucket policy
  denies non-TLS requests; CORS allows PUT/GET only from WEB_ORIGIN and exposes ETag.
- **Encryption:** TLS in transit; provider-managed AES-256 at rest (on by default and verified at
  setup). No SSE-C: it would put a key in the browser. KYC (later) may add a customer-managed key
  (KMS) without changing the API.
- **Upload:** the browser uploads straight to the bucket with S3 multipart (5 MiB parts, URLs signed
  for 15 minutes, re-signed on resume). Parts retry with backoff, pause offline and resume while the
  page is open. One code path for every size.
- **Checks on completion (server):** size from HEAD ≤ the purpose's limit and equal to the declared
  size; type from the file's first bytes (never the name or the browser's type) against the purpose's
  list; SHA-256 recorded. A failure deletes the object and the upload is refused with plain words.
- **Purposes are data:** `FILE_PURPOSES` in packages/shared names each purpose's feature, permission,
  size limit and types. The upload procedures check them in the same order as the middleware
  (feature → NOT_FOUND, then permission → FORBIDDEN).
- **Access:** a file is reachable only through the record that holds it. The owning module checks
  view permission and company access, then returns a presigned GET valid for 5 minutes, with the
  sniffed content type and a Content-Disposition forced. Links are never cached or logged.
- **Retention:** files attached to a record are kept for the life of the organization; "remove with
  a reason" hides a version and keeps the file (a database trigger refuses deleting an attached file).
  Unattached uploads are deleted after 24 h by `pnpm files sweep`; incomplete multipart uploads are
  aborted by a 1-day bucket lifecycle rule. Bucket versioning is on with 30-day non-current retention
  as an accident net. Deleting an organization's files on account closure is a later spec.
- **Malware:** not scanned in this release (spec, raise in the security audit). Mitigations: four
  types only, content sniffing, files served from the bucket's own domain (never our origin), forced
  content type and `nosniff`, downloads as attachments, previews in the browser's own viewer. The
  SHA-256 lets a later scan job or hash lookup run over existing files.
- **Local and tests:** an S3-compatible container in docker compose, started by `pnpm db:up`, with the
  bucket and CORS created by an init step. Service tests use the `memory` driver (like the email
  `memory` transport); one contract test and the e2e suite run against the container, locally and
  in CI. Production refuses to start with `memory`.
- **Where the data sits (NDPA 2023):** the bucket lives in the same jurisdiction as the production
  database (which already holds the same personal data). If that is outside Nigeria, the transfer
  rests on NDPA Part VIII (ss. 41–43) and the NDPC's General Application and Implementation
  Directive 2025 (Art. 45 and Schedule 5): the provider's data processing agreement with contractual
  clauses giving an adequate level of protection, a DPIA before the first customer upload, the
  sub-processor and location named in our customer DPA and privacy notice, and the transfer recorded
  in our records of processing. Vento Real Estate is the processor; each developer is the controller.
  Legal counsel confirms this before `land` leaves `internal`.

## Owner choices (needed before production use)
1. Provider and region (recommendation below), and the account that owns it.
2. Legal confirmation of the transfer basis and the DPIA.

| Option | For | Against |
|---|---|---|
| **Cloudflare R2, EU jurisdiction** (recommended unless hosting is on AWS) | No egress fees (buyer-portal photos and document downloads will dominate traffic), S3 API incl. presigned multipart, encryption at rest by default, simple | Data in the EU, so a cross-border transfer (GDPR gives a strong basis); fewer compliance features than AWS (no customer-managed keys) |
| **AWS S3 af-south-1 (Cape Town)** | The most proven; KMS customer keys, Object Lock, access logging; closest AWS region | Egress is expensive from af-south-1; still a transfer outside Nigeria (South Africa, POPIA) |
| **Nigerian-hosted object storage** (local cloud or colocation) | No cross-border transfer; lowest latency | S3 multipart/presign/CORS compatibility, durability and SLA unproven; we'd operate it |

## Consequences
- Every later file feature adds a purpose and a record-level link procedure; nothing else.
- Moving provider is config plus a bucket copy (S3 API only, no provider SDK features).
- We run one more container locally and in CI, and one more daily job.
- Every link is a round trip to the API (by design: access is checked each time).

## Alternatives considered
- Through the API (stream to the bucket): uses API bandwidth and memory, needs its own body limits, and
  isn't resumable without more code.
- tus (resumable upload protocol) server: resumable across reloads, but a new server dependency and
  the bytes still pass through the API. Resuming within the page is what the spec asks.
- Single presigned PUT: simplest, but a dropped connection restarts 25 MB from zero.
- Public or long-lived URLs: unacceptable for title and KYC documents.
- Files in Postgres (bytea): bloats backups and the database, and has no signed links.
```

**Local emulator (devops to confirm).** MinIO stopped publishing community Docker images in October 2025. The recommendation is the free Chainguard MinIO image pinned by digest, with SeaweedFS as the fallback. In CI, start it with a `docker run` step, because a service container can't pass `server /data`.

### `files` table (`apps/api/src/db/schema/files.ts`)

| Column | Type / rule |
|---|---|
| `id` | `id()` |
| `organizationId` | NOT NULL, FK |
| `purpose` | pgEnum `file_purpose` = `['title_document']` |
| `status` | pgEnum `file_status` = `uploading \| ready \| rejected` |
| `objectKey` | text, unique |
| `uploadId` | text, null after completion |
| `originalName` | text, 1..200 |
| `declaredType` | text |
| `contentType` | text, null until sniffed |
| `sizeBytes` | bigint, check > 0 |
| `sha256` | char(64), null |
| `uploadedByUserId` | FK users, restrict |
| `completedAt`, `attachedAt` | nullable timestamptz |
| timestamps | standard |

Constraints and indexes:
- `unique(organization_id, id)`.
- Index `(organization_id, status, created_at)` for the sweep.
- Index `(uploaded_by_user_id, status)`.
- Check: `status='ready'` requires `contentType`, `sha256` and `completedAt`.

---

## 3. Data model

### Parcel status state machine
```
prospect ⇄ under_acquisition ⇄ acquired        (chosen by a person; any of the three)
acquired → titled     automatic, same transaction: ≥1 stage and every stage granted
titled  → acquired    automatic: a stage leaves granted, or a not_started stage is added
titled  → prospect | under_acquisition   a person chooses it (the form offers the three)
in_development, sold_out                 enum values exist now; set only by Projects and Sales;
                                         recompute never touches them
archived                                 not a status: archivedAt, shown as "Archived" (slate)
```
`resolveParcelStatus(chosen, stages)` lives in shared and is tested there. The service calls it after every stage write, stage-set change and parcel edit.

### Title stage state machine
```
not_started (initial only) → in_progress | submitted | queried | granted | rejected
any of those → any other (registries don't move in order); the sheet never offers not_started
guards: queried and rejected need note · leaving granted needs note · granted needs a non-removed
document version of that stage's type (in the vault or attached in the same call) · date ≤ today
(Lagos) · followUpOn only while submitted or queried (cleared otherwise) · expectedVersion matches
```
- **Current stage** is the first non-granted stage in catalog order.
- Catalog order lives in shared (`TITLE_STAGE_TYPES`) and SQL orders with `array_position(:catalog, type)`, not enum order. A lawyer's reordering is then a code change, not an enum migration.

### Tables (`apps/api/src/db/schema/land.ts`)

All tables are organization-scoped, with `unique(organization_id, id)` and timestamps.

**`record_counters`** (`apps/api/src/db/schema/counters.ts`): `organizationId`, `kind text`, `lastValue int`, PK `(organization_id, kind)`.
- `nextNumber(tx, orgId, 'parcel')` is one `insert … on conflict do update set last_value = last_value + 1 returning`.
- Numbers are never reused. Receipts and POs can reuse this table later.

**`parcels`**

| Column | Type / rule |
|---|---|
| `entityId` | NOT NULL, composite FK → `entities(organization_id, id)` |
| `referenceNumber` | int, unique `(organization_id, reference_number)`; shown as `P-0012` by `parcelReference(n)` in shared |
| `name` | text, check 2..120 |
| `state` | text, validated by zod against `NIGERIAN_STATES`, like `organizations.headOfficeState` |
| `lga` | text |
| `area` | text, null |
| `sizeSqm` | numeric(14,2), check > 0 |
| `sizeUnit` | pgEnum `ha \| sqm \| plots` |
| `sizeEntered` | numeric(14,4) |
| `plotSizeSqm` | numeric(10,2), null; check `size_unit <> 'plots' or plot_size_sqm is not null` (600 stored explicitly) |
| `status` | pgEnum `parcel_status`, all six values from DOMAIN, default `under_acquisition` |
| `acquiredOn` | date, null |
| `acquisitionCost` | numeric(14,2), null, check ≥ 0 |
| `acquisitionCurrency` | char(3), NOT NULL, default `NGN`, check `= 'NGN'` for now; FX columns come with any foreign cost later |
| `seller` | text, null ("Bought from"; personal data) |
| `notes` | text, null |
| `version` | int, default 1 (optimistic concurrency, as `roles.version`) |
| `archivedAt`, `archivedByUserId` | consistency check, as on `entities` |

Indexes: `(org, entity_id)`; `(org, status) where archived_at is null`; `(org, lower(name)) where archived_at is null` (duplicate-name hint and sort); `(org, updated_at)`.
- Slice 3 adds nullable `boundary jsonb`, `coordinate_system`, `boundary_area_sqm`.
- Slice 2 adds `encumbrances` with FK `(organization_id, parcel_id) → parcels`.

**`title_stages`**

| Column | Type / rule |
|---|---|
| `parcelId` | composite FK |
| `type` | pgEnum `title_stage_type`: survey_plan, excision_gazette, r_of_o, c_of_o, deed_of_assignment, governors_consent |
| `status` | pgEnum `title_stage_status`, the six values above |
| `statusOn` | date, null |
| `reference` | text, null |
| `issuedBy` | text, null |
| `note` | text, null |
| `followUpOn` | date, null |
| `version` | int |
| `updatedByUserId` | FK users |

Constraints and indexes:
- `unique(parcel_id, type)`.
- `unique(organization_id, parcel_id, id)`, so documents can reference a stage on the same parcel.
- Checks: `status='not_started' ⇒ status_on is null` (a stage granted from Add parcel may have no date); `status in ('queried','rejected') ⇒ note is not null`; `follow_up_on is null or status in ('submitted','queried')`.
- Indexes: `(org, parcel_id)`; `(org, status, status_on)`; `(org, follow_up_on) where follow_up_on is not null`.

**`title_documents`**

| Column | Type / rule |
|---|---|
| `parcelId` | composite FK |
| `type` | pgEnum `title_document_type`: the six stage types + family_receipt, land_purchase_agreement, other |
| `name` | text, null |
| `stageId` | null, FK `(organization_id, parcel_id, stage_id) → title_stages(organization_id, parcel_id, id)`; used only for `other` documents attached in a stage sheet (e.g. "Query letter") |
| `createdByUserId` | FK users |

Rules:
- `encumbrance_evidence` is left to slice 2 (adding an enum value is safe), which may link evidence to the encumbrance instead.
- Unique index `(organization_id, parcel_id, type, lower(coalesce(name,'')))`. A same-type upload therefore finds the existing document and becomes a version.
- Check: `type='other' ⇒ name is not null`. Single-instance types require `name is null`.
- Multi types (family receipt, purchase agreement, deed of assignment; open question 8): the first document may be unnamed; **Add as a separate document** requires a short name ("Which one? e.g. Adeyemi family").
- Indexes: `(org, parcel_id)` and `stage_id`.

**`title_document_versions`**

| Column | Type / rule |
|---|---|
| `documentId` | composite FK |
| `versionNo` | int, `unique(document_id, version_no)` |
| `fileId` | composite FK → `files(organization_id, id)`, `unique(file_id)` |
| `number` | text, null |
| `issuedOn` | date, null |
| `issuedBy` | text, null |
| `note` | text, null |
| `uploadedByUserId` | FK users |
| `removedAt`, `removedByUserId`, `removedReason` | all null or all set; reason 3..300 |

Indexes: `(org, document_id)` and `uploaded_by`. Version numbers are allocated under `select … for update` on the document row.

**Guards migration (custom SQL)**:
- `title_document_versions` refuses DELETE, and any UPDATE except the three `removed_*` columns.
- `files` refuses DELETE once `attached_at` is set, and UPDATE of `object_key`, `size_bytes`, `content_type` and `sha256` once ready.
- `parcels` refuses DELETE.

Each raises `check_violation` named in CONSTRAINT. `GuardName` in `lib/errors.ts` gets the new names.

### Reference data (code, not platform config)
- **States:** already exist (`NIGERIAN_STATES`).
- **LGAs:** new `packages/shared/src/common/nigeria-lgas.ts`, `LGAS_BY_STATE: Record<NigerianState, readonly string[]>`.
  - Source: Constitution of the Federal Republic of Nigeria 1999, First Schedule Part I (768 LGAs) and Part II (6 FCT area councils), 774 in total. Spellings follow common usage (e.g. "Eti-Osa", "Ibeju-Lekki"), with an alias list for search ("AMAC" → Abuja Municipal).
  - These are not platform config under decision 0015: they change only by constitutional amendment, and Vento staff never edit them. DOMAIN already says "fixed list".
  - The web lazy-loads the file only in the parcel editor.
- **Stage and document catalogs** live in `packages/shared/src/land/catalog.ts`:
  - stage order and labels;
  - `defaultStagesFor(state)`: `[survey_plan, excision_gazette, c_of_o]`, or `[survey_plan, r_of_o, c_of_o]` for the FCT (owner, 28 Nov 2026; spec open question 6);
  - `likelyNextStatus` (not_started or in_progress → submitted; submitted or queried → granted);
  - document type labels, `multiple` flag, and the `stageType` each document type maps to.

### Acquisition cost
Stored as `numeric(14,2)` + `NGN`. It is never selected for viewers who may not see it (rule in §5).

---

## 4. oRPC contract (`packages/shared/src/land/*`, `packages/shared/src/files/*`)

`const land = forFeature('land')`. Files use `platform` plus the purpose check.

| Procedure | Input (sketch) | Output | Errors |
|---|---|---|---|
| `land.parcels.list` | `paginationInput.extend({ q?, filter: 'all'\|'titled'\|'in_progress'\|'archived' = 'all', sort: 'name'\|'reference'\|'size'\|'updated' = 'name', dir, entityId? })` | `paginated(parcelRow).extend({ summary: { count, totalSqm } })` (precedent: `listEntitiesOutput` counts) | NOT_FOUND (feature) |
| `land.parcels.get` | `{ id }` | `parcelDetail` | NOT_FOUND |
| `land.parcels.nameTaken` | `{ name, excludeId? }` | `{ id, name } \| null` | none |
| `land.parcels.create` | `createParcelInput` (below) | `parcelDetail` | BAD_REQUEST `lga_not_in_state`, `file_unavailable`; NOT_FOUND (entity outside access); CONFLICT `entity_archived` |
| `land.parcels.update` | `{ id, expectedVersion, …fields }` | `parcelDetail` | CONFLICT `stale`, `parcel_archived`, `entity_archived`; NOT_FOUND (either company outside access) |
| `land.parcels.archive` / `restore` | `{ id }` | `parcelRow` | NOT_FOUND; slice 2 adds CONFLICT `encumbered` |
| `land.parcels.activity` | `{ id, page, pageSize }` | `paginated(timelineEvent)` | NOT_FOUND |
| `land.stages.update` | `{ id, expectedVersion, status, on, reference?, issuedBy?, note?, followUpOn?, attachments?: [{ fileId \| documentId, type, name? }] (≤5), undo?: boolean }` | `parcelDetail` | BAD_REQUEST `granted_needs_document`, `note_required`, `future_date`; CONFLICT `stale` (message names the updater), `parcel_archived` |
| `land.stages.set` | `{ parcelId, expectedVersion (parcel), types: TitleStageType[] (≥1) }` | `parcelDetail` | CONFLICT `stage_started` ("This stage has started, so it stays."), `last_stage`, `stale` |
| `land.documents.upload` | `{ parcelId, type, name?, separate?: boolean, fileId, number?, issuedOn?, issuedBy?, note? }` | `{ document, version }` | BAD_REQUEST `file_unavailable`, `name_required`; CONFLICT `parcel_archived` |
| `land.documents.versions` | `{ documentId }` | `version[]`, newest first (removed included, flagged) | NOT_FOUND |
| `land.documents.removeVersion` | `{ versionId, reason }` | `{ document }` | CONFLICT `evidence_for_granted` |
| `land.documents.restoreVersion` | `{ versionId }` | `{ document }` (Undo) | NOT_FOUND |
| `land.documents.link` | `{ versionId, disposition: 'inline'\|'attachment' }` | `{ url, expiresAt }` | NOT_FOUND |
| `land.home` | `{ entityId? }` | `{ hasParcels, titlesInProgress: { count, stalled, byEntity[] }, pipeline: [{ stageType, count, parcels: [{ id, name, sinceDays }] }], titledCount, queue: [{ kind: 'query'\|'follow_up'\|'stalled', parcelId, parcelName, stageId, stageType, due: isoDate, days }] }` | NOT_FOUND |
| `files.startUpload` | `{ purpose, name, size, type }` | `{ fileId, partSize, parts: [{ partNumber, url }], expiresAt }` | BAD_REQUEST `file_type`, `file_too_large`; TOO_MANY_REQUESTS (more than 20 uploads in progress per person) |
| `files.signParts` | `{ fileId, partNumbers }` | `{ parts, expiresAt }` | NOT_FOUND (not the uploader's) |
| `files.completeUpload` | `{ fileId, parts: [{ partNumber, etag }] }` | `{ fileId, contentType, sizeBytes }` | BAD_REQUEST `file_type`, `file_too_large`, `upload_incomplete` |
| `files.abortUpload` | `{ fileId }` | void | NOT_FOUND |

**`createParcelInput`:**
- `name`, `state`, `lga`, `area?`
- `size: { value: decimalString (≤4 dp, >0), unit, plotSizeSqm? }`
- `status: 'prospect'|'under_acquisition'|'acquired'`
- `entityId`, `acquiredOn?` (≤ today), `acquisitionCost?: money`, `seller?`, `notes?`
- `documents: [{ fileId, type, name?, number?, issuedOn? }]` (≤10), and `stages?: TitleStageType[]` (≥1, default `defaultStagesFor(state)`). A stage whose document type is in `documents` is created `granted` (`statusOn` = `issuedOn` or null), so the status check becomes `status='not_started' ⇒ status_on is null` (granted may have no date). Then `resolveParcelStatus` runs as usual (owner, 28 Nov 2026).
- `superRefine` gives "Pick an LGA in Lagos."

**`parcelRow`:**
- `id`, `reference`, `name`, `state`, `lga`, `area`, `sizeSqm`, `sizeUnit`, `sizeEntered`, `plotSizeSqm`, `status`, `entity {id, name}`, `archivedAt`
- `currentStage {type, status, statusOn} | null`, `stagesGranted`, `stagesTotal`
- `acquisition: { cost: money|null, currency, on: isoDate|null } | null`, which is **null when hidden**
- `costHidden: boolean`, so the UI can tell "not recorded" from "not yours to see"

**`parcelDetail`** = `parcelRow` plus:
- `seller` (null when hidden), `sellerHidden: boolean` (the cost rule, owner 28 Nov 2026), `notes`, `version`
- `stages[]` (all fields + `updatedBy {name}`)
- `documents[]` (type, name, stageType, latest non-removed version, `earlierCount`)
- `suggestedIssuers: Partial<Record<stageType, string>>` (last `issuedBy` per stage type on parcels in the same state)
- `can: { edit, create, delete }`
- `readOnly: null | 'archived' | 'entity_archived'`

**Rules for list and home:**
- `in_progress` = not archived, not titled, and any stage not `not_started`. Home "Titles in progress" uses the same predicate.
- `q` matches name, area, LGA, and the reference ("P-0012", "p-12" and "12" parse to the number).
- Every entity-aware input intersects with `entityScope` (decision 0014).

**Shared error codes:** add the new `BadRequestReason` and `ConflictReason` values in `common/errors.ts`. Register `land` and `files` in `packages/shared/src/contract.ts`.

---

## 5. Permissions

Every `land.*` procedure is built on `member` via `forFeature('land')`. Gated is NOT_FOUND, then `requirePermission`.

| Procedure | Module × action | Default roles |
|---|---|---|
| list, get, nameTaken, activity, documents.versions, documents.link, home | land.view | Owner, Admin, Land & legal, PM, Sales, Finance, Viewer |
| parcels.create, documents.upload, files.* (purpose `title_document`) | land.create | Owner, Admin, Land & legal |
| parcels.update, stages.update, stages.set | land.edit | Owner, Admin, Land & legal |
| parcels.archive/restore, documents.removeVersion/restoreVersion | land.delete | Owner, Admin, Land & legal |
| Acquisition cost shown | `land.edit` **or** `finance.view`, checked in the service, no new permission | Owner, Admin, Land & legal, Finance, Viewer (not PM or Sales) |

The third `requirePermission` argument completes the refusal sentence, e.g. `'update title stages'` gives "Only Land & legal can update title stages…".

**Company scope:**
- Every query adds `entityScope(ctx.member, parcels.entityId)`. A parcel outside the member's companies is NOT_FOUND.
- On create and update, the chosen company must be in scope and active. Moving a parcel needs the old company (loaded through scope) and the new one.
- A parcel under an archived company is read-only (CONFLICT `entity_archived`, spec copy).
- Documents, versions and stages reach scope through their parcel join.

**Other notes:**
- The stage sheet's attach needs `land.create` (open question 8's rule). Someone with edit but not create can only pick documents already in the vault.
- **Finance gets Approve in Land & title:** deferred to slice 2, with its approvable action and a system-role migration. Slice 1 has nothing to approve.
- Register `FEATURE_RECORD_COUNTERS.land` (non-archived parcels) in `apps/api/src/platform/usage.ts`.

---

## 6. Audit and approvals

**New actions** in `packages/shared/src/audit/actions.ts`, each with a label in `labels.ts` (module `land`):
- `land.parcel.created`, `.updated`, `.archived`, `.restored`
- `land.title_stage.updated` (`metadata.undo` reads "Undid C of O granted")
- `land.title_stages.changed` (metadata: added, removed)
- `land.document.uploaded`, `land.document.removed` (reason), and **`land.document.restored`** for Undo. This one isn't in the spec list, so note it in the spec and DOMAIN.

**Shape of every event:**
- Every event targets `{ type: 'parcel', id: parcelId, label: parcel name }`. Activity is then one query on the existing `audit_events_org_target_idx`.
- Metadata: `entityId` (so the audit log's company filter works), `stageType`, `documentType`, `documentId`, `versionId`, `versionNo`.
- Add `FIELD_LABELS` for the parcel and stage fields.
- In `audit-read.service.ts`, add `recordLink` case `'parcel' → /land/{id}`.

**Activity rules:**
- `land.parcels.activity` reuses the audit-read actor display. Extract the actor-standing mapping into an exported helper. Device and IP are never returned.
- It drops `acquisitionCost` from before/after for viewers who can't see the cost.

**Approvals:** none in slice 1 (spec §Approvals).

---

## 7. Role homes (slice 1)

Home has no queue or panel component today. Slice 1 adds generic `HomeQueue` and `HomePanel` components from the HomeLand board, so later modules plug in. Everything follows `?entity=`.

**Land & legal home (role key `land_legal`):**
- **Tile "Titles in progress"** (already in `home-kpis.ts`, currently "—"):
  - the count, with the line "1 stalled over 90 days";
  - per-company bar under *All companies*;
  - with no parcels in scope: "Add your first parcel".
  - The "Active encumbrances" tile stays "—" until slice 2.
- **Queue** (shown only with `land.edit`), sorted by due date then impact, at most 20, action **Update stage** (opens the stage sheet on the parcel):
  - `queried`: "Answer the registry's query · {stage}, {parcel}", due = statusOn.
  - `follow_up`: shown when followUpOn ≤ today, due = followUpOn.
  - `stalled`: status in_progress or submitted, statusOn ≤ today − 90 (Lagos), and no future follow-up date. Text "No movement on C of O for 94 days · Idu family land".
  - Items leave when the record changes; there is no tick-off. Log that in CHANGES.md, because DESIGN-NOTES says "tick off with Undo".
- **Title pipeline panel:** non-archived, non-titled parcels grouped by current stage type, with count and the longest "how long", plus a Titled count.
- **Phone:** sticky **Upload document** (HomeLandMobile).

**MD / owner:** nothing in slice 1. The MD queue item is slice 2.

---

## 8. Web

**Routes:**
- `routes/_app/_shell/land.tsx` becomes a layout keeping `moduleGuard('land')` with an `<Outlet/>`.
- `land/index.tsx` is the list. Search params: `q, filter, sort, dir, page, sheet=add`.
- `land/$parcelId.tsx` is the detail. Search params: `tab=documents|activity` and `sheet=edit|stage|stages|upload`, plus `stage=<type>`.
- Sheets are held in the URL, so Back closes them.

**Screens, the boards they follow, and the patterns they copy:**

| Screen | Board | Build from |
|---|---|---|
| Parcels list | LandTitle, LandTitleMobile | Companies list structure (`features/companies/*-page/-table/-cards/-toolbar/-states/-search`), `PageHeader`, `FilterChips`, `SearchField`, `StatusBadge`, `EmptyState`. No TanStack Table for 25-row pages. |
| Parcel detail | ParcelDetail, ParcelDetailMobile | Header facts and status, primary **Update {current stage}**, tracker, tabs *Documents* and *Activity* (`TimelineItem`) |
| Add / edit parcel | ParcelEditor, ParcelEditorMobile | Company-sheet pattern (`features/companies/sheet/*`), "More options" disclosure, `NativeSelect` for state and LGA, native date input as in audit-toolbar |
| Title stage update | TitleStageUpdate, TitleStageMobile | Sheet: likely next status pre-selected, date today, issuer pre-filled from `suggestedIssuers`, Follow up only for submitted or queried, Granted shows "Use C of O v1 from the vault" or the upload |
| Edit stages | none (`pattern`) | Checklist sheet in catalog order; started stages locked with "This stage has started, so it stays." |
| Document vault | ParcelDetail (documents tab) | Rows by type, "v2 · 2 earlier", Download, Preview (lazy chunk; PDF in the browser's viewer via iframe on desktop, new tab on phones; HEIC downloads), Remove dialog with reason (`ConfirmDialog`, `pattern`) and Undo toast |
| Upload document (phone) | none (`pattern`) | Full-screen sheet: parcel (last used, remembered per organization on the device), type, **Take photo** (`capture="environment"`) and **Choose file**, **Upload** |
| Land & legal home additions | HomeLand, HomeLandMobile | New `HomeQueue` and `HomePanel`; `StatCard` with a value |

**New shared components (flagged as new, from the design-system list):**
- `components/money-input.tsx` (₦; stores a decimal string).
- `components/file-drop.tsx`: drop zone, per-file type picker with a type guessed from the file name (survey, gazette, cofo/c of o, consent, deed, receipt, agreement), progress, *Upload paused…*, **Try again**.
- `lib/upload/multipart-upload.ts` and `use-file-upload.ts`.

Files start uploading on drop. Save waits for uploads still in flight ("Waiting for 1 upload…").

**⌘K** (`features/shell/command-results.tsx`):
- **New parcel** when the viewer has `land.create`.
- **Go to Land & title** already comes from the nav.
- A **Parcels** group: debounced 200 ms, at 2 or more characters, calls `land.parcels.list({ q, pageSize: 5, entityId })` with `keepPreviousData`, items `forceMount`, keywords = name and reference. This is the first server-searched group.

**States everywhere:**
- Skeletons in the final layout; empty and filtered-empty use the spec copy; inline error with Retry.
- Offline: Save, Update and Upload disabled with the spec line, reusing `lib/connection.ts` and the offline banner. Form input is kept.
- Archived and company-archived parcels are read-only banners.
- At 375 px: cards, chip row, sticky **Add parcel**, full-screen sheets, 44 px targets. Dark mode with tokens only.

**Performance:**
- LGA list and preview are lazy chunks; per-route chunk ≤ 80 KB.
- `preload: 'intent'` on rows; list `staleTime` so a repeat visit shows cached data at once.

**CSP:** where CSP is set, allow the bucket origin in `connect-src`, `img-src` and `frame-src` (devops).

---

## 9. Seed (golden thread)

New `apps/api/src/db/seed-land.ts`, called from `seed.ts`. It is idempotent (upsert by `(org, reference_number)`), sets `record_counters.parcel` to 21, and puts small generated PDF/PNG bytes ("Fictional sample · not a real document") into the local bucket. If storage is down it stops with "Start local storage: pnpm db:up".

Dates are relative to the run date, so the queue always has items. Backdated audit events (`at`) fill each parcel's activity.

| Parcel | Seed |
|---|---|
| **P-0012 Plot 22, Folu Ayo** | Ibeju-Lekki, Lagos · 4.20 ha · Lekki Pearl Estates Ltd · acquired 2025 · ₦840,000,000 · family receipt + survey plan; survey plan and excision gazette granted, C of O in_progress, governor's consent not_started. Caveat history waits for slice 2. |
| **P-0009 Victoria Gardens tract** | Ajah, Eti-Osa · 6.80 ha · Victoria Gardens Dev. Ltd · the three default stages granted with documents → `titled` |
| **P-0015 Parkview Block B** | Gbagada, Kosofe · 1.10 ha · Parkview Residences SPV Ltd · C of O submitted, follow-up yesterday (queue) |
| **P-0018 Idu family land** | Idu, Abuja Municipal, FCT · 12.00 ha · Vento Homes Ltd · stages survey plan (granted), R of O (queried 3 Nov, "Registry asked for the family's consent letter") (queue), C of O in_progress 94 days ago (stalled) |
| **P-0021 Epe farmland** | Epe · 20.00 ha · `prospect`, default stages not_started |
| **P-0007 Admiralty Way plot** | Lekki Phase 1, Eti-Osa · 0.90 ha · Vento Homes Ltd · `titled` |

The six parcels total 45.00 ha, matching the board.

---

## 10. File-by-file change list, in build order

**PR 1: Storage foundation (no screens)**
- `docs/decisions/0025-private-file-storage.md`: the record above.
- `docker-compose.yml` and `docker/storage-init.sh`: S3 container, bucket, CORS, lifecycle.
- `.env.example`: `STORAGE_DRIVER` (s3|memory), `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`.
- `apps/api/src/env.ts`: the keys above; production refuses `memory`.
- `apps/api/package.json`: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`.
- `apps/api/src/storage/driver.ts`, `s3-driver.ts`, `memory-driver.ts`, `index.ts`, `sniff.ts` (+ `sniff.test.ts`), `storage.s3.test.ts` (runs only when S3 is configured).
- `apps/api/src/context.ts`, `app.ts`, `access/context.ts`, `access/service-context.ts`: `storage` on the base and service contexts (as `mailer`).
- `apps/api/src/db/schema/files.ts`, `schema/index.ts`.
- `apps/api/drizzle/0018_files.sql` (generated) and `0019_files_guards.sql` (`--custom`).
- `packages/shared/src/files/purposes.ts`, `schema.ts`, `contract.ts`, `schema.test.ts`; `contract.ts`, `index.ts`, `common/errors.ts`.
- `apps/api/src/modules/files/files.service.ts`, `files.router.ts`, `files.service.test.ts`, `sweep.ts`; `router.ts`.
- `apps/api/src/platform/cli/main.ts`: `files sweep`.
- `apps/api/src/test/factories.ts`: `createReadyFile`. Also `isolation.test.ts` (files procedures).
- `apps/web/src/lib/upload/multipart-upload.ts` (+ test) and `use-file-upload.ts`; `apps/web/src/components/file-drop.tsx` (+ test).
- `.github/workflows/ci.yml`: start the storage container, env.
- `docs/ARCHITECTURE.md` (storage/, files, flow, env), `docs/RUNBOOK.md` (bucket setup, credentials, cron).

**PR 2: Land API and seed**
- `packages/shared/src/common/nigeria-lgas.ts` (+ test).
- `packages/shared/src/land/catalog.ts`, `size.ts` (+ tests), `status.ts` (`resolveParcelStatus`, + test), `schema.ts` (+ test), `contract.ts`, `index.ts`.
- `packages/shared/src/audit/actions.ts`, `labels.ts`.
- `apps/api/src/db/schema/counters.ts`, `land.ts`, `index.ts`.
- `apps/api/drizzle/0020_land.sql` (generated) and `0021_land_guards.sql` (custom). Read the SQL as the db-migration skill says.
- `apps/api/src/lib/counters.ts` (+ test).
- `apps/api/src/modules/land/land-access.ts` (load in scope, read-only reason, cost visibility).
- `apps/api/src/modules/land/parcels.service.ts`, `title-stages.service.ts`, `documents.service.ts`, `land-home.service.ts`, `land-activity.service.ts`, `land.router.ts`, with `*.test.ts` each and `land.concurrency.test.ts`.
- `apps/api/src/modules/audit/audit-read.service.ts`: parcel link, exported actor helper.
- `apps/api/src/router.ts`, `platform/usage.ts`.
- `apps/api/src/test/factories.ts`: `createParcel`, `createTitleDocument`. Also `isolation.test.ts`, `permissions-matrix.test.ts`, `e2e-fixtures.ts` (`land` command).
- `apps/api/src/db/seed-land.ts`, `seed.ts`.
- `docs/DOMAIN.md`.

**PR 3: Land web, home, ⌘K, e2e, docs**
- `apps/web/src/routes/_app/_shell/land.tsx`, `land/index.tsx`, `land/$parcelId.tsx`.
- `apps/web/src/features/land/`:
  - list: `land-words.ts`, `parcels-queries.ts`, `parcels-search.ts` (+ test), `parcels-page.tsx`, `parcels-table.tsx`, `parcels-cards.tsx`, `parcels-toolbar.tsx`, `parcels-states.tsx`;
  - `parcel-sheet/` (`parcel-form.tsx`, `parcel-fields.tsx`, `size-field.tsx` (+ test), `lga-field.tsx`, `use-save-parcel.ts`, `guess-type.ts` (+ test));
  - `detail/` (`parcel-page.tsx`, `parcel-header.tsx`, `title-tracker.tsx`, `stage-sheet.tsx` (+ test), `edit-stages-sheet.tsx`, `document-vault.tsx` (+ test), `document-versions.tsx`, `remove-version-dialog.tsx`, `document-preview.tsx` (lazy), `parcel-activity.tsx`);
  - `home/` (`land-home-queries.ts`, `land-queue.ts`, `title-pipeline-panel.tsx`, `upload-document-sheet.tsx`).
- `apps/web/src/components/money-input.tsx`.
- `apps/web/src/features/shell/home-page.tsx`, `home-kpis.ts` (+ test), `home-queue.tsx`, `home-panel.tsx`, `command-results.tsx`, `nav-copy.ts`.
- `apps/web/e2e/land/add-parcel.spec.ts`, `title-stage.spec.ts`, `documents.spec.ts`; `e2e/home/land-home.spec.ts`; `e2e/fixtures/files/` (tiny PDF and PNG).
- Docs listed in §12.

---

## 11. Tests

**Shared:**
- Size conversion ("12 plots" with no plot size → 7,200 m², shown "12 plots (0.72 ha)"; ha and m²; Decimal only).
- LGA in state, with the messages.
- LGA counts: 37 states/FCT, 774 total, Lagos 20, FCT 6, no duplicates within a state.
- `resolveParcelStatus`, `likelyNextStatus`, the reference format and parse.
- Labels test covers the new actions (existing test).

**Storage:**
- `sniff.test.ts`: PDF, JPEG, PNG and four HEIC brands accepted; exe renamed `.pdf`, zip, SVG and HTML refused.
- `files.service.test.ts`:
  - over-size and wrong type refused at start;
  - feature off → NOT_FOUND; no `land.create` → FORBIDDEN;
  - another user's or organization's file → NOT_FOUND on sign, complete and abort;
  - complete refuses a size mismatch or bad bytes and deletes the object;
  - the in-progress cap;
  - sweep deletes unattached rows after 24 h, never attached ones;
  - the guard trigger refuses deleting an attached file.
- `storage.s3.test.ts` against the container:
  - multipart round trip;
  - the presigned GET carries `X-Amz-Expires=300`, the forced type and the disposition;
  - an expired link fails.

**Parcels:**
- Create:
  - references P-0001, P-0002, never reused after archive, distinct under concurrent creates (`land.concurrency.test.ts`);
  - default stages for the state (three; FCT uses R of O);
  - documents attached in the same transaction; a stage with an uploaded document starts `granted`; all stages documented + `acquired` → `titled` on create; a family receipt grants nothing;
  - a foreign or already-attached file refused;
  - a company outside access → NOT_FOUND; an archived company refused.
- Duplicate-name hint.
- Update: stale version, and a move that needs both companies.
- Archive and restore: archived parcels are read-only everywhere; documents still downloadable.
- List: filters, `q` by reference, sort, the summary, pagination, and the `entityId` ∩ limits intersection.
- Cost visible for owner, admin, Land & legal, Finance and Viewer, absent for PM and Sales (in list, get and activity).

**Stages:**
- Every guard, with its copy. Granted counts vault and attached versions but not removed ones.
- acquired → titled in the same transaction; back to acquired on a change or an added stage.
- A prospect parcel never becomes titled. `in_development` is untouched.
- Stale update names the updater.
- Undo works only for the same person within 2 minutes.
- Edit stages: started or documented stages stay; the last stage stays.

**Documents:**
- Version numbering; a same-type upload becomes a version; a separate multi-type document needs a name; `other` matches by name.
- Remove needs a reason, is hidden from the vault, and appears in activity. Removing the only evidence behind a granted stage is refused. Restore works.
- `link` checks `land.view` and company scope.

**Home:**
- Stalled boundary at 89, 90 and 91 days; queue kinds and order; follow-up suppresses stalled.
- Entity filter; a limited member; no `land.view` → FORBIDDEN; feature off → NOT_FOUND.

**Cross-cutting:**
- `isolation.test.ts`: every new id-taking procedure with ids from another organization (parcel, stage, document, version, file, entity) → NOT_FOUND, no writes.
- `permissions-matrix.test.ts`: every land procedure × nine roles, plus a member limited to Parkview, checked against `defaultRoleAllows`.
- `procedure-guard.test.ts`: covers feature declarations and the staff walk automatically.

**e2e (desktop and mobile; axe at 375 and 1280 in light and dark):**
- `add-parcel.spec.ts` (J-LND-01 minus the boundary):
  - add a parcel with a PDF and a PNG, guessed types, default stages, documents under their stages, the toast, in the list;
  - duplicate-name hint; LGA mismatch;
  - a limited member sees only their company; a Sales user sees no cost.
- `title-stage.spec.ts` (J-LND-02):
  - submit; queried needs a note; granted needs a document; attach; the parcel reads Titled; Undo reverts;
  - a second browser context gives the stale conflict with input kept.
- `documents.spec.ts`:
  - upload as v2; remove with a reason, then Undo; download returns 200 from the bucket;
  - an interrupted part (`page.route` aborts part 2 once on an 11 MB file) shows "Upload paused…" and resumes; offline disables Save.
- `home/land-home.spec.ts`:
  - tile count, queue items from the fixture, Update stage opens the sheet;
  - phone Upload document in 3 taps.

---

## 12. Docs in the same PRs

- **Decision 0025** (above). Add it to the `docs/decisions/README.md` index.
- **DOMAIN.md:**
  - Land parcel: reference P-0001 per organization; one company; who sets which status; m² and the 600 m² plot; archive.
  - Title stage: `queried`, catalog order, current stage, follow-up date, granted needs a document.
  - Title document: `other` (named), separate named documents for multi types, versions removed only with a reason, `land.document.restored`.
  - New terms: **File** (a stored upload, private, reached only through its record) and **Signed link**.
- **SCREENS.md:**
  - §2 rows set to `built` (list: "list view; map in slice 3"; detail text drops surveys and valuations).
  - New rows: Edit stages sheet (`pattern`), Remove version dialog (`pattern`), Upload document on phone (`pattern`).
  - ⌘K row: "parcels"; role-homes row: "Land & legal: Titles tile, queue, Title pipeline".
- **CHANGES.md:** the spec's "Departures" table, plus queue items not ticked off and no thumbnails in the vault.
- **Journeys** (`docs/journeys/02-land-and-title.md`): J-LND-01 and J-LND-02 rewritten as the spec says and marked `built`; J-LND-03 unchanged until slice 2.
- **Help:** `docs/help/land-and-title/add-a-parcel.md` and `move-a-title-stage.md` (format from `docs/help/README.md`).
- **CHANGELOG.md:** "Land & title (early access): parcels, title stages, document vault."
- **ARCHITECTURE.md, RUNBOOK.md, `.env.example`** in PR 1, as listed in §10.

---

## 13. Risks and open points for the owner

1. **Stage order and defaults: decided by the owner on 28 Nov 2026** (common Nigerian practice now, a lawyer can correct it later; see spec open question 6). No longer blocks PR 2. The notes below explain why correcting it later is cheap.
   - Order lives in shared code, so reordering later is cheap. The set of stage and document enum values and the defaults should be confirmed first.
   - *Recommendation:* get sign-off this week, and ask specifically whether FCT parcels need their own default (R of O instead of excision gazette).
2. **Storage provider, region and account (owner's choice).**
   - *Recommendation:* Cloudflare R2 with EU jurisdiction, unless production hosting goes on AWS, in which case S3 af-south-1. Either way, keep it in the same jurisdiction as the database. Development and CI don't wait for this.
3. **NDPA cross-border basis.**
   - *Recommendation:* legal counsel confirms the s.41–43 and GAID basis, a DPIA is done, and the customer DPA names the sub-processor. All of this happens before any real customer's document is uploaded, i.e. before `land` leaves `internal`. It doesn't block the build.
4. **Local S3 emulator after MinIO's image withdrawal.**
   - *Recommendation:* Chainguard MinIO pinned by digest; SeaweedFS if that fails the contract test.
5. **No malware scan yet.**
   - *Recommendation:* accept for `internal` with the §2 mitigations. Add a scan job (hash plus a ClamAV container) to the security audit before release to pilot.
6. **Two small rules decided here.** Owner, please confirm or override:
   - a parcel keeps at least one stage;
   - a separate document of a multi type needs a short name.

## 14. Size and split

About **10–11 developer-days**. Split into three PRs, each behind `land` at `internal`:

| PR | Contents | Size | Backend / frontend parallelism |
|---|---|---|---|
| 1 · Storage foundation | §10 PR 1 | ~2.5 days, ~1,500 lines | Backend storage and files in parallel with the web upload lib and FileDrop (against the shared files contract, agreed on day 1) |
| 2 · Land API and seed | §10 PR 2 | ~3 days, ~2,500 lines | Frontend can start PR 3 screens once the shared land contract lands (first commit of PR 2) |
| 3 · Land web, home, ⌘K, e2e, docs | §10 PR 3 | ~4–5 days, ~3,500 lines | Home queue and panel in parallel with list and detail; the tester writes e2e from the journeys alongside |

PRs 2 and 3 can merge into one if the reviewer prefers a single land review. Storage should still go first: it carries its own decision record and needs a separate security look.

Sources (NDPA, GAID and MinIO points are from secondary commentary, to be checked against the primary texts):
- [ALN: What constitutes cross-border transfer of personal data](https://aln.africa/?p=7017)
- [Mondaq: Cross-border data transfers, legal requirements in Nigeria](https://www.mondaq.com/nigeria/data-protection/1789480/cross-border-data-transfers-an-overview-of-legal-requirements-and-compliance-mechanisms-in-nigeria)
- [Mondaq: Cross-border transfers and international compliance](https://www.mondaq.com/nigeria/privacy-protection/1798234/cross-border-data-transfers-and-international-compliance-legal-opportunities-in-global-tech-transactions)
- [Mondaq: Moving personal data across borders](https://www.mondaq.com/nigeria/data-protection/1729096/moving-personal-data-across-borders-what-your-startup-needs-to-know)
- [Forvis Mazars: GAID 2025 in focus](https://www.forvismazars.com/ng/en/insights/local-publications/local-insights/building-digital-trust-giad-2025-in-focus)
- [It's FOSS: MinIO moves away from open source](https://itsfoss.com/news/minio-moves-away-from-open-source/)
- [InfoQ: MinIO S3 API alternatives](https://infoq.com/news/2025/12/minio-s3-api-alternatives/)
- [Chainguard: free MinIO containers](https://www.chainguard.dev/unchained/secure-and-free-minio-chainguard-containers)
- [DEV: MinIO CE in 2026 and what to use](https://dev.to/rosgluk/minio-ce-in-2026-retired-upstream-source-only-and-what-to-use-1k02)
