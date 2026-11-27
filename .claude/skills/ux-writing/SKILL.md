---
name: ux-writing
description: Voice, tone and copy patterns for every word in the product — buttons, empty states, errors, toasts, confirmations, notifications, emails, SMS and WhatsApp reminders, with Nigerian context. Use when writing or reviewing any user-facing text.
---

# UX writing

## Voice
Clear, warm, professional. Like a capable colleague, not a robot or a salesperson. Nigerian English spelling and usage (e.g. "flat", "estate", "plot", "C of O", "governor's consent", "allocation letter"). No slang, no exclamation marks except for genuine celebrations ("Your first project is set up!", "Unit B12 is fully paid!").

## Rules
1. **Say what happened, then what to do.** "Receipt couldn't be recorded. Check the amount and try again."
2. **Specific over generic.** "Unit B12 already has an active subscription" — never "An error occurred".
3. **Verbs on buttons**, naming the object: "Record receipt", "Send reminder", "Allocate unit", "Log site visit". Never "Submit", "OK" or "Yes".
4. **Confirm with consequences:** title asks, body explains, button repeats the action and amount. "Record $12,500 receipt from Ada Obi at ₦1,550/$?" → "Record receipt".
5. **Sentence case** everywhere. Numbers as digits. Money always with its currency: `₦2,500,000.00`, `$12,500.00` (or `₦2.5M` in compact stats), with the NGN equivalent beside foreign amounts. Dates as `25 Nov 2026`.
6. **Short:** buttons 1–3 words, toasts under 8 words, errors under 2 sentences.
7. **Domain terms** from `docs/DOMAIN.md` only. Never show internal codes, ids or technical errors.
8. **No blame.** "That date is before the subscription date" — not "You entered an invalid date".
9. **Respect money and privacy.** Reminders never shame. Never show a buyer's balance, delinquency or KYC details to anyone who isn't authorised.
10. **Say "company", never "entity"** on screen, in emails and in help (decision 0018). "Entity" stays in code, the API and DOMAIN.md. An estate or site is a project, not a company.

## Product name
- Always "Vento Real Estate", never "Vento" alone: other Vento products exist (decision 0022). Possessive: "Vento Real Estate's".
- Three approved short forms: the logo lockup "Vento | REAL ESTATE", "Staff · all customers" on the console's phone top bar, and "Ask" for the AI feature.
- The copy tests (`apps/web/src/test/brand-copy.test.ts`, `apps/api/src/test/brand-copy.test.ts`) fail on a bare "Vento" in code, emails and help. An exception goes in `BRAND_ALLOW` in `packages/shared/src/brand/bare-vento.ts`, with its reason.

## Patterns
| Situation | Pattern | Example |
|---|---|---|
| Empty state | What this is + why it's empty + one action | "No subscriptions yet. A subscription records a buyer's unit, price and payment plan." → "New subscription" |
| Filtered empty | Say so + clear | "No buyers match these filters." → "Clear filters" |
| Success toast | Past tense, object | "Receipt allocated to 2 instalments" / "Reminder sent to 12 buyers" |
| Undo toast | Action + Undo | "Site diary entry archived · Undo" |
| Field error | What's needed | "Enter the unit price" / "Enter the FX rate and its source" |
| Allocation | Show where the money went | "₦3,000,000 received: ₦2,500,000 to instalment 3 (paid), ₦500,000 to instalment 4 (partially paid)." |
| Delinquency | Facts, age, next step | "4 instalments overdue · ₦9,800,000 · 61–90 days" → "Send reminder" |
| Site / construction | What, where, when | "Roofing 60% complete · Block C · updated 25 Nov 2026" / "Delay logged: cement shortage" |
| Encumbrance / permit warning | Risk + action | "This parcel has an active caveat. Clear it before allocating units." / "Building permit expires on 12 Jan 2027. Start renewal." |
| Loading (long) | What's happening | "Generating statement of account…" |
| Permission denied | What and who | "Only finance can reverse a receipt. Ask your organization owner." |

## Messages to buyers (email, SMS, WhatsApp)
- Start with who it's from: "Vento Homes: …" (use the organization's name).
- One purpose per message, amount (with currency) and due date in the first line, a clear next step and a payment link or account details.
- SMS ≤ 160 characters. WhatsApp follows approved template wording.
- Instalment reminder example: "Hello Ada, instalment 4 of ₦2,500,000 for Unit B12, Lekki Gardens Phase 2 is due on 1 Jan 2027. Pay to Wema Bank 0123456789 (Vento/Ada Obi) or online: {link}. Thank you."
- Diaspora reminder example: "Hello Tunde, instalment 3 of $12,500 for Unit A4, Lekki Gardens Phase 2 is due on 1 Jan 2027. Pay by foreign transfer to the account on your statement, or online: {link}. Thank you."
- Overdue example: "Hello Ada, instalment 4 of ₦2,500,000 for Unit B12 was due on 1 Jan 2027. Please pay at your earliest convenience or reply to discuss a plan. {link}"
- Receipt example: "Thank you, Ada. We received ₦3,000,000 on 5 Jan 2027 for Unit B12. Balance: ₦15,000,000. Your receipt: {link}"
- Construction update example: "Hello Ada, Lekki Gardens Phase 2 has reached roofing. See the latest site photos in your portal: {link}"
