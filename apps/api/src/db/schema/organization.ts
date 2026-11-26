import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  char,
  check,
  index,
  pgEnum,
  pgTable,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { id, timestamps, timestamptz } from '../columns'
import { users } from './auth'

export const organizations = pgTable(
  'organizations',
  {
    id: id(),
    name: text().notNull(),
    headOfficeState: text().notNull(),
    financialYearStartMonth: smallint().notNull().default(1),
    baseCurrency: char({ length: 3 }).notNull().default('NGN'),
    /** Setup checklist: someone answered "We only have one company". Undo clears both. */
    singleCompanyConfirmedAt: timestamptz(),
    singleCompanyConfirmedByUserId: uuid().references((): AnyPgColumn => users.id, {
      onDelete: 'restrict',
    }),
    ...timestamps,
  },
  (t) => [
    check(
      'organizations_single_company_consistent',
      sql`(${t.singleCompanyConfirmedAt} is null) = (${t.singleCompanyConfirmedByUserId} is null)`,
    ),
    index('organizations_single_company_by_idx').on(t.singleCompanyConfirmedByUserId),
    check('organizations_name_length', sql`char_length(${t.name}) between 2 and 120`),
    check('organizations_fy_month', sql`${t.financialYearStartMonth} between 1 and 12`),
    check('organizations_base_currency_ngn', sql`${t.baseCurrency} = 'NGN'`),
  ],
)

export const entityType = pgEnum('entity_type', ['holding', 'spv'])
export const entityStatus = pgEnum('entity_status', ['active', 'archived'])

export const entities = pgTable(
  'entities',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    name: text().notNull(),
    type: entityType().notNull(),
    /** Canonical "RC 1789234" (see normaliseRcNumber). */
    rcNumber: text(),
    tin: text(),
    vatRegistered: boolean().notNull().default(false),
    baseCurrency: char({ length: 3 }).notNull().default('NGN'),
    status: entityStatus().notNull().default('active'),
    archivedAt: timestamptz(),
    /** Who archived it (null while active, and when the audit trail didn't say). */
    archivedByUserId: uuid().references((): AnyPgColumn => users.id, { onDelete: 'restrict' }),
    ...timestamps,
  },
  (t) => [
    // Lets other organization-scoped tables point here with (organization_id, entity_id).
    unique('entities_org_id_unique').on(t.organizationId, t.id),
    // Archived entities keep their RC number, so it can't be reused by mistake.
    uniqueIndex('entities_org_rc_unique')
      .on(t.organizationId, t.rcNumber)
      .where(sql`${t.rcNumber} is not null`),
    index('entities_org_status_idx').on(t.organizationId, t.status),
    check('entities_base_currency_ngn', sql`${t.baseCurrency} = 'NGN'`),
    check(
      'entities_archived_consistent',
      sql`(${t.status} = 'archived') = (${t.archivedAt} is not null)`,
    ),
    index('entities_archived_by_idx').on(t.archivedByUserId),
    check(
      'entities_archived_by_only_archived',
      sql`${t.archivedByUserId} is null or ${t.status} = 'archived'`,
    ),
  ],
)
