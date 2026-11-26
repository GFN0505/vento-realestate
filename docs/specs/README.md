# Feature specs

One file per feature, written by the **product-manager** agent before the architect plans it. Copy [`_template.md`](_template.md) to `docs/specs/<feature>.md`.

A spec links to the journeys it adds or changes (`docs/journeys/`), the screens (`docs/design/SCREENS.md`) and any decision record (`docs/decisions/`). When the feature ships, set its status to `shipped` and make sure the journey, screens, help article and changelog are updated in the same change.

| Spec | Module | Journeys | Status |
|---|---|---|---|
| [Accounts and access (brick 2a)](accounts-and-access.md) | Platform | J-ONB-01, J-ONB-02, J-ONB-04 | shipped (PR #2) |
| [App shell (brick 3a)](app-shell.md) | Platform | J-ONB-05, J-ONB-01 | shipped (PR #3) |
| [Feature flags and plan entitlements](feature-flags.md) | Platform | J-ADM-01, J-ADM-02, J-ONB-05, J-AI-04 | shipped (PR #4) |
| [Team (brick 3b)](team.md) | Platform | J-ONB-02, J-ONB-06, J-ONB-01 | approved, in build |
| [Roles and organization (brick 3c)](roles-and-organization.md) | Platform | J-ONB-07, J-ONB-08, J-ONB-01, J-ONB-05 | built (PR pending) |

Status: `draft` · `approved` (owner agreed, ready to plan) · `in build` · `shipped` · `dropped`
