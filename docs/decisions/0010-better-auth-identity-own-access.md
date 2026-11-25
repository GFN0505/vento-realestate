# 0010 · Better Auth for identity; organizations and access are ours

- **Date:** 2026-11-25
- **Status:** accepted

## Context
Brick 2a needs sign-in, two-step, sessions, invitations, roles stored as data, entity limits, soft removal of members, owner-only rules, and an audit event in the same transaction as every access change. Better Auth's organization plugin stores members without a status (removal deletes the row), keeps roles as text with its own permission model, has no entity limits, and exposes its own /api/auth/organization/* endpoints that would change access outside our audited, permission-checked services.

## Decision
Better Auth (1.7) owns identity only: users, accounts, sessions, verifications, two-factor and rate limits, with the twoFactor and emailOTP plugins. Vento owns organizations, entities, roles, role permissions, members, invitations and their limits in its own Drizzle tables, served by oRPC procedures behind requirePermission. Better Auth's tables are written by hand in Drizzle with uuid ids (Postgres uuidv7()), plural snake_case names. These identity tables belong to a person, not an organization, so they carry no organization_id; every other domain table still does. The active organization is a field on our session row. Unused or unaudited Better Auth endpoints are switched off with disabledPaths.

## Consequences
- One API surface for access, typed by the shared contract, audited in the same transaction.
- Brick 3 custom roles and organization switching need no schema change.
- We maintain the Better Auth table definitions ourselves and diff them against `npx auth generate` on every upgrade (guarded by a test).
- Hooks rely on a few Better Auth internals (two-factor cookie, reset token lookup); upgrades must run the auth test suite.
- CLAUDE.md's stack line and decision 0003's "(Better Auth organization)" now mean "our organization table"; the meaning of 0003 is unchanged.

## Alternatives considered
- Organization plugin with extra fields and its endpoints disabled: keeps its tables and constraints but none of its value, and splits access logic across two models.
- Organization plugin as-is: hard deletes on removal, no entity limits, a second unaudited write path.
- Write authentication ourselves: password hashing, TOTP and session handling are where home-grown code goes wrong.
