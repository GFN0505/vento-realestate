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
**Starts from:** The "Approval needed" email (its button opens the request), the **Approvals** count in the top bar, or ⌘K "Go to Approvals".

Spec: [approvals-and-audit](../specs/approvals-and-audit.md) (brick 4). Decision: [0024](../decisions/0024-one-approvals-engine-request-approve-execute.md).

**Steps**
1. **Approvals** (1): tab *Waiting for me*, oldest first; the first request is open on the right. Each row shows its type chip (a neutral outline badge), title, amount, who asked and their reason, and age. The list follows the company switcher.
2. Read the *Field · Before · After* table, the maker's reason, the policy line and the steps chain (who has approved so far) → **Approve role change** (2). The button names the effect ("Make Aisha Bello an owner"). No second confirm, except for actions the catalog marks irreversible (none yet; payroll and payment out will be). Toast "… approved"; the next request opens.
3. Or type a comment and **Reject** (3). The maker is emailed with the comment.
4. *My requests* lists the ones you asked for, newest first, with where each stands ("Waiting for Owner or Admin", "Approved by Aisha Bello", "Rejected: “…”", "Expired") and **Cancel request** while one waits. *Decided* lists what you approved or rejected, newest first, read-only. Both use the same list and detail layout as *Waiting for me*; the status lives on the record.
5. Keyboard: **J** and **K** move through the list, **A** approves (when the button is on), **R** goes to the comment box.

**Behind the scenes:** the request keeps a copy of its rule's steps; each step is one person holding one of the step's roles, with Approve in that module and access to the request's company, checked in SQL under a lock when they decide. The maker can't approve any step (an owner who is the maker included), nobody approves two steps of one request, and the action can exclude more people (for a role change: anyone who holds the role, or who would give access they don't have). On the last approval the action runs in the same transaction as the decision, as the maker, and its audit event names the approvers in order; if the record changed since, everything rolls back and the request expires as stale instead. Every request, step, rejection, cancellation and expiry is an audit event. Emails go to the next step's approvers (up to 50) and to the maker on approval or rejection, after the change is saved. Requests expire after 7 days, checked on every read and decision and swept daily (`approvals expire`). Approving never happens from email or offline.
**Done when:** the request is approved (the change is made) or rejected (nothing changed), and the maker knows.
**Watch for:** your own request ("This is your own request", **Cancel my request** only); two approvers at once (the second sees "Aisha Bello approved this a moment ago."); the record changed since ("…so this request has expired."); expired after 7 days; you approved step 1 (step 2 isn't yours); your role or company access changed (it leaves your inbox); the maker left the organization (request cancelled: "Cancelled because Grace Umeh left"); no comment on reject ("Enter a comment to reject."); offline (buttons disabled: "You're offline. Approve when you're back online."); 375 px (list and detail are separate pages: tapping a row opens `/approvals?id=…`, the same address emails link to; the buttons sit in a sticky bar above the tabs).
**Target:** 2 clicks per approval, 3 to reject. **Test:** service tests for the engine, the three plug-ins and the inbox, and component tests for the detail; Playwright `e2e/platform/approvals-inbox.spec.ts` (role change, reject, own request, owner invitation, phone). **Status:** built

## J-EXE-03 · Build a board pack
**Who / how often:** MD or finance manager, quarterly.
**Starts from:** *Board pack builder*.

**Steps**
1. Pick period, entities, sections (sales, collections, construction progress, cash and facilities, land bank, risks).
2. Add commentary per section (or "Draft with AI" if on).
3. Preview → "Download PDF".

**Test:** `e2e/analytics/board-pack.spec.ts` **Status:** draft
