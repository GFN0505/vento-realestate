# 0011 · Audit events: one append-only table, written in the caller's transaction

- **Date:** 2026-11-25
- **Status:** accepted

## Context
Decision 0006 requires an append-only audit trail with before and after values. Every brick will write to it, owners must trust it, and events about a person's account must be visible to the owners of each organization they belong to.

## Decision
One audit_events table, organization_id NOT NULL. Services call recordAudit(tx, …) inside their own transaction, so a change and its event commit or roll back together. Postgres triggers reject UPDATE, DELETE and TRUNCATE on the table. Secrets, codes and passwords are stripped before writing, and IP addresses are stored masked. Account-level events (sign-ins, lockouts, password and two-step changes) are written once for each organization the person is an active member of at that moment; before a person has any organization, they go to the structured log only. Better Auth endpoints write their events from hooks, after Better Auth's own commit.

## Consequences
- A missing event is a code bug, visible in review; nothing can quietly edit history.
- Tests can't truncate; the test database schema is recreated per run.
- Production should also run the app as a role without UPDATE/DELETE on the table (devops, before first deploy).
- Brick 4's audit log page reads one table per organization with simple indexes.

## Alternatives considered
- REVOKE only: the app currently connects as the table owner, so a trigger is the guarantee that holds today.
- Separate account-events table with a nullable organization: breaks the organization_id rule and complicates every read.
- Logging only: not queryable per record, and logs are not tamper-evident.
