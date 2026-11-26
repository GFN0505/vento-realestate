# AI add-on

Every journey here has a manual twin elsewhere. With AI off, the screens look the same minus the AI controls.

## J-AI-04 · Turn on AI and set a budget
**Who / how often:** Owner, once, then occasionally.
**Starts from:** *Settings → AI*. It appears only when the organization has the AI add-on and at least one AI feature is released to it ([feature-flags](../specs/feature-flags.md)).

**Steps**
1. Each AI feature available to the organization, with what it does, an example and an estimated monthly cost for this organization's volume. Toggle the ones wanted. Features not yet released to the organization aren't listed.
2. Set the monthly budget, up to the add-on's `ai_budget` limit; alerts at 50/80/100% go to the owner. Raising the limit itself means talking to Vento until the billing screen ships.
3. Usage meter shows spend by feature this month.

**Watch for:** budget reached → features pause with "AI budget reached for November. You can keep working as normal, or raise the budget." Manual paths keep working.
**Test:** `e2e/ai/settings-budget.spec.ts` **Status:** draft

## J-AI-01 · Read a scanned C of O with AI
**Who / how often:** Land & legal, per document.
**Starts from:** Uploading a title document on *Parcel detail* (manual twin: J-LND-02).

**Steps**
1. Upload → "Read with AI" (or automatic if enabled).
2. *Document reading review:* extracted fields (number, holder, date, area, issuing authority) beside the document, each with confidence; mismatches with the parcel record highlighted.
3. Accept, edit or reject each field. "Save".

**Behind the scenes:** an AI suggestion record per field; only accepted values change data; usage metered.
**Test:** `e2e/ai/document-reading.spec.ts` (with a recorded model response) **Status:** draft

## J-AI-02 · Match a bank statement with AI
**Who / how often:** Finance officer, with each import (manual twin: J-FIN-03).

**Steps**
1. After import, unmatched lines show AI suggestions (buyer and instalment) with confidence and the reason ("Name 'A OKONKWO' and amount match Instalment 6 of A-14").
2. Confirm individually or "Confirm all high-confidence".

**Test:** `e2e/ai/payment-matching.spec.ts` **Status:** draft

## J-AI-03 · Ask Vento a question
**Who / how often:** Any member.
**Starts from:** ⌘K, typing a question.

**Steps**
1. "UK buyers in Parkview more than 60 days overdue" → *Ask Vento answers:* a table of real records, the filters it used (editable), and actions (send reminder, export).
2. If the question can't be answered from their permitted data: says so plainly.

**Behind the scenes:** always says what the answer is based on ("14 subscriptions you have access to") and how it found them; answers only from data the member can see; read-only; usage metered.
**Test:** `e2e/ai/ask-vento.spec.ts` **Status:** draft
