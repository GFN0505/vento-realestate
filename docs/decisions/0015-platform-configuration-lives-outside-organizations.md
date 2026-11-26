# 0015 · Platform configuration lives outside organizations

- **Date:** 2026-11-26
- **Status:** accepted

## Context
Feature flags and plans (docs/specs/feature-flags.md) need data that belongs to Vento, not to any customer: the release stage of each feature, the plans and their versions, who is a Vento super-admin, and the trail of changes to all of these. Non-negotiable 1 says every domain table has an organizationId. Statutory rules (decision 0005) are the same kind of data, shared by all organizations and versioned.

## Decision
Platform configuration tables carry no organization_id: feature_releases, plans, plan_versions, platform_admins and platform_audit_events. Data about one organization stays organization-scoped as usual: organization_plans (release group and plan version), organization_add_ons, organization_trials and organization_overrides each have organization_id NOT NULL, indexed, and are in the isolation test. Platform tables are written only by platform operations (the pnpm flags/plans/superadmin commands now, the super-admin console later), never by customer-facing procedures, and are read by the server to decide availability. Plan versions and platform audit events are append-only (triggers). A super-admin is a platform role on the user (platform_admins), never an organization role, and needs two-step. Each change writes a platform audit event in the same transaction and, when it affects one organization, a plain-words event in that organization's audit trail, without Vento's internal reason or the staff member's identity.

### Trust model until the console (added after the security review)
Until the R2 super-admin console brings real sign-in, the commands run on the API host with its `DATABASE_URL`: **a shell plus `DATABASE_URL` on that host is super-admin power.** `--by` is attribution, not authentication: it must name an active super-admin with two-step on, and the person at the keyboard is recorded as the operator (`VENTO_OPERATOR` set by devops per person, else `SUDO_USER`, else the SSH client address, else `os-user@host`). Host access is therefore granted only to people who would be super-admins anyway, and the production roles in `docs/RUNBOOK.md` keep the app and command role from disabling the append-only triggers.

### Staff names in the platform trail
Platform audit rows keep the staff member's name and operator permanently, even though they are append-only. The basis is accountability (NDPA: legitimate interest in a reliable record of who changed a customer's access or terms): without it, a change to what a customer can use or pays for can't be explained or challenged. Only the name, the operator string and the reason are kept, never contact details, and customers' own trails show "Vento", not the person.

## Consequences
- One place defines what each plan contains; organizations reference versions, so a customer's deal never changes under them.
- Reviewers must treat a new table without organization_id as an exception that needs this record or a new one.
- The platform audit trail is separate from organizations' trails; a console will need its own viewer.
- Customer data can't leak through these tables because they hold no customer data; the per-organization tables follow every isolation rule.

## Alternatives considered
- organization_id on every table, with plans copied per organization: duplicates plan contents, makes "publish a new version" a fan-out write, and blurs who owns the data.
- A nullable organization_id meaning "platform": breaks the NOT NULL rule and complicates every query and index.
- A third-party flag service: personal and commercial data leaves our database, adds a processor under the NDPA, and still needs plans locally.
