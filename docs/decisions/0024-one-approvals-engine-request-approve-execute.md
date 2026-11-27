# 0024 · One approvals engine: request, approve, execute

- **Date:** 2026-11-26
- **Status:** accepted

## Context
Decision 0006 says sensitive actions run only after a different member approves them. Brick 4 builds this before any money module exists, and receipts, refunds, price lists, POs, payroll and journals will all need it. If each module builds its own "pending" state, the rules, the inbox, separation of duties and the audit trail would each be built several times, and some would drift.

## Decision
- **One engine** in `apps/api/src/approvals/`. A module registers each approvable action as a plug-in with:
  - a payload schema;
  - `describe` (the change, its company and amount);
  - `excluded` (who mustn't approve, and why);
  - `execute` (re-check the record and do the action).
- **One call.** The module's service calls `requestOrRun`. With no matching rule the action runs at once. With a rule, a request is saved, and nothing else changes until the last step is approved; `execute` then runs in the same transaction as that approval.
- **The rule's steps are copied onto the request** as rows, so editing a rule never changes a request in flight.
- **The maker** can never decide, nobody decides two steps, and eligibility (role in the step, `approve` in the module, company access) is checked in SQL at decision time under a row lock.
- **Decisions are append-only**, like audit events (decision 0011).
- **The change is the maker's.** The action's audit event names the maker as actor and the approvers in order.
- **Rules are the only place approval limits live.** Roles carry no separate limits.

## Consequences
- A new sensitive action is a catalog entry plus a plug-in file; the inbox, rules page, emails and audit come for free.
- A guarded action must never be reachable except through `requestOrRun`. Review and the security audit check this, and a test walks the catalog.
- `execute` must tolerate time passing: it re-checks the record and raises a stale error, which expires the request instead of applying an out-of-date change.
- Any role with `approve` requires two-step.

## Alternatives considered
- **A pending status on each module's own records:** duplicated logic per module, and no single inbox or rule set.
- **Approvals as a generic "edit this row" diff applied by the engine:** bypasses each module's own validation and ledger rules.
- **Executing at request time and reversing on rejection:** money and documents would leave before approval (emails, Paystack, ledger), which breaks 0006.
- **Approval limits stored on roles:** two places to look, and they can't express chains or companies.
