# Documentation map

Everything about Vento Real Estate that isn't code lives in `docs/`. If you're new, read in this order: **PRODUCT → DOMAIN → journeys/00-golden-thread → SCREENS**.

| Document | What it answers | Owner (agent) | Update when |
|---|---|---|---|
| [PRODUCT.md](PRODUCT.md) | What we're building, for whom, the ten modules, what we won't build | product-manager | Scope changes (owner approves) |
| [DOMAIN.md](DOMAIN.md) | Vocabulary, statuses, business rules, open questions | product-manager, architect | A new term, status or rule appears |
| [journeys/](journeys/README.md) | Step-by-step user walkthroughs; each becomes an e2e test and a help article | product-manager (writes), tester (tests) | A flow is added or changes |
| [specs/](specs/README.md) | One spec per feature: problem, flow, acceptance criteria | product-manager | Before building any feature |
| [research/](research/) | Background research that guides later work (e.g. [role homes](research/role-homes.md)), with sources | product-manager | Before designing or speccing a large area |
| [plans/](plans/) | The architect's technical plan for each brick: tables, API, permissions, files, tests | architect proposes, owner approves | Before building a brick |
| [reviews/](reviews/) | Hands-on review guide per brick: try each feature, tick it or note changes | whoever opens the PR | Every brick, before merge |
| [decisions/](decisions/README.md) | Why the big choices were made | architect proposes, implementer commits | A hard-to-reverse or cross-module choice |
| [design/claude-design/](design/claude-design/README.md) | The approved designs: 419 boards from Claude Design | (exported, never hand-edited) | A new design pass is exported |
| [design/DESIGN-NOTES.md](design/DESIGN-NOTES.md) | Tokens, product rules the designs set, designer's notes, fictional world | frontend, ui-designer | A new design pass |
| [design/SCREENS.md](design/SCREENS.md) | Every screen, its design board and build status | product-manager, frontend | A screen is added, built or changed |
| [design/CHANGES.md](design/CHANGES.md) | Where a build deliberately differs from its design | frontend | A designed screen is changed |
| [design/](design/) prompts | Claude Design prompts used to produce the designs | product-manager | A new design pass |
| [help/](help/README.md) | Customer help-centre articles | frontend (writes), ui-designer (reviews copy) | A journey ships |
| [../CHANGELOG.md](../CHANGELOG.md) | What changed, release by release, in customers' words | whoever ships | Every user-visible change |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the code is laid out, request lifecycle, data, build and quality gates | architect | Structure changes |
| [RUNBOOK.md](RUNBOOK.md) | Environments, deploys, database roles, backups, restore, incident steps (pre-launch requirements first) | devops | Infrastructure changes |
| [../.env.example](../.env.example) | Every environment variable and what it's for | backend, devops | A variable is added |
| `ai/evals/RESULTS.md` *(first AI feature)* | Which model each AI feature uses and why | ai | An eval is run |

## Definition of done (documentation)
A change isn't done until, in the same commit:
1. The **journey** matches what was built and its e2e test passes (status `built`).
2. **SCREENS.md** status is updated; any departure from a design is in **CHANGES.md**.
3. New terms, statuses or rules are in **DOMAIN.md**.
4. A **decision record** exists for any hard-to-reverse choice.
5. A **help article** exists for any shipped journey.
6. **CHANGELOG.md** has a line for any user-visible change.
7. New environment variables are in **.env.example**.
