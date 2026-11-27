import { FILE_PURPOSE_KEYS } from '@vento/shared'
import { sql } from 'drizzle-orm'
import {
  bigint,
  char,
  check,
  index,
  pgEnum,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { id, timestamps, timestamptz } from '../columns'
import { users } from './auth'
import { organizations } from './organization'

// Private file storage (decision 0025). One row per upload. The bytes arrive at
// `incoming/org/{organization_id}/{id}`; attaching copies them to `kept/org/{organization_id}/{id}`
// and `object_key` moves there (the one change it may make). A row doesn't know its record: the
// record points here (e.g. title_document_versions.file_id) and attaches in the same transaction.

/** From the shared purposes registry, so the enum and FILE_PURPOSES can't drift. */
export const filePurpose = pgEnum('file_purpose', FILE_PURPOSE_KEYS)

/**
 * `uploading → ready` (checked) or `uploading → rejected`. Attached is `attached_at`. `deleting`
 * is the tombstone of an unattached upload on its way out (cancel, sweep): set before the bucket
 * delete, so nothing can attach it meanwhile, and retried by the sweep if the bucket fails.
 */
export const fileStatus = pgEnum('file_status', ['uploading', 'ready', 'rejected', 'deleting'])

export const files = pgTable(
  'files',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    purpose: filePurpose().notNull(),
    status: fileStatus().notNull().default('uploading'),
    objectKey: text().notNull(),
    /** The bucket's multipart upload; cleared once complete. */
    uploadId: text(),
    /** As the browser named it (cleaned): personal data, never logged or put in a key. */
    originalName: text().notNull(),
    /** What the browser claimed at start; the sniffed `content_type` is what's served. */
    declaredType: text().notNull(),
    contentType: text(),
    sizeBytes: bigint({ mode: 'number' }).notNull(),
    /** Hex SHA-256 of the stored bytes: integrity evidence for title documents. */
    sha256: char({ length: 64 }),
    uploadedByUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    completedAt: timestamptz(),
    /** Set by the owning record in its own transaction; from then on the file is kept. */
    attachedAt: timestamptz(),
    /** When the sweep removed the `incoming/` copy of an attached file (its bytes are in `kept/`). */
    incomingDeletedAt: timestamptz(),
    ...timestamps,
  },
  (t) => [
    // Lets records point here with (organization_id, file_id).
    unique('files_org_id_unique').on(t.organizationId, t.id),
    unique('files_object_key_unique').on(t.objectKey),
    // The daily sweep pages by id across organizations over files no record took (a small set:
    // attached rows, which pile up for ever, aren't in it), then checks each one's age.
    index('files_unattached_idx').on(t.id).where(sql`${t.attachedAt} is null`),
    // The sweep's second pass: attached files whose `incoming/` copy is still in the bucket.
    index('files_incoming_left_idx')
      .on(t.id)
      .where(sql`${t.attachedAt} is not null and ${t.incomingDeletedAt} is null`),
    // The per-person cap on uploads not yet attached.
    index('files_uploader_unattached_idx')
      .on(t.uploadedByUserId, t.status)
      .where(sql`${t.attachedAt} is null`),
    check('files_size_positive', sql`${t.sizeBytes} > 0`),
    check('files_original_name_length', sql`char_length(${t.originalName}) between 1 and 200`),
    check(
      'files_ready_complete',
      sql`${t.status} <> 'ready' or (${t.contentType} is not null and ${t.sha256} is not null and ${t.completedAt} is not null and ${t.uploadId} is null)`,
    ),
    check('files_attached_ready', sql`${t.attachedAt} is null or ${t.status} = 'ready'`),
    check('files_sha256_hex', sql`${t.sha256} is null or ${t.sha256} ~ '^[0-9a-f]{64}$'`),
    // The key is fixed by the row: incoming until attached, kept after. Nothing else.
    check(
      'files_object_key_layout',
      sql`${t.objectKey} = case when ${t.attachedAt} is null then 'incoming/' else 'kept/' end || 'org/' || ${t.organizationId} || '/' || ${t.id}`,
    ),
    check(
      'files_incoming_deleted_attached',
      sql`${t.incomingDeletedAt} is null or ${t.attachedAt} is not null`,
    ),
  ],
)
