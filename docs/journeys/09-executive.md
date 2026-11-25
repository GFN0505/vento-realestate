# Executive

## J-EXE-01 · Morning check-in
**Who / how often:** MD, daily, often on a phone.
**Starts from:** The 7am WhatsApp digest, then the app.

**Steps**
1. Digest (six lines on WhatsApp): cash by entity, receipts yesterday, new sales, overdue total and change, approvals waiting, risks (encumbrance, permit expiring, budget overrun).
2. Taps the link → *Executive home*: revenue booked vs received, collections this month vs target, delinquency rate, project progress by phase, cash by entity, budget variance.
3. Clicks any number to drill into the records behind it (e.g. overdue → *Delinquency list* filtered).

**Target:** everything important in one screen without scrolling on desktop; under 2 minutes daily.
**Test:** `e2e/home/executive-home.spec.ts` **Status:** draft

## J-EXE-02 · Approve sensitive actions from the inbox
**Who / how often:** Any approver, daily.
**Starts from:** Notification, digest, or *Approvals inbox*.

**Steps**
1. Inbox grouped by type (refunds, reversals, POs, payroll, price lists, journals), each showing who asked, what changes, the amount, and the reason.
2. Open one: before/after or side-by-side view. "Approve" needs no second confirm (the button names the effect); "Reject" needs a comment.

**Behind the scenes:** the maker can't approve their own request (they see "This is your own request" and can only cancel it); anyone with a conflict of interest is skipped; approvals never happen from email or while offline; the action runs only on approval, in one transaction; both decisions are audit events; the maker is notified.
**Watch for:** stale requests (the record changed since; re-check before approving); expiry after the configured days.
**Target:** 2 clicks per approval. **Test:** `e2e/platform/approvals-inbox.spec.ts` **Status:** draft

## J-EXE-03 · Build a board pack
**Who / how often:** MD or finance manager, quarterly.
**Starts from:** *Board pack builder*.

**Steps**
1. Pick period, entities, sections (sales, collections, construction progress, cash and facilities, land bank, risks).
2. Add commentary per section (or "Draft with AI" if on).
3. Preview → "Download PDF".

**Test:** `e2e/analytics/board-pack.spec.ts` **Status:** draft
