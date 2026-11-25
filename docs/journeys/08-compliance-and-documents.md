# Compliance and documents

## J-CMP-01 · Verify a buyer's KYC
**Who / how often:** Sales agent or compliance officer, per new buyer.
**Starts from:** Subscription in `pending_kyc`, or *Buyer KYC and e-KYC verification*.

**Steps**
1. ID type (NIN, passport, driver's licence) and number, address, proof of address upload.
2. "Verify" through the e-KYC provider: name and photo match shown. Or upload documents for manual review.
3. For purchases above the AML threshold: source of funds and, for companies, directors and UBOs.
4. Status `verified` (subscription becomes `active`) or `flagged` with notes.

**Behind the scenes:** ID numbers encrypted at rest and masked in the UI; provider response stored; consent recorded (NDPA); audit event.
**Watch for:** provider down (manual path); name mismatch (flag, not auto-reject); BVN never requested or stored.
**Test:** `e2e/compliance/kyc.spec.ts` **Status:** draft

## J-CMP-02 · Review an AML flag
**Who / how often:** Compliance officer, as flags arise.
**Starts from:** *AML review queue*.

**Steps**
1. *Case detail:* why it was flagged (rule and threshold version), the buyer, the transaction(s), KYC status, history.
2. Decide: `cleared` with notes, or `escalated` → record the NFIU report reference in *SCUML / NFIU filing records* once filed outside the app.

**Watch for:** the thresholds are configuration with effective dates; tipping-off risk (the buyer never sees flags).
**Test:** `e2e/compliance/aml-review.spec.ts` **Status:** draft

## J-CMP-03 · Renew an expiring permit
**Who / how often:** Land & legal, as alerts arrive (60/30/7 days before expiry).
**Starts from:** Notification or *Permit tracker*.

**Steps**
1. *Permit detail:* expiry, documents, history. "Record renewal": new dates, reference, document.

**Test:** `e2e/compliance/permit-renewal.spec.ts` **Status:** draft

## J-DOC-01 · Generate, approve and e-sign a contract of sale
**Who / how often:** Sales generates, legal approves; per subscription.
**Starts from:** *Subscription detail* → Documents → "Generate contract of sale".

**Steps**
1. *Generate document from a record:* template picked by type; merge fields filled from the subscription (buyer, unit, price, plan, entity, parcel title); preview.
2. Edit permitted clauses if the template allows. "Submit for approval".
3. Legal approves → "Send for e-signature" → buyer signs → developer's signatory signs.
4. Signed PDF stored; contract `signed` → `active`.

**Behind the scenes:** template version recorded; changes from the template highlighted for the approver; e-signature envelope id stored; buyer portal shows the signed copy.
**Watch for:** buyer details changed after generation (regenerate prompt); signature declined (back to draft with reason).
**Test:** `e2e/documents/contract-of-sale.spec.ts` **Status:** draft
