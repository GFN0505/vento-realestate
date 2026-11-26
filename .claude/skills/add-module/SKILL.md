---
name: add-module
description: Step-by-step recipe for adding a new domain module (e.g. land parcels, subscriptions, receipts) end to end — zod schema, oRPC contract, Drizzle table, service, router, permissions, tests. Use when creating a new entity or resource.
---

# Add a module

Example module: `subscription` (a buyer subscribes to a unit with a payment plan). Replace names throughout. Check `docs/DOMAIN.md` for the correct terms, statuses and relationships first.

## 1. Shared schema — `packages/shared/src/subscription/schema.ts`
```ts
import { z } from 'zod'
import { id, money, currency, paginationInput, isoDate, Decimal } from '../common'

export const subscriptionStatus = z.enum(['pending_kyc', 'active', 'completed', 'cancelled', 'defaulted'])

export const subscription = z.object({
  id,
  unitId: id,
  buyerId: id,
  paymentPlanId: id,
  subscribedOn: isoDate,
  price: money,               // decimal string, never number
  currency,                   // 'NGN' | 'USD' | 'GBP' | 'EUR'
  status: subscriptionStatus,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const createSubscriptionInput = subscription
  .pick({ unitId: true, buyerId: true, paymentPlanId: true, subscribedOn: true, price: true, currency: true })
  .refine((v) => new Decimal(v.price).gt(0), { path: ['price'], message: 'Enter a price above zero' })

export const updateSubscriptionInput = createSubscriptionInput.partial().extend({ id })
export const listSubscriptionsInput = paginationInput.extend({
  status: subscriptionStatus.optional(),
  unitId: id.optional(),
  projectId: id.optional(),
})

export type Subscription = z.infer<typeof subscription>
```
Rules: user-facing error messages in plain English. The same schema drives the form, so write messages for end users.

## 2. Contract — `packages/shared/src/subscription/contract.ts`
```ts
import { oc } from '@orpc/contract'
import { paginated } from '../common'

export const subscriptionContract = {
  list: oc.input(listSubscriptionsInput).output(paginated(subscription)),
  get: oc.input(z.object({ id })).output(subscription),
  create: oc.input(createSubscriptionInput).output(subscription),
  update: oc.input(updateSubscriptionInput).output(subscription),
  remove: oc.input(z.object({ id })).output(z.void()),
}
```
Build every procedure from `forFeature('<key>')` (e.g. `const sales = forFeature('sales')`; `sales.input(…).output(…)`), not `base`: the key must be in the catalog (`packages/shared/src/features/catalog.ts`; add a module or a separately released part there, starting at stage `internal`). The member middleware then answers NOT_FOUND when the feature isn't available to the organization, before `requirePermission`; the declaration walk in `src/test/procedure-guard.test.ts` fails for a procedure without it. Platform procedures with no flag use `platform`. Register it in `packages/shared/src/contract.ts`.

## 3. Table — `apps/api/src/db/schema/subscription.ts`
```ts
import { id, timestamps } from '../columns'

export const subscriptions = pgTable('subscriptions', {
  id: id(),                         // uuid, default uuidv7() in Postgres (decision 0012)
  organizationId: uuid().notNull().references(() => organizations.id, { onDelete: 'restrict' }),
  unitId: uuid().notNull(),
  buyerId: uuid().notNull(),
  paymentPlanId: uuid().notNull(),
  subscribedOn: date().notNull(),
  price: numeric({ precision: 14, scale: 2 }).notNull(),
  currency: char({ length: 3 }).notNull().default('NGN'),
  status: subscriptionStatusEnum().notNull().default('pending_kyc'),
  ...timestamps,
}, (t) => [
  // Lets other organization-scoped tables point here with (organization_id, subscription_id).
  unique('subscriptions_org_id_unique').on(t.organizationId, t.id),
  // Same-organization references: a cross-organization id fails in the database.
  foreignKey({ name: 'subscriptions_unit_fk', columns: [t.organizationId, t.unitId], foreignColumns: [units.organizationId, units.id] }),
  foreignKey({ name: 'subscriptions_buyer_fk', columns: [t.organizationId, t.buyerId], foreignColumns: [contacts.organizationId, contacts.id] }),
  foreignKey({ name: 'subscriptions_plan_fk', columns: [t.organizationId, t.paymentPlanId], foreignColumns: [paymentPlans.organizationId, paymentPlans.id] }),
  index().on(t.organizationId, t.status),
  index().on(t.organizationId, t.buyerId),
  // one active subscription per unit
  uniqueIndex().on(t.unitId).where(sql`${t.status} = 'active'`),
  check('subscription_price_positive', sql`${t.price} > 0`),
])
```
Every organization-scoped table exposes `unique (organization_id, id)` so others can reference it with a composite foreign key. Entity-owned tables add `entityId` the same way, pointing at `entities (organization_id, id)`.
Then follow the `db-migration` skill.

