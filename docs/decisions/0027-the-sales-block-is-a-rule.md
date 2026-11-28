# 0027 · The sales block is a rule, not a stored status

- **Date:** 2026-11-28
- **Status:** accepted (owner, 28 Nov 2026: land slice 2 plan)

## Context
A court order, caveat, lien or family dispute (and a mortgage when chosen) must stop new sales on a
parcel's units from the moment it's recorded until clearing is approved. Units belong to projects,
projects sit on one or more parcels, and neither exists yet. DOMAIN said units become `blocked`.

## Decision
- A parcel is blocked while any of its encumbrances is active and blocks sales. Nothing stores
  it: `apps/api/src/modules/land/sales-block.ts` works it out from a partial index
  (`encumbrances_blocking_idx`).
- Projects and Sales call `assertParcelsNotBlocked(tx, ctx, parcelIds)` before a reservation or a
  subscription (it locks the parcels FOR SHARE; recording an encumbrance locks the parcel FOR
  UPDATE; refused with CONFLICT `sales_blocked`), and `blockedParcels` to show it. Neither keeps
  its own copy or flag.
- A unit's own `blocked` status, if Sales keeps one, means "held back by the developer", never this.
- Existing subscriptions keep collecting; only new reservations and subscriptions are refused.

## Consequences
- Recording and clearing take effect everywhere in the same transaction, with nothing to resync.
- Every sell path must call the rule; review and the Sales tests check it.
- Showing "blocked" on many units costs one indexed query per page of parcels.

## Alternatives considered
- Set units to `blocked` when an encumbrance is recorded: has to be kept in sync with clearing,
  project links and new units, and units don't exist yet.
- A `blocked` flag on parcels: a second source of truth that triggers would have to maintain.
