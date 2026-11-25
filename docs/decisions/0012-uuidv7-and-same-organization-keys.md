# 0012 · Database-generated UUID v7 ids and same-organization foreign keys

- **Date:** 2026-11-25
- **Status:** accepted

## Context
Non-negotiable 7 asks for UUID v7 ids. Better Auth leaves ids to the database on Postgres when configured for uuid. Separately, a member's role, an invitation's entities and similar references must never point into another organization, and a service check alone can be missed.

## Decision
Every table's id is `uuid primary key default uuidv7()` (native in Postgres 18), declared once in db/columns.ts. Organization-scoped tables expose unique (organization_id, id), and references between them use composite foreign keys (organization_id, x_id) → x(organization_id, id), so a cross-organization reference fails in the database.

## Consequences
- One id strategy for our tables and Better Auth's; no JS uuid dependency.
- Production must run Postgres 18 or later.
- New organization-scoped tables add the unique (organization_id, id) pair and composite foreign keys (in the add-module skill).
- Better Auth's single-use verification rows may get deterministic v5-shaped ids; they are never exposed through our API.

## Alternatives considered
- uuidv7 generated in JS: works, but Better Auth would still need database defaults for its tables.
- Single-column foreign keys plus service checks: one forgotten check leaks data between organizations.