## 4. Service — `apps/api/src/modules/subscription/subscription.service.ts`
- Functions take `ctx: ServiceContext` first (`db`, `organizationId`, `organizationName`, `user`, `member`; from `@/access/context`). Every `where` includes `eq(subscriptions.organizationId, ctx.organizationId)`, plus `entityScope(ctx.member, table.entityId)` for entity-owned rows. A row in another organization or outside the member's limits is `NOT_FOUND`, never `FORBIDDEN`.
- Write `recordAudit(tx, …)` (from `@/modules/audit/audit.service`) inside the same transaction as every change, with before and after values.
- Check that referenced rows (unit, buyer, payment plan) belong to the same organization before you insert, and that the unit is `available` or `reserved`.
- Enforce domain rules here (e.g. a unit can't have two active subscriptions → `CONFLICT` "Unit B12 already has an active subscription"; only `pending_kyc → active` once the buyer's KYC is verified).
- Multi-table writes go inside `ctx.db.transaction(async (tx) => …)`: activating a subscription generates its instalments from the payment plan and moves the unit to `subscribed` in the same transaction.
- Use the decimal library for any maths on `price` and instalment amounts.
- Lists: build filters with `and(...)`, return `{ items, page, pageSize, total }` using `pageOffset` and `toPage` from `@/lib/paginate`.
- Location filter (decision 0014): every page whose data belongs to a location follows the switcher. List inputs take an optional `entityId`, intersected with the viewer's entity limits (outside them, or not in this organization, is an empty list or NOT_FOUND). Only organization-wide pages (company profile, plan, roles) hide it. Test the intersection.
- Emails or messages: return them from the service and send them in the router after the transaction commits (`sendAll`).
- Plan limits: a create that counts against a limit calls `assertWithinLimit(tx, ctx, 'projects', 1)` (`@/platform/limits`) inside its transaction; register the counter in `LIMIT_USAGE` (`@/platform/usage.ts`) and the module's record counter in `FEATURE_RECORD_COUNTERS` for the `flags stage` warning.
- Optional behaviour inside a handler checks `ctx.features.has('platform.whatsapp')`. Jobs and messages check `availabilityForOrganization(db, orgId)` (`@/platform/snapshot`) at send time and skip organizations that lost the feature.
- Buyer-portal procedures (own authentication) must apply the same feature gate with the organization taken from the token.

## 5. Router — `apps/api/src/modules/subscription/subscription.router.ts`
```ts
export const subscriptionRouter = {
  list: member.subscription.list
    .use(requirePermission('sales', 'view', 'see subscriptions'))
    .handler(({ input, context }) => list(serviceContext(context), input)),
  create: member.subscription.create
    .use(requirePermission('sales', 'create', 'record subscriptions'))
    .handler(({ input, context }) => create(serviceContext(context), input)),
  // …
}
```
`member` (from `@/orpc`) means signed in, in an organization, with two-step set up when the role requires it. Actions are `view`, `create`, `edit`, `delete`, `export`, `approve` (DOMAIN.md); the third argument completes "Only … can ___." in the refusal. No try/catch. Throw `ORPCError` in the service (helpers in `@/lib/errors`), and the central handler formats it. Register in `apps/api/src/router.ts`; a public procedure must also go in `PUBLIC_PROCEDURES` there (the procedure-guard test checks every other one refuses anonymous callers). Anything that reads or writes organization data must be built on `member` (or `memberPendingTwoStep`), so the tab guard (decision 0013) covers it; the guard-walk test fails otherwise. Only personal procedures go on its `PERSONAL_PROCEDURES` list, deliberately. New modules already have a row in the default role table (`packages/shared/src/access/default-roles.ts`).

## 6. Tests — `subscription.service.test.ts`
Cover the happy path, validation, permission denied, not found, the domain conflict (second active subscription on a unit), and **cross-organization access returns NOT_FOUND**. Use `withRollback`, the factories (`createOrganization`, `createMember(org, { role, entityIds })`, `contextFor`) and `clientAs(tx, user)` to call through the middleware. Add the new id-taking procedures to `src/test/isolation.test.ts`.

## 7. Web
Follow the `add-list-page` skill.

## 8. Role homes
Add the module's contribution to every role home it serves (see `docs/release-plan.md` §8 and DESIGN-NOTES "Role homes"): its numbers (replacing the "—" placeholders in `features/shell/home-kpis.ts`), its work-queue items (due date, then impact; one clear action each) and any job-specific panel. Every number, queue item and panel respects the location filter: `?entity=` (All entities = group-wide with a per-entity breakdown) and, once Projects exists, the project filter; members limited to entities see only those. Only show what the role can view and the organization has available. Test per role and per entity.

## 9. Setup checklist
If the module needs a first-time setup step (e.g. "Connect Paystack", "Import buyers"), add one item in `apps/api/src/modules/checklist/items.ts` with its feature key, so it appears on Home only when the feature is available and the step is actionable.

## 10. Vento console procedures (staff only)
Customer modules never live in the console. If a module needs a staff screen, its contract uses `staff` from `@vento/shared/console` (meta `area: 'console'`) and its procedures are built on `consoleWindow` (`apps/api/src/orpc.ts`), never on `member`. A console procedure takes the organization by ID in its input; there is no tab organization. See decision 0021.

## Done when
`pnpm check && pnpm typecheck && pnpm test` pass, and the migration is generated and applied.
