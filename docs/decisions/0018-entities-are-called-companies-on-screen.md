# 0018 · Entities are called companies on screen

- **Date:** 2026-11-26
- **Status:** accepted

## Context
Decision 0003 put legal entities (the holding company and each project SPV) inside the organization, and the code, the API and `DOMAIN.md` call them entities. Until brick 3c the screens did too: "Entity: All entities" in the top bar, "Entity access" on Team, "Add your first entity" on the checklist. The people who use Vento don't say "entity". The CAC registers companies, banks open accounts for companies, and an MD says "our SPV company". "Entity" is accountants' shorthand, and the design rules ask us to keep jargon off screens. The owner also worried that people would confuse an entity with an estate. Brick 3c adds a page to manage them and a way to add one from the switcher, so the word now appears in many more places.

## Decision
Every word a user reads says **company**: the switcher reads "Company: All companies", Settings has **Companies**, Team shows **Company access**, the checklist says "Add your first company" and "Add your other companies (SPVs)", and server messages shown to users say "company". The type labels stay "Holding company" and "Project company (SPV)". The **Add company** sheet says in one line that a company is not an estate: "To add another estate, create a project instead."

Code, the API, the database, audit actions (`entity.created`…), plan limit keys (`entities`) and `DOMAIN.md` keep the word **entity**. Nothing is renamed below the copy layer.

## Consequences
- Brick 3c changes the copy of the 3a and 3b screens (switcher, Home, ⌘K, Team, the invite and member sheets, onboarding, the invitation page), their help articles, e2e selectors and the user-facing server messages, all in one go.
- Two vocabularies live side by side. A developer reads `entities.create` and a user reads "Add company". `DOMAIN.md` records the mapping, and the ux-writing skill gets one line: never show "entity" to a user.
- Audit entries keep `entity.*` actions. When the audit log screen ships, it shows them with "company" labels.
- Finance can still say "entity" in accounting reports (for example in IFRS consolidation notes) if accountants expect it. That is a choice for the Finance spec.

## Alternatives considered
- Keep "Entity" everywhere: precise for accountants, but it's jargon for everyone else and it feeds the entity-versus-estate confusion.
- Rename the code and the API too: a wide rename across schemas, migrations and audit history for no user benefit, and accounting code reads more naturally with "entity".
- Mix the words ("Company" in the switcher, "Entity" in Settings): worse than either word on its own, because people would think they are different things.
- "SPV": wrong for the holding company, and not every developer uses SPVs.
