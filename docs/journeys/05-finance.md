# Finance

## J-FIN-01 · Record a bank-transfer receipt
**Who / how often:** Finance officer, many times a day.
**Starts from:** ⌘K "Record receipt", the subscription, or the Finance home.

**Steps**
1. *Record receipt dialog:* buyer (search by name, phone or unit), amount, date (today by default), method `bank_transfer`, bank account received into, reference.
2. Allocation preview: oldest due instalment first ("₦2,500,000 → Instalment 4 (₦2,500,000), fully paid"). Change if the buyer asked otherwise.
3. Confirm button reads "Record ₦2,500,000 receipt" (both currencies for a foreign receipt). Choosing cash above the AML threshold (default ₦5m) turns it into "Send to AML review": the receipt is held, not refused.
4. Toast with "Send receipt" (WhatsApp/email). Receipt PDF available.

**Behind the scenes:** one transaction: receipt, allocations, instalment statuses, ledger entry in the SPV (Dr bank, Cr customer deposits/receivable), commission earning, AML rule check, audit event, buyer portal updated.
**Watch for:** overpayment (held as credit on the subscription, applied to the next instalment); a receipt into an entity different from the subscription's (blocked, or intercompany with finance permission); a closed period date (blocked with the reason); duplicate reference warning.
**Target:** under 20 seconds, 3 clicks. **Test:** `e2e/finance/record-receipt.spec.ts` **Status:** draft

## J-FIN-02 · Paystack payment lands automatically
**Who / how often:** Nobody acts; finance reviews exceptions.

**Steps**
1. Buyer transfers to their dedicated virtual account (or pays by card from the portal).
2. Paystack webhook → verified signature → transaction verified with Paystack → receipt created and allocated as in J-FIN-01.
3. Buyer gets the receipt on WhatsApp; the sales agent's timeline shows it.
4. If the amount can't be allocated (no open instalment, unknown account): it lands in the *Unmatched receipts queue* for finance.

**Watch for:** duplicate webhooks (idempotent by Paystack reference); webhook before the subscription exists; Paystack fees posted as a separate expense line.
**Test:** `e2e/finance/paystack-webhook.spec.ts` (with the Paystack test-mode fixtures) **Status:** draft

## J-FIN-03 · Import a bank statement and match
**Who / how often:** Finance officer, daily or weekly.
**Starts from:** *Bank accounts* → "Import statement".

**Steps**
1. Upload the bank's CSV/Excel export; bank format remembered per account.
2. *Bank statement import and matching:* each credit line with a suggested match (by reference, amount and name rules; AI suggestions if the add-on is on, J-AI-02).
3. Confirm matches one by one or "Confirm all exact matches". Unmatched lines can be matched manually or left for later.

**Behind the scenes:** confirmed lines become receipts (J-FIN-01 logic); lines already recorded manually are detected and linked instead of duplicated; reconciliation status per bank account.
**Test:** `e2e/finance/statement-matching.spec.ts` **Status:** draft

## J-FIN-04 · Receive a diaspora payment in GBP
**Who / how often:** Finance officer, weekly.

**Steps**
1. *Record receipt dialog* with currency GBP, amount £45,000, received into the domiciliary account.
2. FX rate locked to the CBN official rate for the receipt date (source shown). Changing it (e.g. to the bank's actual rate, source `bank`) asks for a reason and tags the line "Edited", with a "differs from CBN by 2.1%" note.
3. NGN equivalent shown before confirming.

**Behind the scenes:** amount, currency, rate, source and rate date stored; allocation against an NGN-priced subscription uses the NGN equivalent; FX differences at settlement post to FX gain/loss.
**Watch for:** subscription priced in USD paid in GBP (cross rate via NGN, shown); missing rate for a weekend date (use the last published rate, labelled).
**Test:** `e2e/finance/foreign-receipt.spec.ts` **Status:** draft

## J-FIN-05 · Reverse a wrong receipt
**Who / how often:** Finance officer, rare. Needs approval.
**Starts from:** *Receipt detail* → "Reverse receipt".

**Steps**
1. Reason (duplicate, wrong buyer, bounced cheque, other) and notes. Submit for approval.
2. Approver approves in the *Approvals inbox*. The person who recorded the receipt can't approve its reversal.

**Behind the scenes:** a reversing ledger entry (never a delete); allocations undone; instalment statuses recalculated; buyer portal and commission updated; the original receipt shows `reversed` with a link to the reversal.
**Test:** `e2e/finance/reverse-receipt.spec.ts` **Status:** draft

## J-FIN-06 · Pay a contractor bill with WHT
**Who / how often:** Finance officer, weekly.
**Starts from:** *Vendor bills and payments* → "New bill", or from a received PO.

**Steps**
1. Bill: vendor, invoice number, date, lines (from the PO if linked), VAT if charged.
2. "Pay": amount, bank account. WHT worked out on the amount before VAT, from the current statutory rule for that vendor type and service (the higher no-TIN rate applies if the vendor has no TIN) ("WHT 5%: ₦1,250,000 withheld; pay ₦23,750,000").
3. Payment approval if above the threshold. Record payment. WHT credit note generated for the vendor.

**Behind the scenes:** ledger: Dr payable, Cr bank, Cr WHT payable; WHT appears on the tax summary for remittance; vendor without TIN flagged.
**Test:** `e2e/finance/vendor-bill-wht.spec.ts` **Status:** draft

## J-FIN-07 · Draw down construction finance
**Who / how often:** Finance manager, monthly or per milestone.
**Starts from:** *Construction facilities and drawdowns*.

**Steps**
1. Facility detail: limit, drawn, available, rate, tenor, repayment schedule.
2. "Record drawdown": amount, date, purpose (linked to project phase), bank's disbursement reference.

**Behind the scenes:** ledger entries in the SPV; interest accrual schedule; facility headroom shown on the executive home.
**Test:** `e2e/finance/facility-drawdown.spec.ts` **Status:** draft

## J-FIN-08 · Close the month and produce statements
**Who / how often:** Finance manager, monthly.
**Starts from:** *Period close and lock*.

**Steps**
1. Checklist per entity: unmatched receipts cleared, bank reconciled, revenue recognition run done, payroll posted, intercompany balanced, FX revaluation done. Each item links to its screen.
2. "Close October 2026" (approval rule). The period locks; postings into it are blocked.
3. *Financial statements:* trial balance, P&L, balance sheet, cash flow per entity or consolidated; export PDF/Excel.

**Watch for:** reopening a period (approval, audit event, reason); intercompany out of balance (blocks consolidation, shows the difference).
**Test:** `e2e/finance/period-close.spec.ts` **Status:** draft
