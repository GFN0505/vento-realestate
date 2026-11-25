# Decision records

Short records of decisions that shape the product or the code, so nobody has to rediscover *why*. One file per decision, numbered, never rewritten: when a decision changes, add a new record that **supersedes** the old one and mark the old one `superseded by NNNN`.

Write one when a choice is hard to reverse, affects several modules, or will make a future reader ask "why did they do it this way?". The architect proposes them in plans; whoever implements the plan commits them.

| # | Decision | Status |
|---|---|---|
| [0001](0001-monorepo-and-stack.md) | Monorepo and stack | accepted |
| [0002](0002-developers-only-all-modules.md) | Developers only, all ten modules in v1 | accepted |
| [0003](0003-organization-and-entities.md) | Organization contains entities (SPVs) | accepted |
| [0004](0004-money-and-ledger.md) | Money as decimals, append-only ledger per entity | accepted |
| [0005](0005-statutory-rules-as-data.md) | Statutory rules are data with effective dates | accepted |
| [0006](0006-maker-checker-and-audit.md) | Maker-checker approvals and append-only audit | accepted |
| [0007](0007-ai-optional-add-on.md) | AI is an optional, suggest-only add-on, cheapest model that passes | accepted |
| [0008](0008-public-repository.md) | The repository is public | accepted |
| [0009](0009-same-origin-web-and-api.md) | Web and API on the same origin | accepted |

Template: [0000-template.md](0000-template.md)
