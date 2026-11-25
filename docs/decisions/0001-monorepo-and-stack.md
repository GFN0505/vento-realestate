# 0001 · Monorepo and stack

- **Date:** 2026-11-25
- **Status:** accepted

## Context
The reference ERP (separate `erp-app` and `erp-api` repos) duplicated types and validation (Joi on the server, zod on the client), had unreliable server pagination, controller boilerplate, slow dev start-up and no tests or CI. Vento must be fast to build, fast to run, and safe with money.

## Decision
One pnpm + Turborepo monorepo: `apps/web` (Vite, React 19, TanStack Router/Query/Table, shadcn/ui, Tailwind v4), `apps/api` (Hono + oRPC on Node 24), `packages/shared` (zod v4 schemas and oRPC contracts). PostgreSQL with Drizzle ORM and drizzle-kit migrations. Better Auth with organizations. Biome, Vitest, Playwright, GitHub Actions. pnpm only.

## Consequences
- One source of truth for types: a contract change breaks the web build at compile time.
- End-to-end type safety without code generation.
- Everyone must work in one repo and run the full check before committing.

## Alternatives considered
- Keep two repos (Express/Joi + React): the duplication we're escaping.
- Next.js full-stack: server components add complexity for an app that is almost entirely behind sign-in; a SPA with a typed API is simpler and faster to navigate.
- tRPC: oRPC gives the same typing plus OpenAPI output for future integrations.
- Prisma: Drizzle is closer to SQL, lighter, and better for `numeric` money and reporting queries.
