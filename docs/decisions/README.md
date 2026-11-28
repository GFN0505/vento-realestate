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
| [0015](0015-platform-configuration-lives-outside-organizations.md) | Platform configuration lives outside organizations | accepted (trust model amended by 0021; super-admins by 0023) |
| [0016](0016-feature-availability-declared-in-the-contract-enforced-in-me.md) | Feature availability: declared in the contract, enforced in member, read from memory | accepted |
| [0017](0017-transactional-email-through-postmark-with-delivery-tracked-o.md) | Transactional email through Postmark, with delivery tracked on invitations | accepted |
| [0018](0018-entities-are-called-companies-on-screen.md) | Entities are called companies on screen; code keeps "entity" | accepted |
| [0019](0019-passkeys-count-as-two-step.md) | Passkeys count as two-step; the authenticator app stays the fallback | accepted (host updated by 0022) |
| [0020](0020-approximate-place-from-an-offline-ip-database.md) | Approximate place from an offline IP database, looked up once at sign-in | accepted |
| [0021](0021-the-console-is-a-separate-area-behind-fresh-two-step.md) | The console is a separate area on the same origin, behind fresh two-step | accepted (amends 0015's trust model; entry path amended by 0023, host by 0022) |
| [0022](0022-the-product-is-always-called-vento-real-estate.md) | The product is always called Vento Real Estate | accepted |
| [0023](0023-staff-accounts-are-separate-from-customer-accounts.md) | Staff accounts are separate from customer accounts and join by invitation | accepted (amends 0015 and 0021) |
| [0024](0024-one-approvals-engine-request-approve-execute.md) | One approvals engine: request, approve, execute | accepted (no-rule behaviour amended by 0026) |
| [0025](0025-private-file-storage.md) | Private file storage: one S3-compatible bucket, direct multipart uploads, short-lived signed links | accepted |
| [0026](0026-an-approvable-action-can-require-a-rule.md) | An approvable action can require a rule | accepted (amends 0024 for actions that declare it) |
| [0027](0027-the-sales-block-is-a-rule.md) | The sales block is a rule, not a stored status | accepted |

Template: [0000-template.md](0000-template.md)
