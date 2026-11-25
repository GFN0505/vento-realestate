# Projects and site

## J-PRJ-01 · Create a project with phases, budget and BoQ
**Who / how often:** Project manager, per new project.
**Starts from:** *Projects list* → "New project", or from a parcel's detail ("Start a project on this parcel").

**Steps**
1. *Create / edit project:* name, parcels, owning entity (SPV), type, planned start and end dates.
2. Phases are pre-filled (`site_prep` → `handover`) with suggested dates spread across the plan; adjust or remove.
3. *BoQ editor:* "Import from Excel" (the QS's file) or add items; items pick rates from the *Material rates library*. Phase budgets total from the BoQ.
4. "Create project" → *Project detail*, Overview tab.

**Behind the scenes:** project status `planning`; parcel status `in_development`; budgets stored per phase; audit event.
**Watch for:** parcel with an active encumbrance (warning); BoQ rows with unknown materials (create rate or skip); dates outside the project range.
**Target:** under 10 minutes with an Excel BoQ. **Test:** `e2e/projects/create-project.spec.ts` **Status:** draft

## J-PRJ-02 · Log a site diary entry from site
**Who / how often:** Site engineer, daily, on a phone, often with no signal.
**Starts from:** Mobile bottom nav "Diary", or the Site home.

**Steps**
1. *Site diary quick entry:* project pre-selected (last used), date today. Work done (text or voice), workers on site (count by trade), issues.
2. "Delay today?" toggle → reason (`weather`, `materials`, `funding`, `approvals`, `labour`, `other`) and hours lost.
3. Add photos from the camera; GPS and time captured automatically.
4. "Save entry". If offline: saved to the outbox with a "Will sync when online" badge.

**Behind the scenes:** photos compressed on the device before upload; entry appears in the project feed and, if marked "Share with buyers", in the buyer portal's progress gallery; attendance feeds site-worker pay.
**Done when:** the entry is in the project's diary feed.
**Watch for:** photos without GPS (allowed, flagged); two entries for the same day (allowed, grouped); sync conflict (keep both).
**Target:** under 60 seconds, 3 taps plus typing. **Test:** `e2e/projects/site-diary-offline.spec.ts` **Status:** draft

## J-PRJ-03 · Request materials, raise and receive a PO
**Who / how often:** Site engineer requests; PM orders; weekly.

**Steps**
1. Site engineer: *Material request:* items and quantities from the BoQ, needed-by date. Submit.
2. PM: opens the request, "Create purchase order", picks a vendor (scorecard shown), prices pre-filled from material rates. Submit for approval.
3. Approver (per approval rules and amount): approves from the *Approvals inbox*. PO status `approved` → "Mark as ordered" → PO PDF sent to the vendor.
4. On delivery: *Goods received:* quantities received per line, photo of the waybill. PO becomes `partially_received` or `received`.

**Behind the scenes:** received value updates the phase's actual cost and budget variance; vendor scorecard updates (timeliness, price vs library); a vendor bill can be created from the PO (J-FIN-06); price far above the library rate raises an anomaly flag.
**Watch for:** over-receipt (warn); cancelled PO after partial receipt; PO for a vendor with missing TIN (WHT warning).
**Test:** `e2e/projects/purchase-order.spec.ts` **Status:** draft

## J-PRJ-04 · Complete a milestone that bills buyers
**Who / how often:** PM, at each construction-linked milestone.
**Starts from:** *Project detail* → phases timeline.

**Steps**
1. Milestone → "Mark complete": date, evidence (photos, engineer's certificate).
2. If construction-linked plans depend on it, the dialog shows "This makes 23 instalments due (₦412,500,000). Buyers are notified." Confirm.

**Behind the scenes:** linked instalments move to `due` with due date = completion date + plan terms; buyer notifications sent; phase % complete updated; revenue recognition input updated.
**Watch for:** un-completing a milestone after instalments were paid (blocked; needs a correction flow with approval).
**Test:** `e2e/projects/milestone-billing.spec.ts` **Status:** draft
