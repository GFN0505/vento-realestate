---
name: paystack
description: How this project integrates Paystack — dedicated virtual accounts per buyer, instalment checkout, card checkout, webhooks, verification, kobo conversion, reconciliation queue, refunds, and testing. Use for any code that talks to Paystack or records online receipts.
---

# Paystack integration

Always confirm endpoints and payloads against the current docs at https://paystack.com/docs before writing code. This file describes *our* rules; Paystack's docs are the source of truth for *their* API.

## Architecture
```
apps/api/src/integrations/paystack/
  client.ts        typed fetch wrapper (secret key from env, timeouts, retries on 5xx only)
  webhook.ts       Hono route: verify signature → store raw event → enqueue job → 200
  jobs.ts          process events idempotently
  mapping.ts       kobo <-> decimal naira, Paystack status -> our status
```
Provider code stays behind a `PaymentProvider` interface so it can be swapped or mocked.

## Money conversion
- Paystack amounts are **integer kobo**. `₦2,500,000.00` ⇄ `250000000`.
- Convert with the decimal library only: `toKobo(d) = d.times(100).toFixed(0)` and assert it's an integer. Never `Math.round(x * 100)` on a float.

## Flows
1. **Dedicated virtual account (main path for bank transfers):** create a Paystack customer for each buyer, assign a DVA, and store the account number and bank on the contact. Every `charge.success` with that DVA is matched to the buyer automatically, recorded as a receipt, then allocated to the buyer's instalments oldest due first (across subscriptions in due-date order). Any surplus stays as buyer credit.
2. **Card / checkout link:** initialize a transaction with our own `reference` (`inst_<instalmentId>_<nonce>`) and `metadata` (`organizationId`, `entityId`, `subscriptionId`, `instalmentIds`). Send the authorization URL by email, WhatsApp or the buyer portal.
3. **Verification:** never trust the redirect or the webhook alone. Call Verify Transaction and check `status === 'success'`, amount, currency `NGN` and reference before you record the receipt.

## Webhooks
- Verify `x-paystack-signature` = HMAC-SHA512 of the **raw body** with the secret key, using a timing-safe compare. Reject otherwise.
- Optionally allow-list Paystack's webhook IPs.
- Store every event (`provider_events`: id, type, reference, raw JSON, received_at, processed_at, error).
- Unique on `(provider, reference, event)` so duplicates are no-ops. Handle events arriving out of order.
- Respond 200 within a second, and do the work in a background job with retries.

## Reconciliation
- Anything that can't be matched with certainty (unknown DVA, amount mismatch, missing metadata) goes to an **Unmatched receipts** review queue. Never guess.
- A daily job compares Paystack settlements against recorded receipts and flags differences.
- Paystack covers NGN only here. Foreign-currency diaspora receipts (domiciliary account transfers) are recorded manually with currency, FX rate, rate source and date; see `docs/DOMAIN.md` open questions for the provider decision.

## Refunds and reversals
Recorded as new reversing entries linked to the original receipt and its allocations, with reason and user. Never edit or delete the original. A cancellation refund (amount received less contractual deductions) is one refund linked to the cancelled subscription; instalment statuses are recomputed after any reversal.

## Testing
- Use test secret keys and Paystack's test cards and test bank accounts only.
- Unit-test kobo conversion, signature verification (valid, invalid, tampered body), duplicate and out-of-order events, and amount mismatches.
- Webhook tests post a recorded fixture body with a signature computed from the test secret.

## Env vars (document in `.env.example`, no values)
`PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_WEBHOOK_URL`

## Feature availability
Webhooks are public and never feature-gated: money arriving for an organization that has lost `finance.paystack` (rollback, downgrade, trial end) is still verified and recorded. Availability hides features; it never drops inbound money or data.
