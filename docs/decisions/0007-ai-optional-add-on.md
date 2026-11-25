# 0007 · AI is an optional, suggest-only add-on, cheapest model that passes

- **Date:** 2026-11-25
- **Status:** accepted

## Context
AI can remove a lot of manual work (reading title documents, matching payments, answering questions), but costs money per use, and mistakes on money or title are costly.

## Decision
AI features are an add-on, off by default, switched on per feature per organization, with a monthly budget (alerts at 50/80/100%, hard stop with fallback to the manual path). Every feature has a manual path. AI only suggests: nothing changes until a person accepts. All calls go through one AI gateway that checks the flag and budget, redacts, meters and records suggestions. Each feature uses the cheapest Claude model that passes its eval ("cheaper where tested"), with results in `ai/evals/RESULTS.md`. Details in the `ai-features` skill.

## Consequences
- The product must be excellent without AI.
- Every AI feature needs an eval set before it ships.

## Alternatives considered
- AI always on, built into the price: cost risk on every plan.
- Best model everywhere: higher quality ceiling, several times the cost where a cheaper model already passes.
