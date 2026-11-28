# 0026 · An approvable action can require a rule

- **Date:** 2026-11-28
- **Status:** accepted (owner, 28 Nov 2026: land slice 2 plan, §13 question 1). Amends 0024 for the actions that declare it.

## Context
Decision 0024 runs a guarded action at once when no rule matches, so owners can switch approvals
off. Clearing an encumbrance unblocks sales on land under a court order or caveat; the approved
spec says nothing unblocks it except the last approval. Deleting the rule, or narrowing it to some
companies, would let one person clear it in the others.

## Decision
- The approvals catalog gains `whenNoRule: 'run' | 'refuse'`. `run` keeps 0024's behaviour;
  `refuse` makes `requestOrRun` refuse (CONFLICT `no_rule`: "Clearing an encumbrance needs an
  approval rule for Lekki Pearl Estates Ltd. Ask an owner to add one in Approval rules.") before
  anything is saved, and `approvals.preview` report it as `blocked`, so the web says it first.
- `land.encumbrance.clear` is the first `refuse` action. Money actions that must never run on one
  person's say-so (receipt reversal, refunds, payroll, payments out) should declare it too.
- The rules page shows companies an action with `refuse` doesn't cover (`uncovered`), and "No rule
  yet" when it has none.
- The catalog also declares each action's feature (`feature`, null for platform actions), so rules
  for unavailable features stay hidden and can't be written; and a `doing` phrase ("Clearing an
  encumbrance") for the refusal's words.

## Consequences
- Owners still choose who approves and in which order, but can't turn approval off for these.
- Every new action must choose `run` or `refuse`; the catalog test fails without it.
- An organization whose rule is deleted can't clear until an owner adds one (the message says so).

## Alternatives considered
- Forbid deleting the last rule for an action: doesn't cover company-limited rules, and the engine
  would still run at once if data drifted.
- Execute only when a request exists, inside the land plug-in: puts approval policy in a module,
  which 0024 avoided.
- Keep 0024 as is: contradicts the spec's success criterion and the purpose of 0006.
