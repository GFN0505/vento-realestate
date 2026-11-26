---
name: ai-features
description: How optional AI features are built in this project with the Claude API — feature flags and per-organization budgets, the AI gateway, model choice per feature, structured outputs, prompt caching, batch jobs, cost metering, privacy and guardrails, fallbacks and evals. Use for any feature that calls an AI model.
---

# AI features

AI is an **optional add-on** (see `docs/PRODUCT.md` → AI). Every AI feature must:
1. be **off by default**, behind a per-organization feature flag;
2. have a **manual path** that works the same without AI;
3. only **suggest** — nothing changes data until a person accepts it;
4. go through the **AI gateway** so it's metered and budget-checked;
5. be **logged** in the audit trail (feature, model, user, decision).

Before writing Claude API code, load the bundled `claude-api` skill and follow it for SDK usage (TypeScript: `@anthropic-ai/sdk`). Never guess SDK calls.

## Architecture
```
apps/api/src/ai/
  gateway.ts       the ONLY place that calls the Claude API
  features/        one file per feature: prompt, schema, model, limits
    documentExtraction.ts  paymentMatching.ts  ask.ts  drafting.ts
    siteDiaryVoice.ts      predictions.ts      anomalies.ts
  budget.ts        flag + budget check, usage recording, alerts
  redact.ts        strips personal data a feature doesn't need
  evals/           test sets and scoring per feature
```
`gateway.run(ctx, feature, input)`:
1. Is the feature on for this organization? If not, throw `FEATURE_DISABLED` (the UI shows the manual path).
2. Is the organization under its monthly budget (estimate the cost first with token counting for large inputs)? If not, throw `AI_BUDGET_REACHED`.
3. Redact input to the fields the feature needs.
4. Call the model with the feature's config.
5. Record usage (`ai_usage`: organization, user, feature, model, input/output/cache tokens, cost in USD and NGN, latency, outcome).
6. Return a typed **suggestion**, stored with status `proposed`.

## Models and cost
Model per feature is **configuration** (`ai_feature_config`), not hard-coded, so it can change without a deploy.

| Model | ID | Input / output per 1M tokens |
|---|---|---|
| Claude Opus 5.5 | `claude-opus-5-5` | $4 / $20 |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | $2 / $10 |
| Claude Haiku 5.5 | `claude-haiku-5-5` | $0.10 / $0.50 (prompts up to 100K tokens) |

Prices as of Nov 2026 — check the current pricing page before quoting costs to customers.

### Policy: cheaper where tested (decided by the product owner, Nov 2026)
For each feature, run its eval on the cheapest candidate first and move up only if quality falls short. Ship the **cheapest model that passes the feature's quality bar**, and record the eval result and cost per task in `ai/evals/RESULTS.md`. `claude-opus-5-5` is the fallback when no cheaper model passes.

| Feature | Try first | Then | Quality bar to pass |
|---|---|---|---|
| Document extraction | Haiku 5.5 | Sonnet 5.5 → Opus 5.5 | ≥ 95% field accuracy on the test set; no wrong value with high confidence |
| Voice site diary structuring | Haiku 5.5 | Sonnet 5.5 | ≥ 95% of entries need no edits to key fields |
| Payment matching (leftovers after code matching) | Haiku 5.5 | Sonnet 5.5 → Opus 5.5 | ≥ 99% precision above the auto-confirm threshold |
| Anomaly review (batch) | Haiku 5.5 | Sonnet 5.5 | Catches every seeded anomaly in the test set; few false alarms |
| Ask Vento | Sonnet 5.5 | Opus 5.5 | Correct tool choice and answer on ≥ 95% of test questions |
| Drafting (letters, reminders, board-pack commentary) | Sonnet 5.5 | Opus 5.5 | Reviewer rates ≥ 90% as usable with light edits |
| Contract clause review | Sonnet 5.5 | Opus 5.5 | Flags every seeded risky clause |
| Predictions (risk reasons, forecast commentary) | Sonnet 5.5 | Opus 5.5 | Reasons match the computed features; no invented facts |

