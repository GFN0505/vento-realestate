---
name: db-migration
description: Safe workflow for Drizzle schema changes and migrations — generate, review the SQL, apply, and rules for zero-downtime changes. Use whenever a file in apps/api/src/db/schema changes.
---

# Database migrations

## Workflow
1. Edit the Drizzle schema in `apps/api/src/db/schema/*.ts`.
2. `pnpm db:generate --name <short_description>` (e.g. `add_subscriptions`).
3. **Read the generated SQL** in `apps/api/drizzle/`. Check it does only what you intended: no accidental drops or renames turned into drop + add.
4. `pnpm db:migrate` against local Postgres (`pnpm db:up` first).
5. Run the API tests.
6. Commit the schema change and the migration together.

## Rules
- Never edit or delete a migration that's been committed to `main`. Fix forward with a new one.
- Never use `drizzle-kit push` outside throwaway local experiments.
- Every domain table: `id uuid` (v7), `organization_id` NOT NULL + FK + index, `created_at` / `updated_at timestamptz`. Entity-owned tables (ledger, bank accounts, payroll) also have `entity_id` NOT NULL + FK + index.
- Append-only tables (journal entries, receipts, allocations) get no update or delete paths; corrections are new rows.
- Money: `numeric(14,2)` with a `currency char(3)` beside it. Foreign-currency rows also store `fx_rate`, `fx_rate_source` and `fx_rate_date`. Rates and percentages: `numeric(7,4)` (FX rates may need more scale, e.g. `numeric(18,6)`). Never `real` / `double precision`.
- Use Postgres enums for fixed status sets. Adding a value is safe, but removing or renaming one needs a planned migration.
- Add indexes for every foreign key and every column used to filter or sort a list (usually composite with `organization_id` first).
- Enforce invariants in the database too: `CHECK` constraints, partial unique indexes (e.g. one active subscription per unit: unique on `unit_id` where `status = 'active'`).

## Changes that stay safe while the app is running
| Change | Safe way |
|---|---|
| Add a column | Nullable or with a default |
| Make a column NOT NULL | Add nullable → backfill → set NOT NULL in a later migration |
| Rename a column | Add the new one → write to both → backfill → switch reads → drop the old one later |
| Drop a column | Remove it from the code first, deploy, then drop |
| Big index on a big table | `CREATE INDEX CONCURRENTLY` (in its own migration) |

## Seeds
`apps/api/src/db/seed.ts` must be idempotent (upserts) and is only run by hand or in tests, never on app start.
