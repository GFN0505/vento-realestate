import { ENCUMBRANCE_STATUSES, ENCUMBRANCE_TYPES } from '@vento/shared'
import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { id, timestamps, timestamptz } from '../columns'
import { users } from './auth'
import { parcels, titleDocuments, titleDocumentVersions } from './land'
import { organizations } from './organization'

// Land & title, slice 2 (plan §3). An encumbrance belongs to its parcel: company scope comes
// through the parcel, so there is no entity_id (it follows the parcel if it moves). Never
// deleted; `cleared` is written only by the approval's execute and then frozen (0023 guards).
// The sales block is computed from encumbrances_blocking_idx, never stored (decision 0027).

export const encumbranceType = pgEnum('encumbrance_type', ENCUMBRANCE_TYPES)
export const encumbranceStatus = pgEnum('encumbrance_status', ENCUMBRANCE_STATUSES)

export const encumbrances = pgTable(
  'encumbrances',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    parcelId: uuid().notNull(),
    type: encumbranceType().notNull(),
    status: encumbranceStatus().notNull().default('active'),
    /** Fixed at insert: always true except for a mortgage, where it's chosen. */
    blocksSales: boolean().notNull(),
    /** "Claimant or holder": personal data, never logged. */
    claimant: text().notNull(),
    servedOn: date({ mode: 'string' }).notNull(),
    reference: text(),
    lawyer: text(),
    /** A hearing or next date; may pass without an update (it then stays in the queue). */
    nextOn: date({ mode: 'string' }),
    notes: text(),
    evidenceDocumentId: uuid().notNull(),
    /**
     * The evidence version recorded with it (security M1): what the encumbrance shows, whatever
     * the vault adds later. Never changes, and can't be removed from the vault.
     */
    evidenceVersionId: uuid().notNull(),
    recordedByUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    clearedOn: date({ mode: 'string' }),
    clearanceDocumentId: uuid(),
    /** The clearance version the approvers approved; set with `cleared`, then frozen. */
    clearanceVersionId: uuid(),
    clearanceNote: text(),
    clearedAt: timestamptz(),
    /** The maker of the clearing request; the approvers are in the audit trail. */
    clearedByUserId: uuid().references((): AnyPgColumn => users.id, { onDelete: 'restrict' }),
    /** Optimistic concurrency, as parcels.version; a clearing request is made against it. */
    version: integer().notNull().default(1),
    ...timestamps,
  },
  (t) => [
    unique('encumbrances_org_id_unique').on(t.organizationId, t.id),
    // Later same-parcel references point here with (organization_id, parcel_id, id).
    unique('encumbrances_org_parcel_id_unique').on(t.organizationId, t.parcelId, t.id),
    foreignKey({
      name: 'encumbrances_parcel_fk',
      columns: [t.organizationId, t.parcelId],
      foreignColumns: [parcels.organizationId, parcels.id],
    }),
    // Evidence and clearance are documents of the same parcel.
    foreignKey({
      name: 'encumbrances_evidence_fk',
      columns: [t.organizationId, t.parcelId, t.evidenceDocumentId],
      foreignColumns: [titleDocuments.organizationId, titleDocuments.parcelId, titleDocuments.id],
    }),
    foreignKey({
      name: 'encumbrances_clearance_fk',
      columns: [t.organizationId, t.parcelId, t.clearanceDocumentId],
      foreignColumns: [titleDocuments.organizationId, titleDocuments.parcelId, titleDocuments.id],
    }),
    // The pinned versions belong to those documents (and so to this organization and parcel).
    foreignKey({
      name: 'encumbrances_evidence_version_fk',
      columns: [t.organizationId, t.evidenceDocumentId, t.evidenceVersionId],
      foreignColumns: [
        titleDocumentVersions.organizationId,
        titleDocumentVersions.documentId,
        titleDocumentVersions.id,
      ],
    }),
    foreignKey({
      name: 'encumbrances_clearance_version_fk',
      columns: [t.organizationId, t.clearanceDocumentId, t.clearanceVersionId],
      foreignColumns: [
        titleDocumentVersions.organizationId,
        titleDocumentVersions.documentId,
        titleDocumentVersions.id,
      ],
    }),
    index('encumbrances_org_parcel_idx').on(t.organizationId, t.parcelId),
    // The sales block, the Encumbered filter's blocked count and the Home tile read this.
    index('encumbrances_blocking_idx')
      .on(t.organizationId, t.parcelId)
      .where(sql`${t.status} = 'active' and ${t.blocksSales}`),
    index('encumbrances_org_next_idx')
      .on(t.organizationId, t.nextOn)
      .where(sql`${t.status} = 'active' and ${t.nextOn} is not null`),
    index('encumbrances_org_served_idx')
      .on(t.organizationId, t.servedOn)
      .where(sql`${t.status} = 'active'`),
    index('encumbrances_evidence_idx').on(t.evidenceDocumentId),
    index('encumbrances_clearance_idx').on(t.clearanceDocumentId),
    // Removing a version asks whether an encumbrance pins it.
    index('encumbrances_evidence_version_idx').on(t.evidenceVersionId),
    index('encumbrances_clearance_version_idx').on(t.clearanceVersionId),
    index('encumbrances_recorded_by_idx').on(t.recordedByUserId),
    index('encumbrances_cleared_by_idx').on(t.clearedByUserId),
    // ::text, never the enum literal: a value added to an enum can't be used in the migration
    // transaction that adds it (plan §13 risk 2), and this keeps every check written one way.
    check('encumbrances_mortgage_choice', sql`${t.type}::text = 'mortgage' or ${t.blocksSales}`),
    check(
      'encumbrances_cleared_consistent',
      sql`(${t.status}::text = 'active' and ${t.clearedOn} is null and ${t.clearanceDocumentId} is null and ${t.clearanceVersionId} is null and ${t.clearedAt} is null and ${t.clearedByUserId} is null) or (${t.status}::text = 'cleared' and ${t.clearedOn} is not null and ${t.clearanceDocumentId} is not null and ${t.clearanceVersionId} is not null and ${t.clearedAt} is not null and ${t.clearedByUserId} is not null)`,
    ),
    check(
      'encumbrances_cleared_after_served',
      sql`${t.clearedOn} is null or ${t.clearedOn} >= ${t.servedOn}`,
    ),
    // Security L6, as the inputs: served from 1900; a next date from a year before it was served.
    // "Not in the future" and "within ten years" need today, so only the services check those.
    check('encumbrances_served_from_1900', sql`${t.servedOn} >= date '1900-01-01'`),
    check(
      'encumbrances_next_after_served',
      sql`${t.nextOn} is null or ${t.nextOn} >= ${t.servedOn} - interval '1 year'`,
    ),
    check('encumbrances_claimant_length', sql`char_length(${t.claimant}) between 2 and 200`),
    check('encumbrances_notes_length', sql`${t.notes} is null or char_length(${t.notes}) <= 2000`),
    check(
      'encumbrances_clearance_note_length',
      sql`${t.clearanceNote} is null or char_length(${t.clearanceNote}) <= 1000`,
    ),
    check('encumbrances_version_positive', sql`${t.version} >= 1`),
  ],
)
