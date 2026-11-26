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
| [0010](0010-better-auth-identity-own-access.md) | Better Auth for identity; organizations and access are ours | accepted |
| [0011](0011-append-only-audit-events.md) | Audit events: one append-only table, written in the caller's transaction | accepted |
| [0012](0012-uuidv7-and-same-organization-keys.md) | Database-generated UUID v7 ids and same-organization foreign keys | accepted |
| [0013](0013-tab-organization-guard.md) | Each tab names its organization; the server refuses a mismatch | accepted |
| [0014](0014-entity-is-a-view-filter.md) | The current entity is a view filter in the URL, never an access input | accepted |
| [0015](0015-platform-configuration-lives-outside-organizations.md) | Platform configuration lives outside organizations | accepted |
| [0016](0016-feature-availability-declared-in-the-contract-enforced-in-me.md) | Feature availability: declared in the contract, enforced in member, read from memory | accepted |
| [0017](0017-transactional-email-through-postmark-with-delivery-tracked-o.md) | Transactional email through Postmark, with delivery tracked on invitations | accepted |
| [0018](0018-entities-are-called-companies-on-screen.md) | Entities are called companies on screen; code keeps "entity" | accepted |
| [0019](0019-passkeys-count-as-two-step.md) | Passkeys count as two-step; the authenticator app stays the fallback | proposed |
| [0020](0020-approximate-place-from-an-offline-ip-database.md) | Approximate place from an offline IP database, looked up once at sign-in | proposed |

Template: [0000-template.md](0000-template.md)