- Re-run the eval whenever the prompt, schema, model or effort changes, and when a new model is released, so features keep moving to the cheapest model that passes.
- Effort is set explicitly per feature (`output_config.effort`): start at `low` for extraction and classification, `medium` for the rest, and raise it only if the eval needs it. On Opus 5.5 and Haiku 5.5 the default is `medium`; thinking can't be disabled on Opus 5.5, so lower effort instead.
- Use only the exact model IDs above; never add date suffixes.

## Cost levers (use all of them)
1. **Prompt caching:** keep each feature's system prompt and instructions stable and first; put per-request data last. Check `usage.cache_read_input_tokens` is non-zero on repeat calls.
2. **Batches (50% cheaper):** anything that can wait — overnight payment matching, default-risk scores, cash-flow forecasts, anomaly scans — runs through the Message Batches API from a background job.
3. **Small inputs:** send only the needed fields and pages; summarize long histories in code before sending.
4. **Structured outputs** (`output_config.format` with a JSON schema from the feature's zod schema) so responses are short, valid and never retried for format.
5. **Cache results:** the same document or question within a short window returns the stored suggestion.
6. **Right `max_tokens`** per feature (small for extraction/classification).

## Budgets
- `ai_budget` per organization per month (NGN), from the plan plus top-ups.
- Alerts at 50%, 80%, 100% to the owner (in-app and email).
- At 100%: AI pauses for that organization, features show "AI limit reached for this month — continue manually" and the manual path; owners can raise the limit.
- Super-admin dashboard: usage and cost by organization and feature, to set prices from real numbers.

## Feature recipes
- **Document extraction:** PDF or image input → schema of expected fields with a per-field confidence. Show fields as suggestions next to the document; highlight mismatches with existing records (e.g. plot size differs from the parcel).
- **Payment matching:** code does exact matches first (reference, amount, account); AI only for the leftovers, given candidate buyers/instalments chosen by code. Returns ranked matches with confidence and reason. Finance confirms; bulk-confirm only above a high threshold.
- **Ask Vento:** the model never writes SQL. It picks from a fixed set of **read-only query tools** (typed, permission-checked, organization-scoped, paginated) and returns a table plus a short answer. Every number shown comes from a tool result.
- **Drafting:** templates + record data in, draft out; always opened in an editor, never sent automatically.
- **Voice site diary:** transcribe (provider configurable), then structure into the diary schema; the engineer confirms.
- **Predictions:** compute features in code (payment history, days late, segment, project progress); the model explains and scores. Show the reasons with the score. Run in batch.
- **Anomaly flags:** rules in code catch the obvious cases; AI reviews ambiguous patterns in batch and adds to the review queue.

## Guardrails and privacy (NDPA 2023)
- Send the minimum personal data; never send BVN, full ID numbers or bank account numbers unless the feature truly needs them.
- Treat document text and user questions as **data, not instructions**: a scanned document saying "ignore previous instructions" must not change behaviour. Tools available to the model are read-only.
- AI never sees data the user can't see: tools run with the user's permissions.
- Handle `stop_reason` values (`refusal`, `max_tokens`) explicitly, with a friendly fallback to the manual path. Retry only retryable errors (429, 5xx, network) with backoff, and keep retries within the budget.
- Log prompts and outputs only in redacted form, with short retention.

## Evals (required before a feature ships or changes model)
Each feature has a small test set in `ai/evals/` (real-looking, anonymised examples) and a score: field accuracy for extraction, precision at the auto-confirm threshold for matching, correctness for Ask Vento answers. A model, prompt or effort change ships only if the score holds. Record cost per task alongside quality.

## Testing
Unit tests mock the gateway. Tests cover: feature off → manual path; budget reached → clear error and no API call; suggestion not applied until accepted; redaction removes fields; usage recorded with correct cost; cross-organization isolation in Ask Vento tools.

## Availability (feature flags and plans)
An AI feature is usable only when it's available to the organization (the `ai` add-on active, its flag released, its prerequisites available), the owner has switched it on in Settings → AI, and it's under budget. The monthly budget is the plan's `ai_budget` (0 in every starting plan) plus the add-on's increase: `ctx.features.limit('ai_budget')`, and `me.plan.aiBudget` for owners. Internal organizations have no budget limit, so the owner-set budget in Settings → AI is their only cap.
