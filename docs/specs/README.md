# Feature specs

One file per feature, written by the **product-manager** agent before the architect plans it. Copy [`_template.md`](_template.md) to `docs/specs/<feature>.md`.

A spec links to the journeys it adds or changes (`docs/journeys/`), the screens (`docs/design/SCREENS.md`) and any decision record (`docs/decisions/`). When the feature ships, set its status to `shipped` and make sure the journey, screens, help article and changelog are updated in the same change.

| Spec | Module | Journeys | Status |
|---|---|---|---|
| [Accounts and access (brick 2a)](accounts-and-access.md) | Platform | J-ONB-01, J-ONB-02, J-ONB-04 | draft |

Status: `draft` · `approved` (owner agreed, ready to plan) · `in build` · `shipped` · `dropped`
