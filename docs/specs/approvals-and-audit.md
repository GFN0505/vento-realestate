# Approvals and audit (brick 4)

- **Status:** approved (owner, 26 Nov 2026)
- **Module:** Platform
- **Journeys:** J-EXE-02 (rewritten: approve or reject from the inbox), J-ONB-12 (new: set approval rules), J-ONB-13 (new: find out who changed something), J-ONB-08 and J-ONB-06 (changed: a role change and making someone an owner can need approval)
- **Screens:** see [Screens this slice touches](#screens-this-slice-touches)
- **Decisions:** builds on 0006 (maker-checker and audit), 0011 (one append-only audit table), 0014 (the company is a view filter), 0015 (platform audit stays separate), 0018 (say "company"); roles-and-organization decision 13 (default rule for role changes); app-shell decision 3 (no bell until something feeds it). The architect writes one record: "Sensitive actions run through one approvals engine: request → approve → execute, with the rule copied onto the request".
- **Branch:** `brick/04-approvals-audit`, cut from `main`

## Problem
Olumide signs off on everything by phone call and WhatsApp. When Grace wants to give an 8% discount, or Kunle needs a ₦23.5m cement order, they chase him, and nobody can later show who agreed to what. Release 1 moves real money (receipt reversals, refunds, price lists, POs, manual journals), and the owner needs to know that no one person can do any of those alone. Today Vento records every change, but the record is a table nobody can read, and the role and owner changes that 3b and 3c shipped rely on guardrails instead of a second person. Before the money modules arrive, Vento needs one way to say "this needs a second person", one place to approve, and one page that answers "who changed this?".

## Persona and job
| Who | Job | How often |
|---|---|---|
| **MD / owner** (Olumide Bankole) | Decide which actions need a second person, above what amount and in which company; approve what waits for him; check who changed what | Rules at setup and a few times a year; approvals daily, often on a phone |
| **Approver** (Aisha Bello, finance; any role with Approve) | Clear what waits for her in two clicks, with enough context to decide without calling anyone | Daily |
| **Maker** (Grace Umeh, sales; Kunle Ojo, PM; an admin changing a role) | Send a sensitive action for approval with a reason, see where it stands, cancel it if needed | Weekly |
| **Owner or admin** | Answer "who changed this?" for the MD, an auditor or a dispute | Monthly, urgently |
| **Module builders** (Vento's own team) | Plug a new sensitive action into approvals without new screens | Once per action |

## Success looks like
- **Approve in 2 clicks from anywhere:** Approvals (1) → the request is already open on the right → **Approve ₦23.52m PO** (2). Reject is 3 (comment, then **Reject**).
- **No one approves their own request, and no one approves two steps of the same request** (API test for each path, including a maker who is also an owner).
- **A guarded action never runs without its approvals:** every catalog action has a service test showing it waits, runs on the last approval in one transaction, and refuses when the record changed since.
- **Set a rule in under 60 seconds** (Approval rules → **Add rule** → action, amount, approvers → **Save rule**: 5 clicks).
- **Answer "who changed this?" in under 30 seconds:** Audit log → type a name, number or role in Search → the row says who, what, before → after, when and from where, in plain words (no codes, ids or JSON).
- **Every request, decision and rule change is in the audit trail**, and the action's own event says who approved it.
- **Isolation:** another organization's request, rule or audit entry answers "not found"; a member limited to some companies never sees a request or audit entry for a company outside their access.
- Approvals usable **within 1 second** on a repeat visit over slow 3G, at **375 px** with no sideways scroll, **no WCAG 2.2 AA failures** in light and dark.

## How approvals work
**The engine, in one paragraph.** A module marks an action as *approvable* in a catalog. When someone does that action, the service asks the engine first. If no rule applies, the action runs at once, as today. If a rule applies, the engine saves an **approval request** with what would change, a copy of the rule's steps, and the maker's reason, and the record shows "Waiting for approval". Each step is approved by one person; when the last step is approved, the engine runs the action in the same transaction as that approval. Reject, cancel or expiry end the request and nothing changes.

**Rules.** An approval rule says:
- **Action:** one from the catalog ("Change a role's permissions", later "Reverse a receipt", "Purchase order"…).
- **When:** *Any amount*, or *Over ₦X* for actions that have an amount. Below the lowest threshold, no approval is needed (the board's "PM (self) up to ₦5m"). Thresholds are in the organization's base currency; a foreign amount is compared at the NGN value the module recorded with its FX rate.
- **Approved by:** 1 to 3 steps, in order. Each step is one or more roles ("Owner or Admin", "Finance", "MD"); any one person holding one of them approves that step. The same role in two steps means two different people ("Two people, always").
- **Companies:** *All companies* or chosen ones.

**Which rule applies.** Rules for the request's company win over *All companies* rules for the same action; among those, the highest threshold the amount is over wins. One rule, never several. Organization-wide actions (roles, owners) have no company and use *All companies* rules.

**Who can approve a step.** An active member who holds one of the step's roles, whose role has **Approve** in the action's module, whose company access covers the request's company (all companies for organization-wide actions), who is not the maker, who hasn't approved an earlier step of this request, and whom the action doesn't exclude (the catalog's *Extra condition*, e.g. "Not the person who recorded it", or for role changes "can't give access they don't have themselves"). Being an owner gives no exemption.

**Changes apply to new requests only.** A request keeps the steps it was created with, so editing a rule never strands or silently approves anything in flight.

**Defaults.** Each catalog action ships with default rules, written for every organization when the action ships and at sign-up. Owners can edit or delete them. Brick 4 ships two (open question 6):
| Action | When | Approved by | If nobody else can approve |
|---|---|---|---|
| Change a role's permissions (custom roles: actions, two-step; not the name) | Any | Owner or Admin | Goes ahead, marked in the audit trail |
| Make someone an owner | Any | Owner | Goes ahead, marked in the audit trail |

Money actions (receipt reversal, refund, price list, PO, payment out, manual journal, payroll…) bring their defaults with their modules, taken from the SetApprovalRules board.

**When nobody else can approve** (a one-owner organization, or a company where only the maker approves): each catalog action declares what happens. Money actions are refused before anything is saved, with the reason and whom to ask (open question 4). Brick 4's role change goes ahead and its audit entry says "No one else could approve this"; owner actions (make or invite an owner) go ahead only for a sole owner and are refused while another owner exists (after the security audit). Any guarded change that goes ahead emails every other owner.

**Status of a request:** `pending` → `approved` (all steps done; the action ran) · `rejected` (with the approver's comment) · `cancelled` (by the maker, or automatically when the maker leaves the organization) · `expired` (7 days without a decision, or the record changed so the request no longer applies; open question 5). One pending request per record and action: a second one is refused with a link to the first.

## Screens
### Approvals (inbox)
**Where:** **Approvals** in the sidebar under Overview and in the top bar with a count of what's waiting for you (Approvals board); on phones it's a bottom tab for owners and admins (replacing Sales, as the app-shell spec planned) and in **More** for others. Shown to anyone whose role can approve somewhere or who has made a request in the last 90 days. ⌘K: **Go to Approvals**. The list follows the company switcher.

**Layout (Approvals board, queue archetype).** Title "Approvals", subtitle "Every change above a limit needs a second person. Nobody can approve their own request." Tabs **Waiting for me · 4** · **My requests** · **Decided**.
- **List (left):** one ApprovalRow per request: type chip (from the catalog: Purchase, Discount, Roles…), title ("Discount 8% · Unit C-05"), amount when there is one ("−₦8.96m", tabular figures), "Grace Umeh · “Buyer pays 50% deposit upfront…”", and age ("35 min ago"). Oldest first in *Waiting for me*, so nothing rots. The first row is open on load.
- **Detail (right; a full page on phones):** title, a link to the record ("Victoria Gardens C-05 →"), the amount in full; a **Field · Before · After** table from the request; the maker with their reason in quotes and when they asked; the policy in one line ("Sales can give up to 5%. Above that, the MD approves." — written from the rule); the **steps** as a TimelineItem chain ("Requested by Kunle Ojo · 1 h" ✓, "Finance review — Aisha Bello · 40 min · “Price checked”" ✓, "MD approval — you · Waiting"); then **Comment** (required to reject) and the two buttons: the primary names the effect from the catalog ("Approve ₦23.52m PO", "Approve role change"), and **Reject**.
- **No second confirm on approve** (the button names the effect), except actions the catalog marks irreversible (payroll, payment out), which ask once with the amount. Rejecting needs a comment.
- **Your own request** shows "This is your own request. Aisha Bello (Finance) will review it. You can cancel it while it waits." and **Cancel my request** instead of the buttons.
- **A step that isn't yours yet** (you're step 2, step 1 is open): visible under *Waiting for me* only once it reaches you; before that, never.
- **My requests:** your requests, newest first, with their state ("Waiting for Finance", "Approved by Aisha Bello", "Rejected: “…”", "Expired") and **Cancel request** while pending.
- **Decided:** what you approved or rejected, newest first, paginated, read-only.
- **Empty:** "Nothing waiting for you." · My requests: "You haven't asked for any approvals. When something you do needs a second person, it shows here." · Decided: "Requests you approve or reject show here."

### On the record (shared pattern)
When a rule applies, the action's button opens **Send for approval**: one sheet with the change summary, "Needs approval by Finance, then MD" (from the rule), and **Why?** (required, up to 500 characters) → **Send for approval**. After sending, the action's button on the record is replaced by the status (board's "What the requester sees on the record"): "Waiting for approval by Finance · Requested 2 h ago · nothing changes until it's approved" with **Cancel request**, so nobody thinks the change already happened. Brick 4 uses it on the role page (save bar reads **Send for approval** when the rule applies; Undo isn't offered for a request) and on Team's **Make owner** confirm (the row reads "Owner · waiting for approval").

### Settings → Approval rules (SetApprovalRules board)
**Who:** owners edit; admins and other Settings viewers see it read-only (open question 1). Organization-wide page (no company switcher). New Settings entry **Approval rules** after Roles & permissions. ⌘K: **Approval rules**.
- **Header:** "Approval rules" · "Which actions need approval, by whom, and above what amount. Changes apply to new requests only." · **Add rule** (owners).
- **Table:** Action · When · Approved by · Companies · Extra condition. Rows grouped by action; under each action's rows one muted line: "Below ₦5,000,000: no approval needed" when the lowest rule has a threshold. *Approved by* reads as a chain ("Finance → MD", "Owner or Admin"). *Extra condition* is the catalog's fixed text, read-only. A row whose step nobody can approve today carries an amber "Nobody can approve step 2 in Parkview SPV" so gaps show before they bite.
- **Rule sheet (Edit rule board):** Action (catalog actions available to the organization, by module) · When (*Any amount* or *Over ₦*) · Approvers in order (1–3 steps; each a multi-select of roles that have Approve in the action's module; roles without it are listed disabled with "Finance can't approve in Projects. Give it Approve on its role first.") · Companies (*All companies* or chosen) · a locked tick "Requester can't approve, even if their role allows" (always on, shown so owners trust it) · **Save rule** · **Delete rule** (confirm).
- **Phones (ApprovalRulesMobile):** one card per rule ("PO over ₦20m · Finance → MD"); tap for the sheet.
- **On the role page** (3c): under the grid one line lists what the role approves, linking here: "Approves: Change a role's permissions; PO over ₦20m (step 2)". No separate approval limits on roles, and the PermissionCell's "up to a limit" state isn't used (open question 2).

### Settings → Audit log (AuditLog board)
**Who:** owners and admins with access to every company (people who can edit Settings and have all-company access). Organization-wide page. Settings entry **Audit log**, last of the organization's sections. ⌘K: **Audit log**. The role page's ⋯ and Team's member sheet get **View history**, which opens the log filtered to that role or person.
- **Header:** "Audit log" · "Every change in Vento Homes Ltd. Entries can't be edited or deleted." · **Export CSV**.
- **Toolbar:** Search (person, record name or number, words in the entry) · Module · Person · Company · Dates (default: last 7 days). Filters live in the address, so a filtered view can be shared.
- **Table (newest first, server-paginated):** When ("25 Nov 14:12") · Who (initials and name; "Vento" for platform changes, "System" for jobs) · Module · What, in plain words ("Changed Aisha Bello's role", "Approved PO-2291 · ₦23,520,000", "Signed in from a new device") · Before → after, field by field with labels ("Role: Sales → Finance"; "Other details changed" for anything without a label; secrets never stored) · Where ("Chrome · Lekki, Lagos · 102.89.x.x"; blank for system). A row opens a side sheet with every field, the approvals behind it ("Approved by Aisha Bello, Olumide Bankole") and a link to the record.
- **Company labels** for `entity.*` events (decision 0018). Account events show once per organization, as recorded today.
- **Export CSV:** the filtered rows, up to 50,000; above that, "Narrow the dates to export. This view has 64,210 entries." The export is itself an audit entry ("Exported the audit log · 1,284 entries").
- **Empty:** "No entries match these filters." → **Clear filters**.

### Email
- **Approval needed** (EmailApproval board), to every person who can approve the step, when it reaches them: subject "Approval needed: PO-2291 · ₦23,520,000"; body names the maker, any earlier approvals, the key facts and amount; "For your security, approving happens in Vento, not from this email." → **Review in Vento**. No approve link in the email.
- **Your request was decided**, to the maker: "Approved: Discount 8% · Unit C-05" or "Rejected: … · “comment”". Nothing on expiry or cancel (the maker sees it in My requests).
- No bell, notifications panel or preferences in brick 4 (open question 8).

## User flows
**Approve (J-EXE-02): 2 clicks**
1. Email or the top bar count → **Approvals** (1). The oldest request waiting for you is open.
2. Read the before → after, the reason and the steps → **Approve ₦23.52m PO** (2). Toast "PO-2291 approved". If you were the last step, the action has run; the maker is emailed. The next request opens.

**Reject: 3 clicks.** Type the comment (1) → **Reject** (2) → toast "PO-2291 rejected · Kunle Ojo will see your comment".

**Send a role change for approval (J-ONB-08 changed): 1 extra click**
1. Role page → change ticks → save bar **Send for approval** (1) → sheet, **Why?** "Site engineers now raise POs" → **Send for approval** (2).
2. The role page shows "Waiting for approval by an owner or admin" with **Cancel request**; the grid is read-only until it's decided.

**Set a rule (J-ONB-12): 5 clicks.** Settings → **Approval rules** (1) → **Add rule** (2) → Action "Change a role's permissions" (3) → Approvers "Owner" (4) → **Save rule** (5). Toast "Rule saved. Applies to new requests."

**Find who changed something (J-ONB-13): 2 clicks and a search.** Settings → **Audit log** (1) → Search "Finance manager" → the row "Olumide Bankole · Changed role Finance manager · Approve in Finance: no → yes" → open it (2) for the full entry.

## Acceptance criteria
**Engine**
- **Given** an action with no matching rule, **when** it's done, **then** it runs at once exactly as before brick 4, with no request.
- **Given** a matching rule, **when** the maker acts, **then** a request is saved with the rule's steps copied, the change summary, amount and company, and the maker's reason; nothing else changes; `approval.requested` is audited; the first step's approvers are emailed.
- **Given** the last step is approved, **then** the action runs in the same transaction as the decision, its own audit event carries `approvedBy` (names and steps), and the maker is emailed. If the action fails its own checks now, the transaction rolls back, the request becomes `expired` with the reason ("Site engineer changed after this was asked"), and both people are told on screen.
- **Given** two approvers act on the same step at the same moment, **then** one wins; the other sees "Aisha Bello approved this a moment ago." and the next request opens.
- **Given** a rule is edited or deleted, **then** pending requests keep their copied steps.
- **Given** a pending request on a record and action, **when** someone tries the same action on it, **then** it's refused: "There's already a request waiting for this. Open it" → the request.
- **Given** a request older than 7 days, **then** it reads `expired` everywhere and can't be approved (checked on every read and decision, and swept daily; `approval.expired` audited once).
- **Given** the maker is removed from the organization, **then** their pending requests are cancelled ("Cancelled because Grace Umeh left") and audited.
- **Given** a money action and nobody else who can approve, **then** the action is refused before anything is saved: "Nobody else can approve this in Parkview SPV. Ask an owner to add an approver to the rule." For the two platform actions, it goes ahead and the audit entry says "No one else could approve this".

**Separation of duties**
- **Given** I made the request, **then** I can't approve or reject any step, whatever my role (API refuses; UI shows "This is your own request").
- **Given** I approved step 1, **then** I can't approve step 2 of the same request.
- **Given** the catalog excludes someone (recorded the receipt; would give access they don't have), **then** they can't approve, and the detail says why: "You recorded this receipt, so someone else approves its reversal."
- **Given** my role loses Approve in that module or my company access no longer covers the request, **then** it leaves my inbox at my next request.

**Rules page**
- **Given** an owner, **then** they can add, edit and delete rules; **given** anyone else with Settings view, **then** it's read-only with "Only owners can change approval rules."
- **Given** two rules for the same action, company scope and threshold, **then** save is refused: "There's already a rule for Purchase order over ₦5,000,000 in all companies."
- **Given** a role is used in a rule, **when** someone deletes the role, **then** it's refused: "Site manager approves in 2 rules. Change those rules first."
- **Given** a company is archived, **then** rules that name only that company are kept but shown greyed with "Parkview SPV is archived"; they apply again on restore.
- **Given** an owner deletes a rule or makes one looser (higher threshold, fewer steps, more companies covered by a looser rule), **then** every other owner is emailed (open question 1).

**Audit log**
- **Given** someone without all-company access or without Settings edit, **then** the page is 403 and the API refuses `audit.list`.
- **Given** 1 million entries, **then** the first page loads in under 1 second (uses the existing organization-and-date index).
- **Given** an entry with fields Vento has no label for, **then** it shows "Other details changed", never raw JSON.

**Everywhere**
- **Given** another organization's request, rule or audit entry id, **then** "not found" (isolation test extended to `approval_rules`, `approval_requests`, `approval_decisions`).
- **Given** I'm offline, **then** Approve, Reject, Cancel and Save rule are disabled with "You're offline. Approve when you're back online."; nothing is queued.
- **Given** the keyboard, **then** J/K move through the list, A approves (when the button is enabled), R focuses the comment; every control is reachable with Tab; the steps read as a list to screen readers ("Finance review, approved by Aisha Bello, 40 minutes ago").
- **Given** 375 px, **then** the list and detail are separate pages, the buttons sit in a sticky bar above the tabs, and every target is 44 px.

## Behind the scenes
- **Plug-in contract (`packages/shared` + `apps/api`).** A module registers each approvable action once:
  - `key` (`access.role.update`, later `finance.receipt.reverse`…), `module` (for the Approve permission), `label`, `chip`, `hasAmount`, `irreversible`, `whenNoApprover: 'refuse' | 'proceed' | 'sole_owner'` (`sole_owner`, added after review: go ahead only when the maker is the organization's only owner), `extraCondition` (text for the rules page), `approveLabel(summary)`, `defaultRules`;
  - `payload`: a zod schema for what's stored (never secrets);
  - `describe(tx, payload)` → `{ title, recordLabel, recordLink, entityId | null, amount?: { value, currency, ngnValue }, changes: [{ field, before, after }] }`, computed once at request time;
  - `excluded(tx, payload)` → people who can't approve, each with a reason;
  - `execute(tx, ctx, payload)` → re-checks the record (refuse with a reason if it changed) and does the action, writing its own audit event.
  - Services call `requestOrRun(tx, ctx, key, payload, reason)` where they'd act, and get `{ ran: true }` or `{ ran: false, requestId }`. A test walks the catalog and fails if any action lacks a service test.
- **Tables (organization-scoped, composite keys, decision 0012):** `approval_rules` (+ steps and step roles, + companies), `approval_requests` (action, entity, subject, payload, summary, copied steps, current step, status, maker, reason, expires at; unique pending per subject and action), `approval_decisions` (append-only, triggers like `audit_events`).
- **Audit actions added:** `approval.requested`, `approval.step_approved`, `approval.approved`, `approval.rejected`, `approval.cancelled`, `approval.expired`, `approval_rule.created`, `approval_rule.updated`, `approval_rule.deleted`, `audit.exported`. A plain-words label for every audit action (old and new) lives beside `AUDIT_ACTIONS`, with field labels for before → after; a test fails if an action has no label.
- **Permissions:** approving checks the eligibility rules above on the server; `settings` edit plus owner for rules, `settings` edit plus all companies for the audit log. The Approvals count is one cheap query, refreshed with the 30-second access refresh.
- **Email** goes through the existing sender after commit (console in development).
- **Expiry:** checked on read and on every decision; a daily sweep marks and audits the rest.

## UI copy
| Where | Copy |
|---|---|
| Inbox | "Approvals" · "Every change above a limit needs a second person. Nobody can approve their own request." · tabs "Waiting for me · 4", "My requests", "Decided" |
| Detail | "Field · Before · After" · "asked 2 h ago" · "Comment (required to reject)" · **Approve ₦23.52m PO** / **Approve role change** / **Make Aisha Bello an owner** · **Reject** |
| Own request | "This is your own request. Aisha Bello (Finance) will review it. You can cancel it while it waits." · **Cancel my request** |
| Excluded | "You recorded this receipt, so someone else approves its reversal." · "This change gives access you don't have, so another owner or admin approves it." |
| Send sheet | Title "Send for approval" · "Needs approval by Finance, then MD." · **Why?** placeholder "What should the approver know?" · **Send for approval** |
| Record status | "Waiting for approval by Finance · Requested 2 h ago · nothing changes until it's approved" · **Cancel request** |
| Toasts | "Sent to Aisha Bello for approval" · "PO-2291 approved" · "PO-2291 rejected · Kunle Ojo will see your comment" · "Request cancelled" · "Rule saved. Applies to new requests." · "Rule deleted · Undo" |
| Errors | "Enter a comment to reject." · "Tell the approver why." · "Aisha Bello approved this a moment ago." · "This request expired. Ask again if it's still needed." · "Site engineer changed after this was asked, so this request has expired." · "There's already a request waiting for this." · "Nobody else can approve this in Parkview SPV. Ask an owner to add an approver to the rule." |
| Rules | "Approval rules" · "Which actions need approval, by whom, and above what amount. Changes apply to new requests only." · "Below ₦5,000,000: no approval needed" · "Requester can't approve, even if their role allows" · "Only owners can change approval rules." · "Nobody can approve step 2 in Parkview SPV" · "Finance can't approve in Projects. Give it Approve on its role first." |
| Audit log | "Audit log" · "Every change in Vento Homes Ltd. Entries can't be edited or deleted." · "No entries match these filters." **Clear filters** · "Narrow the dates to export. This view has 64,210 entries." |
| Emails | Subject "Approval needed: PO-2291 · ₦23,520,000" · "For your security, approving happens in Vento, not from this email." **Review in Vento** · Subject "Approved: Discount 8% · Unit C-05" / "Rejected: Discount 8% · Unit C-05" · to other owners: "Vento: Olumide Bankole changed an approval rule in Vento Homes Ltd" with the before → after |
| Offline | "You're offline. Approve when you're back online." |

## Departures from the approved designs
| Screen | Change | Why |
|---|---|---|
| Approval rules | *When* is "Any" or "Over ₦X"; the band below the lowest threshold reads "no approval needed" instead of a "PM (self)" row; no *From–To* fields | One number per rule, no gaps or overlaps to validate |
| Approval rules | No delegates and no "Escalate after 48 hours"; *Extra condition* is fixed per action, not typed | Lean first version (out of scope); free-text conditions can't be enforced |
| Approval rules | A *Companies* column; amber "nobody can approve" warning | Rules are company-scoped (non-negotiable 10); gaps should show before a request is stuck |
| Approvals | No "Waiting for Board" step; steps are roles | There is no board role; a board sign-off can be a custom role |
| Approvals | Count in the top bar and sidebar, no bell | No notifications panel in brick 4 (open question 8) |
| Audit log | "Kept 7 years" removed from the subtitle | Retention isn't decided; nothing is deleted today |
| Permissions | No "up to a limit" PermissionCell, no "Approval limits" tab; one line listing what the role approves | Rules are the one source of approval limits (open question 2) |

## Screens this slice touches
| Screen | Board | What changes |
|---|---|---|
| Approvals inbox | Approvals, ApprovalsMobile | New |
| Approval rules + rule sheet | SetApprovalRules, ApprovalRulesMobile | New |
| Audit log + entry sheet | AuditLog, AuditLogMobile | New |
| Send for approval sheet; "Waiting for approval" record status | Approvals (requester view) | New shared pattern |
| Email: approval needed; request decided; rule loosened (to owners) | EmailApproval | New |
| App shell | – | Approvals link and count; owner/admin phone tab; ⌘K entries |
| Settings navigation | – | Approval rules, Audit log |
| Role page | SetPermissions | Send for approval, waiting state, "Approves:" line, View history |
| Team | RolesSettings | Make owner through approval; View history on the member sheet |

## Journeys
- **J-EXE-02** rewritten to this spec (draft).
- **J-ONB-12** Set approval rules (new, draft). **J-ONB-13** Find out who changed something (new, draft).
- **J-ONB-08** and **J-ONB-06**: the approval step is added when built.

## Domain changes
- **Approval rule:** action, *Any* or *Over* an amount in base currency, 1–3 ordered steps of roles, companies. Most specific company, then highest threshold, wins; one rule per request.
- **Approval request:** statuses `pending → approved / rejected / cancelled / expired`; keeps a copy of its rule's steps; one pending per record and action; expires after 7 days.
- **Approvable action:** an action registered in the approvals catalog by its module.
- `approve` permission: "may approve steps their role is named in, in that module".

## Out of scope
- Notifications bell, panel and preferences; daily digest; WhatsApp alerts (open question 8).
- **Request access** from the 403 page (open question 8).
- Delegates, escalation after 48 hours, out-of-office.
- Approving from email or WhatsApp (never, by design).
- Rules by person instead of role; free-text conditions; conflict-of-interest detection across contacts (each module declares its own exclusions).
- Money actions and their screens (receipts, refunds, POs, price lists, payroll, journals): each module plugs in with its spec. The "Set approval rules" Home checklist item comes with the first money module, when the defaults matter.
- Record timelines on module pages (each module adds one using the same audit data and TimelineItem); amount limits on the Accept invitation page.
- Audit retention and deletion policy; the platform audit viewer (admin console); SIEM or log streaming.
- An "All open requests" oversight view for the MD (the audit log shows requests).

## Owner's decisions (26 Nov 2026)
All 8 recommendations below were approved as written.

## Open questions (answered above; recommendations in bold)
Each has a recommendation.

1. **Who changes rules, and who reads the audit log.** *Recommended:* **owners only** change rules (they are the MD's controls, and admins are often the makers); admins and other Settings viewers see them read-only. Deleting or loosening a rule emails every other owner. **The audit log is for people who can edit Settings and have access to every company** (owners and admins by default), because it shows sign-ins and changes across companies.
2. **Approvers by role, and no separate "approval limits" on roles.** *Recommended:* **yes.** A rule names roles per step (up to 3 steps); any one person in those roles approves a step. The role page shows a line listing what the role approves instead of the board's "up to a limit" cell and *Approval limits* tab, so limits live in one place. Rules by named person are out.
3. **Thresholds.** *Recommended:* **"Over ₦X" in base currency**, foreign amounts compared at the NGN value the module recorded; the company's own rules beat all-company rules, then the highest threshold the amount is over wins.
4. **When nobody else can approve.** *Recommended:* **money actions are refused** with the reason and whom to ask (a one-person finance team must add an approver, which is the point), and the rules page warns ahead of time; **role changes and making an owner go ahead** and are marked in the audit trail, so a one-owner organization isn't locked out of its own settings.
5. **Expiry, escalation, delegates.** *Recommended:* **pending requests expire after 7 days**; no escalation and no delegates in brick 4. Revisit when an MD's leave stalls real money.
6. **Which platform actions need approval by default.** *Recommended:* **"Change a role's permissions" (owner or admin) and "Make someone an owner" (owner)**, both on by default and editable. Turning off "Require two-step for everyone" stays without a checker (its email to every owner is enough), and removing members and resetting two-step stay instant (a leaver must lose access now).
7. **Approvers must use two-step.** *Recommended:* **yes: any role with Approve in any module requires two-step**, extending 3c's lock. Built-in Land & legal and Project manager have Approve and don't require it today, so their holders set it up at next sign-in (within 7 days, as with the organization setting).
8. **Notifications.** *Recommended:* **no bell or notifications panel in brick 4.** Approvers are emailed when a step reaches them and see a count on **Approvals** in the top bar; makers are emailed the decision. The bell, panel and preferences arrive with the second notification source (receipts or reminders), and **Request access** from the 403 page with them.
