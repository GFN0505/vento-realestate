# Facility and estate

## J-FAC-01 · Bill service charge for a quarter
**Who / how often:** Facility manager, quarterly or monthly per estate.
**Starts from:** *Service charge setup, billing run, invoices and arrears*.

**Steps**
1. Setup (once): charge per unit type, billing frequency, due days, late fee rule.
2. "Run billing for Q1 2027": preview of invoices per unit (pro-rata for units handed over mid-period). Confirm.
3. Invoices sent to residents by WhatsApp/email with payment details; arrears tracked with reminders.

**Behind the scenes:** invoices post to the estate entity's ledger; receipts against them work like J-FIN-01; utility costs recovered appear in the estate's cost report.
**Test:** `e2e/facility/service-charge-run.spec.ts` **Status:** draft

## J-FAC-02 · Resolve a resident's maintenance request
**Who / how often:** Facility manager, daily.
**Starts from:** Request from a resident (portal, WhatsApp, or logged by staff).

**Steps**
1. *Maintenance board:* new request in `open` with photo and priority.
2. Assign to staff or a vendor → `assigned` → `in_progress` (updates with photos) → `resolved` with cost.
3. Resident confirms or it auto-closes after 7 days → `closed`.

**Watch for:** recurring faults on the same asset (link to the asset register; suggest a preventive schedule); cost recovery from the resident.
**Test:** `e2e/facility/maintenance-request.spec.ts` **Status:** draft
