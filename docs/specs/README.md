# Feature specs

One file per feature, written by the **product-manager** agent before the architect plans it. Copy [`_template.md`](_template.md) to `docs/specs/<feature>.md`.

A spec links to the journeys it adds or changes (`docs/journeys/`), the screens (`docs/design/SCREENS.md`) and any decision record (`docs/decisions/`). When the feature ships, set its status to `shipped` and make sure the journey, screens, help article and changelog are updated in the same change.

| Spec | Module | Journeys | Status |
|---|---|---|---|
| [Accounts and access (brick 2a)](accounts-and-access.md) | Platform | J-ONB-01, J-ONB-02, J-ONB-04 | shipped (PR #2) |
| [App shell (brick 3a)](app-shell.md) | Platform | J-ONB-05, J-ONB-01 | shipped (PR #3) |
| [Feature flags and plan entitlements](feature-flags.md) | Platform | J-ADM-01, J-ADM-02, J-ONB-05, J-AI-04 | shipped (PR #4) |
| [Team (brick 3b)](team.md) | Platform | J-ONB-02, J-ONB-06, J-ONB-01 | shipped (PR #5) |
| [Roles and organization (brick 3c)](roles-and-organization.md) | Platform | J-ONB-07, J-ONB-08, J-ONB-01, J-ONB-05 | shipped (PR #7) |
| [My security and passkeys (brick 3d)](my-security.md) | Platform | J-ONB-04, J-ONB-09, J-ONB-10, J-ONB-06 | shipped (PR #8) |
| [Vento Real Estate console (super-admin)](admin-console.md) | Platform | J-ADM-01, J-ADM-02, J-ADM-03, J-ADM-05, J-ADM-06, J-ADM-07, J-ADM-04, J-ONB-11 | shipped (slices 1 and 1b, PR #9; slice 2 in the console backlog) |
| [Approvals and audit (brick 4)](approvals-and-audit.md) | Platform | J-EXE-02, J-ONB-12, J-ONB-13, J-ONB-08, J-ONB-06 | in build |

Status: `draft` · `approved` (owner agreed, ready to plan) · `in build` · `shipped` · `dropped`
