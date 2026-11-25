# Architecture

How the code is laid out and how a request flows through it. The *why* behind the big choices is in `docs/decisions/`. Keep this file current when the structure changes.

## Layout
```
apps/
  api/                     Hono + oRPC server (Node 24)
    src/
      index.ts             starts the HTTP server, graceful shutdown
      app.ts               createApp({ db }): middleware, /health, /rpc
      env.ts               zod-validated environment, fails fast on startup
      context.ts           BaseContext every procedure receives
      orpc.ts              os = implement(contract): procedures must match the shared contract
      router.ts            combines module routers
      db/
        client.ts          pg Pool + Drizzle (snake_case columns)
        schema/            one file per module's tables, re-exported from index.ts
        migrate.ts         applies migrations (a release step, never on app start)
      lib/logger.ts        structured JSON logs
      modules/<module>/    <module>.service.ts, <module>.router.ts, <module>.test.ts
      test/                test env setup and global setup (migrates the test database)
    drizzle/               generated SQL migrations (committed)
  web/                     Vite + React 19 SPA
    src/
      main.tsx             QueryClient + router
      router.tsx           router instance, typed context
      routes/              file-based routes (TanStack Router); routeTree.gen.ts is generated
      components/          shared UI
      lib/orpc.ts          typed API client + TanStack Query helpers
    e2e/                   Playwright journeys (one spec per journey in docs/journeys)
packages/
  shared/                  zod schemas and oRPC contracts: the single source of API types
    src/
      common/              id, money, currency, isoDate, pagination, Decimal
      <module>/contract.ts contract per module, combined in contract.ts
```

## A request, end to end
1. A component calls `useQuery(orpc.health.check.queryOptions())`. The client and its types come from the shared contract, so a mismatch is a compile error.
2. The browser sends `POST /rpc/health/check` to its own origin. In development Vite proxies `/rpc` to the API on port 3000; in production web and API share one domain ([decision 0009](decisions/0009-same-origin-web-and-api.md)).
3. Hono adds a request id and security headers, then hands `/rpc/*` to the oRPC handler with the context (`db`, `requestId`; auth adds the member and organization in brick 2).
4. oRPC validates input against the contract's zod schema, runs the procedure, validates output, and returns JSON. Unexpected errors are logged with the request id; clients see a generic error.
5. Each request is logged as one JSON line: method, path, status, duration, request id.

## Conventions that the structure enforces
- **Types live in `packages/shared` only.** The API implements the contract; the web app imports types from it. Never redeclare an API type in `apps/web`.
- **Services hold the logic, routers stay thin.** Services take the context first and are tested against real Postgres.
- **Money** uses `money` (a non-negative 2-dp decimal string; `signedMoney` only for adjustments and reversals) and `Decimal` from `@vento/shared`. Never a JS number. `toMoneyString` refuses amounts too large for `numeric(14,2)`.
- **Lists** take `paginationInput` and return `paginated(item)`: `{ items, page, pageSize, total }`.
- **Imports** use `@/` inside each app. Named exports, except route files.

## Data
- PostgreSQL 18 (Docker locally: `pnpm db:up`). Two databases: `vento` for development, `vento_test` for automated tests.
- Drizzle ORM with `pg` (node-postgres). Postgres `numeric` values arrive as strings, which is what money needs.
- Schema changes: edit `apps/api/src/db/schema/*`, then `pnpm db:generate`, review the SQL, `pnpm db:migrate` (see the `db-migration` skill).

## Resilience
- Database pool: 5s connection timeout, 30s statement timeout, and an error listener so a Postgres restart doesn't crash the API.
- Request bodies on `/rpc` are capped at 1 MB.
- Shutdown stops new requests, waits for in-flight ones (up to 10s), then closes the pool.
- Expected errors (validation, not found, forbidden) aren't logged as incidents; real failures are logged with their stack.
- Tests refuse to run unless `TEST_DATABASE_URL` names a database ending in `_test`.

## Environment
Every variable is listed in `.env.example` and validated in `apps/api/src/env.ts`. Locally the API reads the repo-root `.env`; in production the host provides variables and no file is read. Tests replace `DATABASE_URL` with `TEST_DATABASE_URL`.

## Build and run
| | Development | Production |
|---|---|---|
| API | `tsx watch` on the TypeScript source | `tsdown` bundles to `apps/api/dist` (shared package inlined), run with `node dist/index.mjs` |
| Web | Vite dev server on :5173 | `vite build` to `apps/web/dist`, static files |
| Migrations | `pnpm db:migrate` | `node dist/db/migrate.mjs` as a release step |

## Quality gates
- `pnpm check` (Biome), `pnpm typecheck` (TypeScript 7, strict), `pnpm test` (Vitest: shared schemas, API against Postgres, web components), `pnpm e2e` (Playwright, desktop and mobile).
- CI (`.github/workflows/ci.yml`) runs all of them on every pull request, with a Postgres service. In CI, e2e runs against the production builds (`node dist/index.mjs` and `vite preview`), not the dev servers.
