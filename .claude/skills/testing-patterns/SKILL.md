---
name: testing-patterns
description: How tests are written in this repo — Vitest service tests against real Postgres, factories, the cross-organization isolation test, component tests, Playwright e2e conventions. Use when writing or fixing tests.
---

# Testing patterns

## Layers
| Layer | Tool | Where | Covers |
|---|---|---|---|
| Schemas | Vitest | `packages/shared/**/*.test.ts` | Validation rules and messages |
| Services | Vitest + real Postgres | `apps/api/src/modules/**/*.test.ts` | Business rules, isolation, permissions |
| Components | Vitest + Testing Library | `apps/web/src/**/*.test.tsx` | Forms, tricky UI logic |
| User flows | Playwright | `apps/web/e2e/*.spec.ts` | Critical journeys end to end |

Don't mock the database. Service tests run against the test database, and each test is wrapped in a transaction that's rolled back.

## Factories — `apps/api/src/test/factories.ts`
```ts
const org = await createOrganization()
const user = await createMember(org, { role: 'sales' })
const project = await createProject(org)
const unit = await createUnit(project, { status: 'available' })
const ctx = contextFor(user, org)
```
Factories take overrides and fill realistic defaults. Never depend on rows created by another test.

`createOrganization(tx, { releaseGroup, planKey })` defaults to an `internal` organization (everything, no limits); pass `planKey: 'starter'` (standard) to test plans and limits. `setStage`, `setOverride`, `addAddOnRow` and `createSuperAdmin` set up flags and plans. `clientAs(tx, user, { activeOrganizationId, expectedOrganizationId, sessionId, features })` calls procedures through every middleware; `features` defaults to a store that reads the database on every call, and `staticFeatureStore(await loadSnapshot(tx))` plus `countingDb(tx)` (`src/test/counting-db.ts`) prove a path's query count. e2e never changes global release stages: use the per-organization fixtures (`starter-org`, `org-group`, `org-override`, `org-trial`). `expectedOrganizationId` sends the tab-guard header (decision 0013); pass a real `createSession` id when the test checks what gets written to the session. To prove a path reads nothing, pass `throwingDb()` from `src/test/throwing-db.ts` instead of `tx`.

E2E data comes from `apps/api/src/test/e2e-fixtures.ts` commands (`member`, `team`, `multi-org`, `set-role <email> <role>`, `remove-member <email>`, …), each printing one JSON line.

## Required tests for every resource
```ts
it('creates a subscription for an available unit', …)
it('rejects a price of zero', …)
it('rejects a second active subscription on the same unit', …)
it('denies a viewer from creating a subscription', …)
it('returns NOT_FOUND for a subscription in another organization', async () => {
  const other = await createOrganization()
  const foreign = await createSubscription(other)
  await expect(get(ctx, { id: foreign.id })).rejects.toMatchObject({ code: 'NOT_FOUND' })
})
it('lists only this organization’s subscriptions', …)
```

## Money
Test amounts as strings: `expect(total).toBe('1250000.00')`. Cover zero, part-payment, overpayment, rounding, allocation oldest due first, and foreign-currency amounts with their FX rate and NGN equivalent. Instalment status is derived, so assert it after recording receipts (`partially_paid`, `paid`, `overdue`), and assert every ledger posting balances.

## Components
Query by role and label (`getByRole('button', { name: 'Save subscription' })`). Use `userEvent`, not `fireEvent`. Assert what the user sees.

## Playwright
- One spec per journey: `subscriptions.spec.ts` → create, find in list, edit, cancel.
- Log in through a stored auth state (`e2e/.auth`), not the UI in every test.
- Selectors: `getByRole`, `getByLabel`, `getByText`. No CSS selectors, and no `waitForTimeout`.
- Each spec seeds its own data through the API.

## Console (super-admin)
- API: `consoleClientAs(...)` in `apps/api/src/test/router-client.ts` calls console procedures as a super-admin with an open console window; `createSuperAdmin(...)` in `factories.ts` makes one (it can also make a revoked one). The access walk in `procedure-guard.test.ts` covers every `area: 'console'` procedure automatically.
- Staff accounts (decision 0023): `createStaffAccount({ state: 'active' | 'joining' | 'closed' })`, `createStaffInvitation({ status, started, invitedBy })` and `createSuperAdmin` (a staff account, no organization) in `factories.ts`; `joinAsStaff(b)` in `flows.ts` runs the real staff sign-up over HTTP. Tests that change `platform_admins` or `staff_invitations` take the `platform_admins` advisory lock first; a test needing the pre-1b state uses `SET LOCAL session_replication_role = replica`.
- e2e fixtures: `super-admin <active|revoked|two-step-reset>`, `staff-invitation`, `customer-account`, `age-staff-invitation`, `dashboard`.
- e2e: console specs live in `apps/web/e2e/console/`. A spec that changes a global release stage restores it afterwards, runs serially, and uses only stage keys no other spec uses.

## Naming and style
Test names are sentences describing behaviour. Arrange, act, assert, with no logic in tests. Keep each test under ~30 lines.

## Running
`pnpm test` (all unit/integration), `pnpm --filter api test -- subscription`, `pnpm e2e`, `pnpm e2e --ui` for debugging.
