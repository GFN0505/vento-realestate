# 0014 · The current entity is a view filter in the URL, never an access input

- **Date:** 2026-11-26
- **Status:** accepted

## Context
Finance, payroll, contracts and bank data belong to entities (SPVs), and members can be limited to some entities. The shell adds an entity switcher. We must decide where the choice lives and what it means to the server before any entity-owned module ships.

## Decision
The chosen entity is held in the page address (`?entity=<id>`), kept across navigation, and remembered per organization on the device. It is a filter only. Procedures that support it take an optional `entityId` input; the service intersects it with the member's entity limits (`entityScope`), so an entity outside the limits returns an empty list or NOT_FOUND, exactly like one that doesn't exist. It is never a header and never part of the session. The web drops an unavailable entity from a link with one neutral message.

## Consequences
- Links carry the entity, so shared links and back/forward work.
- Access stays defined in one place (member entity limits); the switcher can't widen it.
- Every entity-aware list procedure must accept `entityId` explicitly and test the intersection.

## Alternatives considered
- Entity on the session (like the organization): breaks shared links and makes two tabs fight over one value.
- Entity in a request header: invisible in links, and invites treating it as authorization.
- Local storage only: not shareable, and lost when someone opens a link on another device.
