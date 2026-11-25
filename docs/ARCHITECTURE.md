# Architecture

How the code is laid out and how a request flows through it. The *why* behind the big choices is in `docs/decisions/`. Keep this file current when the structure changes.

## Layout
```
apps/
  api/                     Hono + oRPC server (Node 24)
    src/
      index.ts             starts the HTTP server, graceful shutdown
      app.ts               createApp({ db, mailer?, auth? }): middleware, /health, /api/auth/*, /rpc
      env.ts               zod-validated environment, fails fast on startup
      context.ts           BaseContext every procedure receives (db, headers, auth, mailer)
      orpc.ts              os = implement(contract); authed, member, memberPendingTwoStep builders
      access/              session → membership, requirePermission, who-can-grant, entity scope, system roles
      auth/                createAuth (Better Auth), hooks, session and password policy, security store
      email/               Mailer, dev and memory transports, templates
      router.ts            combines module routers
      db/
        client.ts          pg Pool + Drizzle (snake_case columns); DbOrTx type
        columns.ts         id (uuid, Postgres uuidv7()), timestamps
        schema/            one file per module's tables, re-exported from index.ts
        migrate.ts         applies migrations (a release step, never on app start)
        seed.ts            demo data (pnpm db:seed, development only)
      lib/                 logger, request scope (AsyncLocalStorage), client IP, errors, pagination
      modules/<module>/    <module>.service.ts, <module>.router.ts, <module>.test.ts
      test/                env setup, global setup, factories, rollback helper, HTTP and router clients
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
1. A component calls `useQuery(orpc.account.me.queryOptions())`. The client and its types come from the shared contract, so a mismatch is a compile error.
2. The browser sends `POST /rpc/account/me` to its own origin with its session cookie. In development Vite proxies `/rpc` and `/api` to the API on port 3000; in production web and API share one domain ([decision 0009](decisions/0009-same-origin-web-and-api.md)).
3. Hono adds a request id, security headers and compression, then a **request scope** (AsyncLocalStorage): request id, client IP (socket, or `TRUSTED_IP_HEADER` behind a proxy), masked IP and device. Audit rows and Better Auth hooks read it.
4. oRPC runs the procedure's middleware chain:
   - **`authed`**: Better Auth looks up the session from the cookie (cookie cache off, so a revoked session fails at once), then `enforceSessionPolicy` applies the 30-minute idle and 12-hour limits (deleting an expired session) and records activity at most once a minute. No session → `UNAUTHORIZED {reason: signed_out | session_expired}`.
   - **`member`**: loads the membership in one query (organization from the session, falling back to the latest membership; role, permissions and entity limits). Never cached, so access changes apply on the next request. If the role requires two-step (or it was reset) and it's off → `FORBIDDEN two_step_setup_required`. `memberPendingTwoStep` skips that check, for onboarding only.
   - **`requirePermission(module, action, doing)`**: refuses with "Only owners and admins can invite people. Ask Olumide Bankole (owner)."
5. The service receives a `ServiceContext` (organization, member, user: never from input), filters every query by organization and entity limits (`entityScope`), writes in one transaction with `recordAudit` inside it, and returns. Emails are sent by the router after commit.
6. oRPC validates the output and returns JSON. Unexpected errors are logged with the request id; clients see a generic error. Each request is logged as one JSON line.

### Authentication (`/api/auth/*`)
Better Auth 1.7 ([decision 0010](decisions/0010-better-auth-identity-own-access.md)) serves sign-up, sign-in, email verification, two-step (TOTP and backup codes) and password reset at `/api/auth/*` on the same Hono app. Before handing a request over, our route applies the session policy and replaces the client-IP header with the trusted value. Our hooks add: password rules (length, number, common list, Have I Been Pwned k-anonymity that fails open), password history, terms version, sign-in locks, verification resend limits, two-step lock alerts, and audit events. Passwordless and duplicate session endpoints are switched off (`DISABLED_AUTH_PATHS`). Organizations, roles, members and invitations are ours, in oRPC.

### Identity tables
`users`, `sessions`, `accounts`, `verifications`, `two_factors`, `rate_limits` (Better Auth's, hand-written in `db/schema/auth.ts`) and `auth_attempts`, `sign_in_locks`, `password_histories` belong to a person, not an organization, so they have no `organization_id`. Every other domain table has one. The active organization is a column on the session.

### Better Auth upgrade checklist
1. Pin the exact version (`better-auth` and `@better-auth/drizzle-adapter`).
2. Generate Better Auth's schema into a scratch file (`npx auth generate`) and diff it against `db/schema/auth.ts`; `auth-schema.test.ts` fails when a column is missing.
3. Read the release notes for changes to: the two-factor cookie and verification lookup, the `reset-password:<token>` identifier, `createVerificationOTP`, the 24-hour "don't remember me" session (sessions longer than 25 h are treated as "Keep me signed in"), session defaults applied on rotation, after-hooks keeping the original status (see `withLockStatus` in `app.ts`), and `disabledPaths`.
4. Run `pnpm --filter @vento/api test` (the auth flow tests exercise these over HTTP).

## Conventions that the structure enforces
- **Types live in `packages/shared` only.** The API implements the contract; the web app imports types from it. Never redeclare an API type in `apps/web`.
- **Services hold the logic, routers stay thin.** Services take the context first and are tested against real Postgres.
- **Money** uses `money` (a non-negative 2-dp decimal string; `signedMoney` only for adjustments and reversals) and `Decimal` from `@vento/shared`. Never a JS number. `toMoneyString` refuses amounts too large for `numeric(14,2)`.
- **Lists** take `paginationInput` and return `paginated(item)`: `{ items, page, pageSize, total }`.
- **Imports** use `@/` inside each app. Named exports, except route files.

## Data
- PostgreSQL 18 (Docker locally: `pnpm db:up`). Two databases: `vento` for development, `vento_test` for automated tests.
- Drizzle ORM with `pg` (node-postgres). Postgres `numeric` values arrive as strings, which is what money needs.
- Browse the local database: `pnpm db:studio` (Drizzle Studio at https://local.drizzle.studio), or any Postgres client on `localhost:5432` with the credentials in `.env.example`.
- Schema changes: edit `apps/api/src/db/schema/*`, then `pnpm db:generate`, review the SQL, `pnpm db:migrate` (see the `db-migration` skill).
- Ids are `uuid` defaulting to Postgres 18's `uuidv7()`; organization-scoped tables expose `unique (organization_id, id)` and reference each other with composite foreign keys ([decision 0012](decisions/0012-uuidv7-and-same-organization-keys.md)). Production must run Postgres 18+.
- `audit_events` refuses UPDATE, DELETE and TRUNCATE (trigger), and a deferred trigger keeps at least one active owner per organization (migration `0001_access_guards`).
- Demo data: `pnpm db:seed` (Vento Homes Ltd, three entities, eight people; password from `SEED_PASSWORD`). Development only, idempotent.

## Resilience
- Database pool: 5s connection timeout, 30s statement timeout, and an error listener so a Postgres restart doesn't crash the API.
- Request bodies on `/rpc` are capped at 1 MB.
- Shutdown stops new requests, waits for in-flight ones (up to 10s), then closes the pool.
- Expected errors (validation, not found, forbidden) aren't logged as incidents; real failures are logged with their stack.
- Tests refuse to run unless `TEST_DATABASE_URL` names a database ending in `_test`. Because audit events can't be truncated, the test run drops and recreates the `public` and `drizzle` schemas, then migrates. Service tests run in a rolled-back transaction (`withRollback`); HTTP auth-flow tests commit with unique emails.

## Environment
Every variable is listed in `.env.example` and validated in `apps/api/src/env.ts`. Locally the API reads the repo-root `.env`; in production the host provides variables and no file is read. Tests replace `DATABASE_URL` with `TEST_DATABASE_URL` and use the memory email transport with the breach check and per-IP limits off. Until an email provider is added, the API refuses to start with `NODE_ENV=production`.

## Build and run
| | Development | Production |
|---|---|---|
| API | `tsx watch` on the TypeScript source | `tsdown` bundles to `apps/api/dist` (shared package inlined), run with `node dist/index.mjs` |
| Web | Vite dev server on :5173 | `vite build` to `apps/web/dist`, static files |
| Migrations | `pnpm db:migrate` | `node dist/db/migrate.mjs` as a release step |

## Quality gates
- `pnpm check` (Biome), `pnpm typecheck` (TypeScript 7, strict), `pnpm test` (Vitest: shared schemas, API against Postgres, web components), `pnpm e2e` (Playwright, desktop and mobile).
- CI (`.github/workflows/ci.yml`) runs all of them on every pull request, with a Postgres service. In CI, e2e runs against the production builds (`node dist/index.mjs` and `vite preview`), not the dev servers.
