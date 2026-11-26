# 0015 · Platform configuration lives outside organizations

- **Date:** 2026-11-26
- **Status:** accepted

## Context
Feature flags and plans (docs/specs/feature-flags.md) need data that belongs to Vento, not to any customer: the release stage of each feature, the plans and their versions, who is a Vento super-admin, and the trail of changes to all of these. Non-negotiable 1 says every domain table has an organizationId. Statutory rules (decision 0005) are the same kind of data, shared by all organizations and versioned.

## Decision
Platform configuration tables carry no organization_id: feature_releases, plans, plan_versions, platform_admins and platform_audit_events. Data about one organization stays organization-scoped as usual: organization_plans (release group and plan version), organization_add_ons, organization_trials and organization_overrides each have organization_id NOT NULL, indexed, and are in the isolation test. Platform tables are written only by platform operations (the pnpm flags/plans/superadmin commands now, the super-admin console later), never by customer-facing procedures, and are read by the server to decide availability. Plan versions and platform audit events are append-only (triggers). A super-admin is a platform role on the user (platform_admins), never an organization role, and needs two-step. Each change writes a platform audit event in the same transaction and, when it affects one organization, a plain-words event in that organization's audit trail, without Vento's internal reason or the staff member's identity.

## Consequences
- One place defines what each plan contains; organizations reference versions, so a customer's deal never changes under them.
- Reviewers must treat a new table without organization_id as an exception that needs this record or a new one.
- The platform audit trail is separate from organizations' trails; a console will need its own viewer.
- Customer data can't leak through these tables because they hold no customer data; the per-organization tables follow every isolation rule.

## Alternatives considered
- organization_id on every table, with plans copied per organization: duplicates plan contents, makes "publish a new version" a fan-out write, and blurs who owns the data.
- A nullable organization_id meaning "platform": breaks the NOT NULL rule and complicates every query and index.
- A third-party flag service: personal and commercial data leaves our database, adds a processor under the NDPA, and still needs plans locally.
