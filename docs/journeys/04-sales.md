# Sales

## J-SAL-01 · Add units and a price list
**Who / how often:** Sales manager, per project or phase launch.
**Starts from:** *Project detail* → Units, or *Unit availability grid* → "Add units".

**Steps**
1. *Add / bulk-create units:* "Block A, units 1–20, 3-bed terrace, 180 m²". Add more rows for other blocks and types.
2. Preview: "60 units will be created" with the unit numbers. Create.
3. *Price lists:* "New price list" → Phase 1, effective from date, price per unit type (or per unit for premium plots). Submit.
4. Price list approval (default rule) → becomes active on its effective date.

**Behind the scenes:** units `available`; a price list change is an approval request; existing subscriptions keep their contracted price.
**Watch for:** duplicate unit numbers (blocked with the list); overlapping price list dates (the newer one wins from its date, shown clearly); units placed on the estate layout later.
**Target:** under 3 minutes for 60 units. **Test:** `e2e/sales/units-and-prices.spec.ts` **Status:** draft

## J-SAL-02 · Lead to site inspection to sale
**Who / how often:** Sales agent, daily.
**Starts from:** *Leads pipeline board*, a WhatsApp message landing on a contact, or a realtor-registered lead.

**Steps**
1. "Add lead": name, phone (with country code), email, source, segment, interest (project, unit type, budget). *Duplicate warning* if the phone or email already exists, with "Open existing".
2. Drag the card through `contacted` → `site_inspection` (book a date; reminder to the agent; WhatsApp confirmation to the lead) → `negotiation`.
3. From the lead: "Start subscription" → J-SAL-03 with the contact pre-filled. Lead becomes `won`.
4. Or "Mark lost" with a reason (price, location, timing, competitor, no response).

**Watch for:** lead protected to a realtor (show who and until when); diaspora leads in other time zones (show their local time); lost reasons feed the sales dashboard.
**Target:** add lead in under 30 seconds. **Test:** `e2e/sales/lead-pipeline.spec.ts` **Status:** draft

## J-SAL-03 · New subscription with a payment plan
**Who / how often:** Sales agent, several times a week.
**Starts from:** Unit grid tile → "Start sale", lead → "Start subscription", or ⌘K "New subscription".

**Steps** (stepped sheet, *New subscription flow*)
1. **Buyer:** pick an existing contact or add one (name, phone, email, country of residence, ID type).
2. **Unit:** pre-selected if started from the grid; price from the active price list; currency (NGN default; USD/GBP for diaspora with the indicative rate shown).
3. **Payment plan:** pick a template (outright, 6/12/24 months, construction-linked) → preview of the instalment schedule; edit deposit or first due date if allowed.
4. **Review:** buyer, unit, price, schedule, realtor and commission (if any). "Create subscription".
5. Success panel: "Send letter of offer" (WhatsApp/email), "Record deposit", "Open subscription".

**Behind the scenes:** in one transaction: subscription `pending_kyc` (or `active` if KYC already verified), instalments generated, unit `subscribed`, commission record `pending`, audit event. Letter of offer generated from the template. Paystack dedicated virtual account requested for the buyer.
**Done when:** the unit tile turns blue and the subscription shows its schedule.
**Watch for:** two agents selling the same unit at once (second one gets "A-07 was just subscribed by Funmi" and picks another); encumbrance warning acknowledged; discount beyond the agent's limit (approval request); price list changed during the flow.
**Target:** ≤ 3 minutes, 6 clicks after the buyer exists. **Test:** `e2e/sales/new-subscription.spec.ts` **Status:** draft

## J-SAL-04 · Chase overdue instalments
**Who / how often:** Sales manager, weekly; digest daily.
**Starts from:** "Overdue" card on the Sales home, or *Delinquency list*.

