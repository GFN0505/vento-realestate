# Buyer and realtor portals

## J-BUY-01 · Buyer joins the portal and pays an instalment
**Who / how often:** Buyer; joins once, pays monthly. Often abroad, on a phone.
**Starts from:** Invitation on WhatsApp/email after subscribing.

**Steps**
1. *Portal sign in / invite:* a one-time code by WhatsApp, SMS or email; no password to forget from abroad. The portal carries the developer's brand, not Vento's.
2. *My units and payment progress:* unit, % paid, next instalment amount and date, overdue highlighted.
3. "Pay now" → amount (next instalment pre-filled) → Paystack checkout (card or transfer to the dedicated virtual account) → *payment result*.
4. Receipt on WhatsApp and in *Statement of account and receipts*.

**Behind the scenes:** the payment is confirmed only from the verified webhook (J-FIN-02), never from the browser redirect alone.
**Watch for:** payment pending at the bank (show "We'll confirm when your bank does"); buyer with several units switches between them from the header; bank transfer shows the account and a reference so payments match automatically.
**Target:** pay in under 60 seconds. **Test:** `e2e/portal/buyer-pay.spec.ts` **Status:** draft

## J-BUY-02 · Buyer checks progress and downloads documents
**Steps**
1. *Construction progress photos:* dated photos shared from the site diary, by phase.
2. *Documents:* letter of offer, contract, allocation letter, receipts; "Request a document" (e.g. a statement for a visa application) creates a task for the sales team.

**Test:** `e2e/portal/buyer-documents.spec.ts` **Status:** draft

## J-RLT-01 · Realtor registers a lead and tracks commission
**Who / how often:** External realtor, weekly.

**Steps**
1. *Realtor sign up / sign in* (approved by the developer before first use).
2. *Register a lead:* name, phone, email, interest. If the person is already a lead or buyer, the realtor is told it may be a duplicate (without seeing whose) and can still submit; a person at the developer decides ownership.
3. *My deals and commissions:* each lead's stage, sales closed, commission earned, approved and paid, with WHT credit notes.

**Watch for:** realtors never see other realtors' leads or any buyer data beyond their own leads.
**Test:** `e2e/portal/realtor.spec.ts` **Status:** draft
