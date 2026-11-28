import {
  PARCEL_STATUSES,
  SIZE_UNITS,
  TITLE_DOCUMENT_TYPES,
  TITLE_STAGE_STATUSES,
  TITLE_STAGE_TYPES,
} from '@vento/shared'
import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  char,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { id, timestamps, timestamptz } from '../columns'
import { users } from './auth'
import { files } from './files'
import { entities, organizations } from './organization'

// Land & title, slice 1 (plan §3). Organization-scoped with composite same-organization keys
// (decision 0012). Encumbrances (slice 2) point at parcels; boundaries (slice 3) are new nullable
// columns. Catalog order lives in @vento/shared, not in the enums' order.

export const parcelStatus = pgEnum('parcel_status', PARCEL_STATUSES)
export const parcelSizeUnit = pgEnum('parcel_size_unit', SIZE_UNITS)
export const titleStageType = pgEnum('title_stage_type', TITLE_STAGE_TYPES)
export const titleStageStatus = pgEnum('title_stage_status', TITLE_STAGE_STATUSES)
export const titleDocumentType = pgEnum('title_document_type', TITLE_DOCUMENT_TYPES)

export const parcels = pgTable(
  'parcels',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    entityId: uuid().notNull(),
    /** Shown as P-0012 (parcelReference); from record_counters, never reused. */
    referenceNumber: integer().notNull(),
    name: text().notNull(),
    /** Validated against NIGERIAN_STATES and the LGA list by zod, like headOfficeState. */
    state: text().notNull(),
    lga: text().notNull(),
    area: text(),
    sizeSqm: numeric({ precision: 14, scale: 2 }).notNull(),
    sizeUnit: parcelSizeUnit().notNull(),
    /** As typed, in size_unit. */
    sizeEntered: numeric({ precision: 14, scale: 4 }).notNull(),
    /** Plots only; 600 is stored, never assumed later. */
    plotSizeSqm: numeric({ precision: 10, scale: 2 }),
    status: parcelStatus().notNull().default('under_acquisition'),
    acquiredOn: date({ mode: 'string' }),
    acquisitionCost: numeric({ precision: 14, scale: 2 }),
    acquisitionCurrency: char({ length: 3 }).notNull().default('NGN'),
    /** "Bought from": personal data. */
    seller: text(),
    notes: text(),
    /** Optimistic concurrency, as roles.version. */
    version: integer().notNull().default(1),
    archivedAt: timestamptz(),
    archivedByUserId: uuid().references((): AnyPgColumn => users.id, { onDelete: 'restrict' }),
    ...timestamps,
  },
  (t) => [
    unique('parcels_org_id_unique').on(t.organizationId, t.id),
    unique('parcels_org_reference_unique').on(t.organizationId, t.referenceNumber),
    foreignKey({
      name: 'parcels_entity_fk',
      columns: [t.organizationId, t.entityId],
      foreignColumns: [entities.organizationId, entities.id],
    }),
    index('parcels_org_entity_idx').on(t.organizationId, t.entityId),
    index('parcels_org_status_idx')
      .on(t.organizationId, t.status)
      .where(sql`${t.archivedAt} is null`),
    // The duplicate-name hint and the list's name sort.
    index('parcels_org_name_idx')
      .on(t.organizationId, sql`lower(${t.name})`)
      .where(sql`${t.archivedAt} is null`),
    index('parcels_org_updated_idx').on(t.organizationId, t.updatedAt),
    index('parcels_archived_by_idx').on(t.archivedByUserId),
    check('parcels_reference_positive', sql`${t.referenceNumber} > 0`),
    check('parcels_name_length', sql`char_length(${t.name}) between 2 and 120`),
    check('parcels_size_positive', sql`${t.sizeSqm} > 0 and ${t.sizeEntered} > 0`),
    check(
      'parcels_plot_size',
      sql`(${t.sizeUnit} = 'plots') = (${t.plotSizeSqm} is not null) and (${t.plotSizeSqm} is null or ${t.plotSizeSqm} > 0)`,
    ),
    check(
      'parcels_cost_not_negative',
      sql`${t.acquisitionCost} is null or ${t.acquisitionCost} >= 0`,
    ),
    // FX columns come with the first foreign cost; until then everything is in naira.
    check('parcels_cost_ngn', sql`${t.acquisitionCurrency} = 'NGN'`),
    check('parcels_version_positive', sql`${t.version} >= 1`),
    check(
      'parcels_archived_by_only_archived',
      sql`${t.archivedByUserId} is null or ${t.archivedAt} is not null`,
    ),
  ],
)

