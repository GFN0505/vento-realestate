# Claude Design gaps prompt

Screens from `SCREENS.md` that neither earlier prompt covered. Paste everything below the line into Claude Design once the main screens are done. Send it in batches (one heading at a time) if that works better. Simple admin screens not listed here are built from the design system's patterns instead.

---

Using the existing Vento design system and patterns exactly, please design these additional screens (desktop 1440px and mobile 390px, light and dark). Reuse existing components; propose a new component only where none fits, and say why.

## Batch 1: access and system states
- Sign in (with two-factor step), sign up and verify email, forgot/reset password, accept invitation (shows organization and role).
- Buyer portal and realtor portal sign-in (lighter, customer-facing look).
- 403 no access (says who can grant it), 404, 500, offline banner and offline page, session expired.
- Notifications panel with grouping and "mark all read", plus notification preferences (channel per event type).

## Batch 2: sales lifecycle
- Units list (table) and unit detail: history, buyer, payment plan, documents, activity.
- Bulk-create units (e.g. "Block A, units 1–40, 3-bed, ₦85M") with a preview before creating.
- Price list by phase with effective dates.
- Lead detail and add-lead with duplicate warning (same phone or email already exists).
- Contact profile used for every role (buyer, contractor, vendor, realtor…) with a unified activity timeline.
- Payment plan templates (outright, 6/12/24 months, construction-linked) and the builder.
- **Reschedule a payment plan** (show old vs new schedule side by side; requires approval).
- **Cancel / default a subscription** with a refund calculation (amount paid, contractual deductions, refund due) and approval.
- **Transfer a unit to another buyer** (fees, new documents, approval).
- Handover checklist (snag items, keys, meter readings) and handover certificate.
- Commissions list and detail: earned on which receipts, approve and pay.

## Batch 3: finance operations
- Receipts list and receipt detail; reverse receipt flow with reason and approval.
- Unmatched receipts queue (match to buyer/instalment manually).
- Vendor bill → payment with WHT deduction shown, and the WHT credit note.
- Period close checklist and lock.
- Financial statements: trial balance, P&L, balance sheet, cash flow, with entity and period pickers and consolidation toggle.
- Entity detail: RC number, TIN, VAT status, bank accounts, directors and UBOs.
- FX rates screen (daily CBN rate, other sources, overrides with reason).

## Batch 4: land and construction details
- Add/edit parcel with boundary drawing on a map (and coordinate entry for survey data).
- Title stage update dialog with documents.
- Add/clear encumbrance with evidence.
- Contractors list and contractor profile (COREN/CORBON registration and expiry, scorecard, contracts, payments).
- Material request → purchase order → goods received flow, and PO detail.
- Material rates library with price history.

## Batch 5: documents and messages (print and phone friendly)
- Letter of offer, contract of sale, allocation letter, deed of assignment: a consistent legal-document layout using the organization's letterhead.
- Purchase order and service charge invoice PDFs.
- Emails: invitation, verify email, reset password, receipt, instalment reminder, approval request, daily digest.
- WhatsApp message previews for instalment reminder, overdue notice, receipt and construction update.

## Batch 6: settings and admin
- Settings layout with left sub-navigation; organization profile and branding (logo and colours applied to documents).
- Roles and permissions matrix (module × action, limited by entity/project) and role templates.
- Approval rules (which actions, which roles approve, amount thresholds).
- Integrations (Paystack, WhatsApp provider, e-signature, e-KYC) with connection status.
- Statutory rules admin (rate, effective dates, source, last verified).
- Data protection requests (export or delete a contact's data) and organization-wide audit log search.
- Vento super-admin: organizations list, plan and AI budget, AI usage by feature, feature flags, failed jobs.

Keep every screen lean and consistent with the existing ones.
