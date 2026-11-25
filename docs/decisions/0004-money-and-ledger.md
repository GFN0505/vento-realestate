# 0004 · Money as decimals, append-only ledger per entity

- **Date:** 2026-11-25
- **Status:** accepted

## Context
Buyers pay in NGN and in foreign currency over years. Every naira must trace from instalment to receipt to ledger, and floating-point errors are unacceptable.

## Decision
Amounts are `numeric(14,2)` in Postgres, strings in TypeScript, calculated with a decimal library. Currency (ISO 4217, default NGN) sits beside every amount; foreign amounts also store the FX rate, its source and date. The ledger is double-entry per entity, append-only, and every entry balances. Corrections are reversing entries.

## Consequences
- No `number` type for money anywhere, enforced in review.
- Reversal flows instead of edits or deletes.
- Multi-table money writes always run in one transaction.

## Alternatives considered
- Integer kobo: awkward across currencies and FX, and still needs decimals for rates.
- Mutable ledger rows: faster to build, impossible to audit.