export const titleStages = pgTable(
  'title_stages',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    parcelId: uuid().notNull(),
    type: titleStageType().notNull(),
    status: titleStageStatus().notNull().default('not_started'),
    /** The date of the latest status; null while not started or granted from Add parcel undated. */
    statusOn: date({ mode: 'string' }),
    /** The registry's file number. */
    reference: text(),
    issuedBy: text(),
    note: text(),
    /** Puts the chase in the Land & legal queue on that date. */
    followUpOn: date({ mode: 'string' }),
    version: integer().notNull().default(1),
    updatedByUserId: uuid().references((): AnyPgColumn => users.id, { onDelete: 'restrict' }),
    ...timestamps,
  },
  (t) => [
    unique('title_stages_org_id_unique').on(t.organizationId, t.id),
    // Documents point at a stage of the same parcel with (organization_id, parcel_id, stage_id).
    unique('title_stages_org_parcel_id_unique').on(t.organizationId, t.parcelId, t.id),
    unique('title_stages_parcel_type_unique').on(t.parcelId, t.type),
    foreignKey({
      name: 'title_stages_parcel_fk',
      columns: [t.organizationId, t.parcelId],
      foreignColumns: [parcels.organizationId, parcels.id],
    }),
    index('title_stages_org_parcel_idx').on(t.organizationId, t.parcelId),
    index('title_stages_org_status_idx').on(t.organizationId, t.status, t.statusOn),
    index('title_stages_org_follow_up_idx')
      .on(t.organizationId, t.followUpOn)
      .where(sql`${t.followUpOn} is not null`),
    index('title_stages_updated_by_idx').on(t.updatedByUserId),
    check(
      'title_stages_not_started_undated',
      sql`${t.status} <> 'not_started' or ${t.statusOn} is null`,
    ),
    check(
      'title_stages_note_required',
      sql`${t.status} not in ('queried', 'rejected') or ${t.note} is not null`,
    ),
    check(
      'title_stages_follow_up_status',
      sql`${t.followUpOn} is null or ${t.status} in ('submitted', 'queried')`,
    ),
    check('title_stages_version_positive', sql`${t.version} >= 1`),
  ],
)

export const titleDocuments = pgTable(
  'title_documents',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    parcelId: uuid().notNull(),
    type: titleDocumentType().notNull(),
    /** `other` always; a separate receipt, agreement or deed ("Adeyemi family"). */
    name: text(),
    /** An `other` file attached in a stage sheet ("Query letter") sits under that stage. */
    stageId: uuid(),
    createdByUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    ...timestamps,
  },
  (t) => [
    unique('title_documents_org_id_unique').on(t.organizationId, t.id),
    foreignKey({
      name: 'title_documents_parcel_fk',
      columns: [t.organizationId, t.parcelId],
      foreignColumns: [parcels.organizationId, parcels.id],
    }),
    foreignKey({
      name: 'title_documents_stage_fk',
      columns: [t.organizationId, t.parcelId, t.stageId],
      foreignColumns: [titleStages.organizationId, titleStages.parcelId, titleStages.id],
    }),
    // A same-type upload finds this document and becomes its next version.
    uniqueIndex('title_documents_parcel_type_name_unique').on(
      t.organizationId,
      t.parcelId,
      t.type,
      sql`lower(coalesce(${t.name}, ''))`,
    ),
    index('title_documents_org_parcel_idx').on(t.organizationId, t.parcelId),
    index('title_documents_stage_idx').on(t.stageId),
    index('title_documents_created_by_idx').on(t.createdByUserId),
    check('title_documents_other_named', sql`${t.type} <> 'other' or ${t.name} is not null`),
    check(
      'title_documents_single_unnamed',
      sql`${t.type} in ('family_receipt', 'land_purchase_agreement', 'deed_of_assignment', 'other') or ${t.name} is null`,
    ),
    check(
      'title_documents_name_length',
      sql`${t.name} is null or char_length(${t.name}) between 1 and 80`,
    ),
  ],
)

export const titleDocumentVersions = pgTable(
  'title_document_versions',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    documentId: uuid().notNull(),
    versionNo: integer().notNull(),
    fileId: uuid().notNull(),
    number: text(),
    issuedOn: date({ mode: 'string' }),
    issuedBy: text(),
    note: text(),
    uploadedByUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** Removed with a reason: hidden from the vault, kept (and its file) for the history. */
    removedAt: timestamptz(),
    removedByUserId: uuid().references((): AnyPgColumn => users.id, { onDelete: 'restrict' }),
    removedReason: text(),
    ...timestamps,
  },
  (t) => [
    unique('title_document_versions_org_id_unique').on(t.organizationId, t.id),
    unique('title_document_versions_document_no_unique').on(t.documentId, t.versionNo),
    unique('title_document_versions_file_unique').on(t.fileId),
    foreignKey({
      name: 'title_document_versions_document_fk',
      columns: [t.organizationId, t.documentId],
      foreignColumns: [titleDocuments.organizationId, titleDocuments.id],
    }),
    foreignKey({
      name: 'title_document_versions_file_fk',
      columns: [t.organizationId, t.fileId],
      foreignColumns: [files.organizationId, files.id],
    }),
    index('title_document_versions_org_document_idx').on(t.organizationId, t.documentId),
    index('title_document_versions_uploaded_by_idx').on(t.uploadedByUserId),
    index('title_document_versions_removed_by_idx').on(t.removedByUserId),
    check('title_document_versions_no_positive', sql`${t.versionNo} >= 1`),
    check(
      'title_document_versions_removed_consistent',
      sql`(${t.removedAt} is null and ${t.removedByUserId} is null and ${t.removedReason} is null) or (${t.removedAt} is not null and ${t.removedByUserId} is not null and char_length(${t.removedReason}) between 3 and 300)`,
    ),
  ],
)
