# Vento

The operating system for Nigerian real estate developers: land and title, projects and construction, off-plan sales on instalments, finance across SPVs and currencies, estate management, HR and payroll, compliance, documents and contracts, a buyer portal and executive analytics. Built for speed, clarity and trust.

> **Status:** early build. The foundation (brick 1) is in place; product features arrive brick by brick.

## Documentation
Start with the [documentation map](docs/README.md). The essentials:
- [Product](docs/PRODUCT.md): vision, personas, the ten modules
- [Domain](docs/DOMAIN.md): vocabulary and business rules
- [User journeys](docs/journeys/README.md): step-by-step walkthroughs, starting with [the golden thread](docs/journeys/00-golden-thread.md)
- [Screens](docs/design/SCREENS.md): every screen and its status
- [Decisions](docs/decisions/README.md): why the big choices were made

## Stack
pnpm + Turborepo monorepo · Hono + oRPC on Node 24 · PostgreSQL + Drizzle · Better Auth · Vite + React 19 + TanStack · shadcn/ui + Tailwind v4 · Biome, Vitest, Playwright. See [decision 0001](docs/decisions/0001-monorepo-and-stack.md).

## Getting started
Needs Node 24 (see `.nvmrc`; [fnm](https://github.com/Schniz/fnm) switches automatically), pnpm (`corepack enable pnpm`) and Docker.

```bash
cp .env.example .env
pnpm install
pnpm db:up
pnpm db:migrate
pnpm dev
```

Open http://localhost:5173. Before committing: `pnpm check && pnpm typecheck && pnpm test`. End-to-end tests: `pnpm e2e` (first run: `pnpm --filter @vento/web exec playwright install chromium`).

How the code is organised: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Working on it
Development is done with Claude Code using the agents in `.claude/agents/` and the recipes in `.claude/skills/`. Project rules are in [CLAUDE.md](CLAUDE.md).
