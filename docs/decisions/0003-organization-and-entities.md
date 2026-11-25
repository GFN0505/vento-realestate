# 0003 · Organization contains entities (SPVs)

- **Date:** 2026-11-25
- **Status:** accepted

## Context
Nigerian developers often run each project through its own SPV, with a holding company above. Books, bank accounts, payroll and contracts belong to a legal company, while people and dashboards span the group.

## Decision
The **organization** (Better Auth organization) is the customer and the data boundary: every domain table has `organizationId`, taken only from the auth context. Inside it, **entities** are legal companies. Finance, payroll, contracts and bank data carry an `entityId`. Permissions can be limited to entities or projects.

## Consequences
- Every query filters by organization; finance queries also by entity.
- Consolidated reports and intercompany entries are first-class.
- The word "tenant" is never used in code (it means something else in real estate).

## Alternatives considered
- One organization per SPV: breaks group dashboards and forces users to switch accounts.
- Entities as a tag only: can't produce correct per-company ledgers.
