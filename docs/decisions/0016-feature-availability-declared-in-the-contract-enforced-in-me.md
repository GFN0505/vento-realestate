# 0016 · Feature availability: declared in the contract, enforced in member, read from memory

- **Date:** 2026-11-26
- **Status:** accepted

## Context
Every feature must be released to an organization and paid for before anyone there can see or call it, and this must hold on the server for every procedure, add no database query per request, and take effect within 30 seconds of a change. Modules will add hundreds of procedures over the next releases; a per-procedure check written by hand would eventually be forgotten.

## Decision
Each oRPC contract procedure declares meta.feature: a catalog key, or null for platform procedures without a flag. memberMiddleware, after the tab guard, the membership load and the two-step check, reads the procedure's meta and answers NOT_FOUND when the feature isn't available, before requirePermission runs. Availability = released (stage, release group, release override) and entitled (core, internal group, entitlement override, plan version, add-on) and every prerequisite available; stage off beats everything. The organization's release group and plan version come from the membership query that already runs; stages, plan versions, live overrides and active add-ons come from an in-memory snapshot that each API server reloads every 10 seconds; expiry is compared at read time. Plan limits are checked inside the create's transaction under a row lock on the organization's plan row and refused with FORBIDDEN plan_limit. account.me returns the available features (and, to owners only, plan, limits and upgrade hints), so navigation renders correctly on first paint. A walk test fails if any procedure lacks the declaration or a feature-keyed procedure isn't on member.

## Consequences
- A procedure can't be callable without being gated: the contract is the single declaration, and the test enforces it.
- Unavailable looks like "doesn't exist": one path in the web app, no API error doubles as a sales message.
- Changes reach every server within 10 seconds and the web on its next me; up to ~40 seconds end to end in the worst case.
- Each server holds the whole snapshot in memory; fine for thousands of organizations, revisit if overrides grow very large.
- Jobs, messages and webhooks must call availabilityForOrganization themselves; Paystack webhooks never drop money.

## Alternatives considered
- .use(requireFeature(key)) by hand in each router: same effect, but a forgotten line is silent; meta in the contract is also visible to tests and tools.
- Query the database per request: simplest and always fresh, but adds a query to every call against the owner's speed requirement.
- LISTEN/NOTIFY or a revision table: faster propagation, but a dedicated connection or triggers to maintain; a 10-second reload of a tiny dataset is enough.
- FORBIDDEN for features outside the plan: leaks what exists to every member and turns errors into upsell; owners get hints from me instead.