**Steps**
1. *Delinquency list:* filtered by ageing bucket (1–30, 31–60, 61–90, 90+), project, segment; total overdue at the top.
2. Select buyers → "Send reminder" → WhatsApp/SMS/email using the reminder template, preview per buyer with their amount and Paystack account. Send.
3. Open a buyer → log a call outcome or promise-to-pay date in the timeline.

**Behind the scenes:** automatic reminders also go on the schedule set in Settings (e.g. 3 days before, on the day, 7 and 30 days after); replies land in the contact's WhatsApp conversation.
**Watch for:** buyers who opted out of WhatsApp (fall back to SMS/email); reminders stop once paid; promise-to-pay dates pause automatic reminders until then.
**Test:** `e2e/sales/delinquency.spec.ts` **Status:** draft

## J-SAL-05 · Reschedule a payment plan
**Who / how often:** Sales manager, occasionally. Needs approval.
**Starts from:** *Subscription detail* → "Reschedule plan".

**Steps**
1. *Reschedule / restructure a payment plan:* old schedule on the left, new on the right; options: extend term, change instalment amount, add a penalty or waive one.
2. The total outstanding must stay equal (or the difference shown as penalty/waiver). Reason required.
3. "Submit for approval". The approver sees both schedules side by side in the *Approvals inbox*.

**Behind the scenes:** on approval, unpaid instalments are replaced (paid ones never change); old schedule kept in history; buyer notified with the new schedule; audit event.
**Test:** `e2e/sales/reschedule-plan.spec.ts` **Status:** draft

## J-SAL-06 · Default, cancel and refund
**Who / how often:** Sales manager with finance, rare. Needs approval.
**Starts from:** *Subscription detail* → "Cancel subscription" (buyer request) or "Mark as defaulted" (from delinquency).

**Steps**
1. *Cancel / default a subscription:* reason, effective date. Refund calculation shown: amount paid, contractual deductions (admin fee %, from the contract terms), refund due, refund currency.
2. "Submit for approval". Approver approves.
3. Finance pays the refund (bank transfer details captured; payment recorded).

**Behind the scenes:** on approval: subscription `cancelled` or `defaulted`, unit back to `available`, unpaid instalments voided, refund liability posted, commission reversed if unpaid (flagged if already paid), buyer documents marked void, audit events.
**Watch for:** refund in the original foreign currency (FX gain/loss posted); partial refunds over time; unit already resold before the refund is paid.
**Test:** `e2e/sales/cancel-and-refund.spec.ts` **Status:** draft

## J-SAL-07 · Allocate and hand over a unit
**Who / how often:** Sales issues allocation; PM and facility hand over.
**Starts from:** "Ready for allocation" card (subscriptions past the allocation threshold, e.g. 50% paid) or *Subscription detail*.

**Steps**
1. "Issue allocation letter" → generated from the template, approved, sent. Unit `allocated`.
2. When construction completes and the buyer has paid in full: *Handover checklist* (snag items with photos, keys, meter readings, manuals). Buyer or their representative signs on the device.
3. "Complete handover" → *Handover certificate* PDF. Unit `handed_over`; it appears in the estate.

**Behind the scenes:** handover can trigger revenue recognition (policy per project); the deed of assignment becomes available to generate; the facility module starts service charge from the handover date.
**Watch for:** handover with open snag items (allowed, carried as maintenance requests); handover before full payment (blocked unless approved).
**Test:** `e2e/sales/allocation-handover.spec.ts` **Status:** draft

## J-SAL-08 · Pay a realtor's commission
**Who / how often:** Sales manager approves, finance pays; monthly.
**Starts from:** *Commissions list* filtered to `earned`.

**Steps**
1. *Commission detail:* subscription, rate, which receipts earned it, amount earned to date, already paid.
2. Select earned commissions → "Approve for payment" (approval rule) → finance records the payment with WHT deducted.

**Behind the scenes:** commission earned only on cleared receipts; payment posts to the ledger; the realtor sees `paid` in their portal with the WHT credit note.
**Test:** `e2e/sales/commission-payout.spec.ts` **Status:** draft
