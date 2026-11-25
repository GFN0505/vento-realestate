# 0008 · The repository is public

- **Date:** 2026-11-25
- **Status:** accepted

## Context
The owner chose to host the code publicly on GitHub.

## Decision
The repository is public. Secrets never enter it: `.env` is git-ignored and keys are documented in `.env.example`. A secret scan runs before every commit and in CI. Seed and fixture data are fictional.

## Consequences
- No customer data, real names or credentials in fixtures, docs or tests.
- Security relies on server-side checks, never on obscurity.

## Alternatives considered
- Private repository: hides mistakes rather than preventing them; can be revisited if commercial reasons require it.
