---
name: review-checklist
description: The project's code-review checklist — organization isolation and entity scoping, authorization, money correctness, security (OWASP), data integrity, performance, conventions, with grep commands to find common violations. Use when reviewing a diff or auditing code.
---

# Review checklist

Start with `git diff main...HEAD --stat`, then read each changed file **and** its callers.

## 1. Organization isolation and entity scoping (critical)
- Every Drizzle query on a domain table includes `organizationId` from `context`, never from `input`.
  `rg -n "db\.(select|update|delete)|\.from\(|\.update\(|\.delete\(" apps/api/src/modules` and check each one.
- Inserts set `organizationId` from context, and referenced ids (unitId, buyerId, entityId, …) are confirmed to belong to the same organization.
- Lookups by id return `NOT_FOUND` (not `FORBIDDEN`) for another organization's row, so ids can't be probed.
- Records that belong to an entity (ledger entries, bank accounts, payroll, contracts) carry the right `entityId`, and members limited to certain entities or projects can't read or write outside them.
- File/media URLs are signed or scoped. No guessable public paths for private documents.

## 2. Authorization
- Every procedure uses `authed` plus `requirePermission(module, action)`. Public procedures are explicit and reviewed.
- Role changes and invites can't raise a member above the inviter's own role.

Console: every `console.*` contract path is built on `staff` (`area: 'console'`) and its procedure on `consoleWindow`, never `member`; `apps/api/src/platform/console/` never imports buyer, finance or document tables:
`grep -rnE "schema/(buyer|finance|document|subscription|receipt)" apps/api/src/platform/console/` should return nothing.

## 3. Money and dates
- No `number` maths on money. Look for `parseFloat`, `Number(`, `+` and `*` near amount fields.
- Rounding happens once, at the end, half-up to 2 dp. Totals equal the sum of their lines.
- Due dates use `date`, not `timestamptz`. Timezones are handled when computing "overdue".
- Multi-currency amounts carry currency, FX rate, rate source and rate date (and the NGN equivalent). No conversion with an unrecorded rate.
- Ledger entries balance (debits = credits per entry and entity), are append-only, and corrections are reversing entries.
- Instalment status is derived from receipts and allocations, never set by hand.
- Partial payments, overpayment and allocation oldest due first have tests.

## 4. Security (OWASP Top 10)
- All input is validated by a zod contract. No raw `sql` with interpolated user input (use `sql` placeholders).
- No secrets, tokens or `.env` values in code, logs or error messages. The repo is **public**.
- No `dangerouslySetInnerHTML` without sanitizing. Rich text is sanitized on the server.
- Uploads: type and size limits, content-type checked, stored outside the web root.
- Auth: rate limits on login, reset and invite. Sessions invalidated on password change.
- New dependencies are maintained and needed.

## 5. Data integrity
- Multi-table writes are in a transaction. Invariants are also enforced in the DB (unique, check, FK).
- Status changes follow the allowed transitions in `docs/DOMAIN.md`. Invariants hold, e.g. one active subscription per unit (partial unique index plus a service `CONFLICT`).
- Deleting master data with history is blocked (archive instead).

## 5b. Approvals, audit and AI
- Sensitive actions (receipt reversal, refunds, payroll approval, price list changes, POs, manual journals) go through approval rules; the maker can't approve their own request, and the action runs only on approval.
- Every change writes an audit event with before/after values.
- AI calls go only through the AI gateway: feature flag checked, budget checked, input redacted, usage recorded. AI output is stored as a suggestion and changes nothing until accepted. A manual path exists and works with AI off.
- Text from documents, bank narrations or user questions can't change AI instructions or reach write tools.

## 6. Performance
- No N+1: no queries inside loops. Use joins or `inArray`.
- Lists are paginated on the server, and filtered and sorted columns are indexed.
- Web: no request waterfalls (use route loaders), no fetching in `useEffect`, large lists virtualized, images sized and lazy-loaded.

## 7. Conventions
- Types imported from `packages/shared`, not redeclared.
- shadcn components only, design tokens only, no hex.
- No `any`, no unused code, no stray `console.log`.
- Names match `docs/DOMAIN.md`.

## 8. Tests
Changed behaviour has tests, including a cross-organization access test for new resources.

## 9. Documentation
In the same diff (see the definition of done in `docs/README.md`): the journey matches the behaviour and its status is updated, `SCREENS.md`/`CHANGES.md` are current, new terms are in `DOMAIN.md`, a decision record exists for any hard-to-reverse choice, a help article exists for a shipped journey, `CHANGELOG.md` has user-visible changes, and new env vars are in `.env.example`.

## Reporting
Only report what you verified in the code. For each finding: severity, `path:line`, the problem, a concrete failure scenario, and the fix.
