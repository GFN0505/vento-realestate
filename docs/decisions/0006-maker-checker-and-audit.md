# 0006 · Maker-checker approvals and append-only audit

- **Date:** 2026-11-25
- **Status:** accepted

## Context
Developers handle large sums and legal documents. Owners need to trust that no single person can reverse a receipt, release a refund or change prices unnoticed.

## Decision
Sensitive actions (receipt reversal, refunds, payroll, price lists, POs, manual journals, and others per organization) create an **approval request**; the action runs only when a different member approves. Every create, change, approval and export writes an append-only **audit event** with before and after values.

## Consequences
- Sensitive services are written as "request → approve → execute" from the start.
- Every record shows its timeline.

## Alternatives considered
- Permissions alone: stops the wrong person, not the right person making a mistake or acting alone.
