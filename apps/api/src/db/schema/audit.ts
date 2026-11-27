import { index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { id, timestamps } from '../columns'
import { users } from './auth'
import { organizations } from './organization'

/** Append-only: triggers in migration 0001 refuse UPDATE, DELETE and TRUNCATE (decision 0011). */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    actorUserId: uuid().references(() => users.id, { onDelete: 'restrict' }),
    /** Name at the time, so history reads right after someone is renamed or removed. */
    actorName: text().notNull(),
    /** One of AUDIT_ACTIONS in @vento/shared; text because the list grows every brick. */
    action: text().notNull(),
    targetType: text().notNull(),
    targetId: uuid(),
    targetLabel: text(),
    before: jsonb(),
    after: jsonb(),
    metadata: jsonb(),
    requestId: text(),
    ipMasked: text(),
    userAgentSummary: text(),
    ...timestamps,
  },
  (t) => [
    index('audit_events_org_created_idx').on(t.organizationId, t.createdAt.desc()),
    index('audit_events_org_target_idx').on(t.organizationId, t.targetType, t.targetId),
    index('audit_events_org_actor_idx').on(t.organizationId, t.actorUserId, t.createdAt.desc()),
    // The console Dashboard's customer activity feed reads a few actions across organizations.
    index('audit_events_action_created_idx').on(t.action, t.createdAt.desc()),
  ],
)
