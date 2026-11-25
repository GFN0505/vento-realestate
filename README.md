# Vento

The operating system for Nigerian real estate developers: land and title, projects and construction, off-plan sales on instalments, finance across SPVs and currencies, estate management, HR and payroll, compliance, documents and contracts, a buyer portal and executive analytics. Built for speed, clarity and trust.

> **Status:** pre-build. The product, domain, user journeys and designs are documented; the code scaffold is next.

## Documentation
Start with the [documentation map](docs/README.md). The essentials:
- [Product](docs/PRODUCT.md): vision, personas, the ten modules
- [Domain](docs/DOMAIN.md): vocabulary and business rules
- [User journeys](docs/journeys/README.md): step-by-step walkthroughs, starting with [the golden thread](docs/journeys/00-golden-thread.md)
- [Screens](docs/design/SCREENS.md): every screen and its status
- [Decisions](docs/decisions/README.md): why the big choices were made

## Stack
pnpm + Turborepo monorepo · Hono + oRPC on Node 24 · PostgreSQL + Drizzle · Better Auth · Vite + React 19 + TanStack · shadcn/ui + Tailwind v4 · Biome, Vitest, Playwright. See [decision 0001](docs/decisions/0001-monorepo-and-stack.md).

## Working on it
Development is done with Claude Code using the agents in `.claude/agents/` and the recipes in `.claude/skills/`. Project rules are in [CLAUDE.md](CLAUDE.md).
