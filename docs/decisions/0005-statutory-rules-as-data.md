# 0005 · Statutory rules are data with effective dates

- **Date:** 2026-11-25
- **Status:** accepted

## Context
Nigerian tax and payroll rules change (the 2025 tax reform acts take effect from 2026; FIRS became the Nigeria Revenue Service). AML thresholds and deduction rates change too. Hard-coded rates would make historical recalculation wrong and every change a deploy.

## Decision
Tax rates, payroll deductions, AML thresholds and similar rules live in versioned configuration with effective dates, a source and a "last verified" date. Calculations pick the rule effective on the transaction date. They are checked against current law before any change.

## Consequences
- Past payroll and tax reproduce exactly.
- A *Statutory rules admin* screen is needed, and someone owns verifying the rules.

## Alternatives considered
- Constants in code: simple, but wrong the day the law changes.
