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
**Who / how often:** Any approver (MD, finance, any role with Approve), daily, often on a phone.
**Starts from:** The "Approval needed" email, the **Approvals** count in the top bar, or ⌘K "Go to Approvals".

Spec: [approvals-and-audit](../specs/approvals-and-audit.md) (brick 4).

**Steps**
1. **Approvals** (1): tab *Waiting for me*, oldest first; the first request is open on the right. Each row shows its type chip, title, amount, who asked and their reason, and age.
2. Read the *Field · Before · After* table, the maker's reason, the policy line and the steps chain (who has approved so far) → **Approve ₦23.52m PO** (2). No second confirm (the button names the effect), except payroll and payment out, which ask once with the amount. Toast "PO-2291 approved"; the next request opens.
3. Or type a comment and **Reject** (3). The maker is emailed with the comment.
4. Makers follow their own under *My requests* and can **Cancel request** while it waits; *Decided* lists what you approved or rejected.

**Behind the scenes:** the request keeps a copy of its rule's steps; each step is one person holding one of the step's roles, with Approve in that module and access to the request's company. The maker can't approve any step, nobody approves two steps of one request, and the action can exclude more people (e.g. whoever recorded the receipt). On the last approval the action runs in the same transaction and its audit event names the approvers; if the record changed since, the request expires instead. Every request, step, rejection, cancellation and expiry is an audit event. Emails go to the next step's approvers and to the maker on the decision; approving never happens from email or offline.
**Done when:** the request is approved (the change is made) or rejected (nothing changed), and the maker knows.
**Watch for:** your own request ("This is your own request", Cancel only); two approvers at once (second sees "Aisha Bello approved this a moment ago."); the record changed since ("…so this request has expired."); expired after 7 days; you approved step 1 (step 2 isn't yours); role or company access changed (it leaves your inbox); maker removed (request cancelled); no comment on reject; offline (buttons disabled); 375 px (list and detail are separate pages, sticky buttons above the tabs).
**Target:** 2 clicks per approval, 3 to reject. **Test:** `e2e/platform/approvals-inbox.spec.ts` **Status:** draft

## J-EXE-03 · Build a board pack
**Who / how often:** MD or finance manager, quarterly.
**Starts from:** *Board pack builder*.

**Steps**
1. Pick period, entities, sections (sales, collections, construction progress, cash and facilities, land bank, risks).
2. Add commentary per section (or "Draft with AI" if on).
3. Preview → "Download PDF".

**Test:** `e2e/analytics/board-pack.spec.ts` **Status:** draft
