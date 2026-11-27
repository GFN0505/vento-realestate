# Design notes

What the approved Claude Design export ([`claude-design/`](claude-design/README.md)) decides beyond what you can see on the boards: the tokens, the product rules the designer set, and the designer's own notes. Where this file and the design-system skill disagree, this file wins until the skill is updated.

## Tokens
Colour carries status or action only, never decoration. Every money value uses tabular figures.

### Colour
| Token | Light | Dark | Use |
|---|---|---|---|
| `background` | `#F5F6FC` | `#0B0E1F` | Page |
| `card` (surface) | `#FFFFFF` | `#141833` | Cards, sheets, inputs |
| `muted` (surface alt) | `#F0F1FA` | `#1B2047` | Table headers, hover, quiet panels |
| `border` | `#E3E5F3` | `#262B4A` | Borders, dividers |
| `foreground` | `#15172B` | `#F2F3FA` | Text |
| `muted-foreground` | `#686D94` | `#9499C2` | Secondary text |
| `brand` | `#7677FB` | `#8A8BFC` | Focus rings, selection, charts, available-unit outline |
| `primary` (action fill) | `#5B5CE0` | `#5B5CE0` | Buttons and links. White on `#7677FB` is only 3.6:1; on `#5B5CE0` it is 5.2:1 |
| `sidebar` (navy) | `#121A3F` | `#0B0E1F` | App sidebar |
| `selected` pill | bg `#ECECFF`, text `#3F40B8`, border `#7677FB` | bg `#262B63`, text `#C7C8FF` | Active filter pill |

### Status
Badges use the tint background, the border, and the darker **text** shade so they pass 4.5:1.

| Status | Dot / fill | Text | Background | Border | Meaning |
|---|---|---|---|---|---|
| Emerald | `#10B981` | `#047857` | `#ECFDF5` | `#A7F3D0` | Done, paid, titled |
| Amber | `#F59E0B` | `#B45309` | `#FFFBEB` | `#FDE68A` | Due soon, pending, partial, reserved |
| Blue | `#3B82F6` | `#1D4ED8` | `#EFF6FF` | `#BFDBFE` | In progress, scheduled, paying |
| Rose | `#F43F5E` | `#BE123C` | `#FFF1F2` | `#FECDD3` | Overdue, encumbered, expired, destructive |
| Slate | `#64748B` | `#475569` | `#F1F5F9` | `#E2E8F0` | Draft, inactive, blocked |

Unit and plot colours reuse these: **violet outline = available** (it's an action), amber reserved, blue paying, emerald fully paid, rose overdue, slate blocked. Filters dim non-matching units instead of hiding them.

### Type
**Geist** for headings and the wordmark. **Inter** for body, labels and every table, with tabular figures (Inter's taller x-height and true tabular digits hold up in dense ₦ columns).

> **Changed 25 Nov 2026:** the boards use Poppins; the owner moved headings to Geist (crisper and more premium). Satoshi, used on the marketing site, was considered but its licence forbids a public repository. Geist is OFL, self-hosted via `@fontsource-variable/geist`. Next design pass: use Geist for headings.

| Style | Font | Weight | Size |
|---|---|---|---|
| Display | Geist | 600 | 40–48px, tracking −0.03em |
| H1 (page title) | Geist | 600 | 24px in the app, 32px on auth screens, tracking −0.02em |
| H2 (section) | Geist | 600 | 18px |
| Body | Inter | 400 | 14px |
| Label | Inter | 600 | 12px, uppercase |
| Data | Inter | 500 | 14px, tabular |

### Spacing and shape
- Spacing scale 4, 8, 12, 16, 24, 32, 48 px.
- Radius **10px** for cards, inputs and buttons. Subtle borders over heavy shadows.
- Mobile touch targets ≥ 44px.

### Product name
The product is **Vento Real Estate** (the company has other Vento products). The lockup is the V mark, the 'Vento' wordmark and a small uppercase 'Real Estate' descriptor; running text always says 'Vento Real Estate', never 'Vento' alone (decision 0022, which lists the three approved short forms).

### Default theme
The app opens in **light mode** (owner's decision, 25 Nov 2026). Dark mode is a choice in the user menu (brick 3), with an option to follow the system setting.

### Surfaces that stay light in dark mode
Buyer portal, receipts, letters and the board pack stay light on purpose: they are documents people print or forward. Customer-facing portals and sign-in use the **developer's own brand**, not Vento's navy.

## Product rules the designs set
These are decisions, not decoration. They're folded into the journeys (`docs/journeys/`) and `docs/DOMAIN.md`; amounts and periods are configuration defaults.

| Area | Rule |
|---|---|
| Sign-in | Five wrong two-step codes lock sign-in for 15 minutes and email the user. Finance and MD roles must set up two-step. |
| Portals | Buyers sign in with a one-time code by WhatsApp, SMS or email. No password. |
| Errors | 403 names who can grant access and sends a request to their Approvals. 500 shows a reference to quote and confirms what was saved. |
| Offline | A banner says what is cached and queued; rows show "Waiting to sync". Money going out and approvals pause while offline. |
| Notifications | Repeated alerts are grouped. Security alerts are always on and can't be muted. |
| Approvals | Approving needs no second confirm (the button names the effect); rejecting needs a comment. A maker can only cancel their own request. Approvals skip anyone with a conflict of interest. Approvals never happen from email. |
| Confirm dialogs | Only for money, approvals and deletions. Everything reversible gets a toast with Undo. |
| Land | An active encumbrance shows in the list, on the parcel, and **blocks its units in Sales**. Clearing one needs evidence and **two approvals**; units unblock after the second. Uploading a document type that already exists adds a version. |
| Parcels | Boundary drawn on the map, typed as survey beacons (Minna datum, UTM 31N), or walked by GPS on a phone. |
| Projects | Milestones show which buyer stage payments they trigger. |
| Contractors | An expired COREN/CORBON registration blocks new contracts and large payments; warning 30 days before. |
| Purchasing | Material requests under the PM's limit (default ₦5m) go straight to purchasing. |
| Units | Bulk create never edits existing units; clashes are listed and skipped. New prices need Finance approval. A price below the phase floor needs MD approval. |
| Leads | Duplicate check on phone and email as you type. "Create anyway" needs a reason and is logged. Realtor duplicates aren't blocked; a person decides ownership. |
| Subscriptions | The flow pins total, deposit and first due date on every step. Country of residence sets the diaspora tag and the currencies offered. Diaspora plans stay fixed in the buyer's currency with the ₦ equivalent beside it. |
| Receipts | Applied oldest-due-first, showing each instalment's new status before confirming. FX is locked to the CBN rate; editing asks for a reason and tags the line "Edited". Cash over the AML threshold (default ₦5m) is **held for AML review**, not refused. Reversal adds an opposite entry; the person who recorded a receipt can't approve its reversal. |
| Refunds | Each deduction line quotes the contract clause it comes from. |
| Commission | Earned per cleared receipt; WHT shown before payment. |
| WHT | Worked out on the amount before VAT using the statutory rule, and the higher no-TIN rate applies if the vendor has no TIN (confirm current rates with finance). |
| Import | Nothing saves until Import. Undo removes exactly what an import added, for 7 days. |
| Letters | One legal layout: letterhead in the developer's brand, reference and date, title, key-facts table, numbered clauses, signature blocks, verify link. The offer letter states the hold deadline; the allocation letter says it doesn't transfer title. Legal wording is a placeholder for lawyers. |
| Emails | Single column, 600px. |
| WhatsApp | Each message is an approved template with quick-reply buttons; replies land in the buyer's conversation. |
| AI | One marker (star + "AI") on anything AI produced; suggestions sit on a faint violet surface until accepted. Ask (the AI question feature, "Ask Vento" on the boards; decision 0022) states what it's based on. Flags are questions, not accusations. |
| Role homes | Same anatomy: four numbers for the role, a queue sorted by due date then impact, two job-specific panels. Each role gets its own sidebar and four mobile tabs. Admins can preview any role. Home follows the location filter: "All entities" is the group-wide view with a per-entity breakdown; one entity shows only that entity; each module fills its part as it ships (release plan §8). |
| Settings | New settings pages use a left sub-navigation. |
| Super-admin | Staff-only console, clearly labelled. Support access is read-only and logged. |
| Statutory | Rates are sourced and dated but must be confirmed by the finance team before go-live. |

## Fictional world used in the designs
Seed data and the golden thread use the same names so screenshots match the app.

- **Organization:** Vento Homes Ltd (12 Admiralty Way, Lekki Phase 1, Lagos)
- **Entities:** Victoria Gardens Dev. Ltd, Parkview Residences SPV Ltd, Lekki Pearl Estates Ltd
- **Projects:** Victoria Gardens Phase 2, Parkview Residences, Lekki Pearl, Abuja Heights
- **Team:** Olumide Bankole (MD), Ngozi Adeyemi (land & legal), Kunle Ojo (project manager), Grace Umeh (sales), Aisha Bello (finance), Kemi Adebayo (HR), Ope Martins (facility), Tunde Ola (accountant)
- **Buyers:** Adaeze Okonkwo (Victoria Gardens A-14), Chidi Eze in the UK (Parkview B-02), Tunde Bakare (Lekki Pearl C-09, overdue)
- **Realtor:** Lekki Realty

## Follow-ups the designer flagged
- The older Roles, Security and AI settings pages use a tab row and should move to the left sub-navigation.
- The new legal-document boards (page 5) replace the earlier offer and allocation letters on the Desktop page.
- New components proposed in round 6 (*New components* board) and the capability/AI components (*Capabilities & AI components* board) are now listed in the design-system skill: code input, password rules, settings navigation, checklist row, permission cell (allowed / up to a limit / not allowed), document letterhead and email header, approval row, timeline item, import step indicator, site-plan plot, AI marker, confidence meter, AI suggestion field, usage meter, masked ID with e-KYC states.

## Designer's notes, by page

### Desktop screens
**Home & onboarding**
- Needs attention is the MD’s inbox: every item carries the one action that resolves it, so the dashboard ends in a decision.
- The project switcher only appears on screens about one project. Home is cross-entity, so it shows the entity switcher alone.
**Land & Title**
- An encumbrance shows in three places on purpose: the list badge, the banner on the parcel, and blocked units in Sales. A court order has to stop a sale wherever one could start.
- Uploading a document of a type that already exists adds a version instead of a new file, so the vault never forks.
**Projects**
- Gantt-lite puts plan and actual in one bar; only late phases get colour. Budget bars carry a budget marker so overruns read without numbers.
- Milestones show which buyer stage payments they trigger, linking construction progress to cash.
**Sales**
- Available units carry the action colour (violet outline); status colours stay for sold, reserved and blocked. Filters dim non-matching units instead of hiding them, so each block keeps its shape.
- The subscription sheet pins total, deposit and first due date under every step. Diaspora plans stay fixed in the buyer’s currency with the ₦ equivalent beside it.
- New buyers can be added inside the flow; country of residence sets the diaspora tag and which currencies the plan offers.
**Subscriptions & receipts**
- Receipts apply oldest-due-first and show each instalment’s new status before you confirm. The confirm button states the amount in both currencies.
- FX is locked to the CBN rate; editing asks for a reason and tags the line “Edited”. Choosing cash over ₦5m turns the button into “send to AML review”: the receipt is held, not refused.
**Generated letters**
- Letters come from the Documents templates, filled from the subscription. The offer letter states the hold deadline; the allocation letter says plainly that it does not transfer title.
**Estates, compliance & documents**
- Payroll reads gross → statutory deductions → net per entity, then what changed since last month and exactly what approval triggers. Approval is the only irreversible step, so it is the only one with a confirm dialog.
- Figures reconcile across screens: Parkview’s ₦1.27bn cash is its four bank accounts; its PAYE in Finance matches the payroll run.
**Settings**
- Each role gets its own home, a sidebar with only its modules, and its own four mobile tabs. Admins can preview any role from the user menu.

### Role homes
**Role homes — each role starts on its own work queue**
- Every role home has the same anatomy: four numbers that matter to that role, a queue sorted by due date then impact, and two panels specific to the job. The MD home is the executive home on the Desktop page.
- Queue items tick off with Undo. In Play, open the user menu → Preview as role to jump between homes.

### Capabilities
**Approvals & activity**
- Approving never needs a second confirm: the button already names the effect. Rejecting needs a comment. Your own requests show as “This is your own request” and can only be cancelled.
- Timelines show who, what, before → after, and who approved it, on every record.
**Excel import**
- Nothing saves until Import. Errors are fixed in the preview table, one click each. Undo removes exactly what that import added, for 7 days.
**Interactive site plan**
- Plot colours reuse the status palette: violet outline = available (an action), amber reserved, blue paying, emerald fully paid, rose overdue. Filters dim rather than hide.
**Partners, digest & security**
- Duplicate leads aren’t blocked: the agent can still submit, and ownership is decided by a person. The digest fits six lines on WhatsApp.

### AI add-on
**AI settings & budget**
- Off by default. Each feature has its own switch and cost estimate. At the limit AI pauses and every form works manually.
**AI inside the work**
- One marker, the star + “AI”, sits on anything AI produced. Suggestions sit on a faint violet surface until a person accepts them.
- Ask always says what it’s based on (“14 subscriptions you have access to”) and how it found them. Actions it offers still go through review.
- Drafts are never sent or published automatically. A flag is a question, not an accusation; each one needs a person and a note.
**Predictions (AI on)**
- These are the same screens as on the Desktop page with AI switched on from the user menu. With AI off they look exactly like the originals.

### Mobile by role
**MD / CEO**
- MD tabs: Home · Approvals · Projects · Reports. Approving money asks for confirmation; reminders are instant with Undo.
**Land & legal**
- Lists become cards on phones; filters become a scrolling chip row; the main action sits in a sticky bar above the tabs.
**Project manager / site**
- Site diary in under 30 seconds: location, yesterday’s worker count and common phrases are prefilled, every target is ≥44px, and entries save offline with a visible sync queue.
- Material requests under the PM’s ₦5m limit go straight to purchasing; the sheet says so before sending.
**Sales**
- Sales: tap a unit for a sheet with price in ₦, USD and GBP, start a subscription or share the brochure on WhatsApp.
**AI on phone**
- Voice diary: hold to talk, then check every field before saving. “Type it instead” is always one tap away.
**HR · facility manager · buyer**
- Buyer portal is a separate light surface under the developer’s name. Bank transfer shows the account and a reference so payments match automatically.
- Buyers with more than one unit switch between them from the header.

### Dark mode
**Dark mode — every app screen**
- Dark versions keep their links inside dark mode, so Play stays dark. Buyer portal, receipt, letters and board pack stay light on purpose: they are documents people print or forward.

### Design system & states
**Design system & screen states**
- Type: Poppins for headings and the brand mark; Inter for body and every table, with tabular figures. Inter’s taller x-height and true tnum digits hold up in dense ₦ columns where Poppins’ geometric numerals blur.
- Brand violet #7677FB is for focus, selection and charts. Button fills and links use #5B5CE0 because white on #7677FB is only 3.6:1. Status text uses the darker shade of each status colour so badges pass 4.5:1.
- Every list uses the same five states. The offline banner says what is cached, what is queued and that nothing is lost.

### Board pack (print)

### 1 · Access & system states
**Sign in, two-step, sign up**
- Two-step shows its error state: the code boxes turn rose and the message says what to do. Five wrong tries lock sign-in for 15 minutes and email the user.
- Invitations show the organization, role and what the role can approve before the person sets a password. Finance and MD roles must set up two-step.
**Buyer and partner portals (customer-facing)**
- Customer sign-in uses the developer’s own brand, not Vento’s navy. Buyers sign in with a one-time code by WhatsApp, SMS or email, so there is no password to forget from abroad.
**No access, not found, errors, offline, session**
- 403 names the people who can grant access and sends the request to their Approvals. 500 shows a reference to quote and confirms what was saved.
- Offline: the banner sits above the page and rows say “Waiting to sync”. Money going out and approvals pause while offline.
**Notifications**
- Repeated alerts are grouped (6 receipts → one line). Security alerts are always on and can’t be muted.

### 2 · Sales lifecycle
**Units**
- Unit detail tabs: Overview, Activity (before → after, who approved), Price & status history.
- Bulk create never edits existing units; clashes are listed and skipped.
- Price list: “Schedule next phase” opens the dialog; new prices need Finance approval.
**Leads and contacts**
- Duplicate check runs on phone and email as you type. “Create anyway” asks for a reason and is logged. Lead detail is unchanged from the Desktop page.
- One contact can hold several roles. Approvals skip anyone with a conflict (e.g. the salesperson who sold to a contractor’s director).
**Payment plans**
- Reschedule shows old and new side by side and the requester’s “Waiting for approval by Finance” state.
**Ending, transferring and handing over**
- Refund lines quote the contract clause they come from, so the buyer and approver see the same basis.
**Commissions**
- Commission is earned per cleared receipt and shows WHT at 5% before payment. The list is on the Desktop page.

### 3 · Finance operations
**Receipts**
- Reversing never deletes: it adds an opposite entry. The person who recorded a receipt can’t approve its reversal.
**Bills and WHT**
- WHT is worked out on the amount before VAT, using the rule in Statutory rules, and doubled automatically if the vendor has no TIN.
**Close and statements**
- Statements tabs: trial balance, P&L, balance sheet, cash flow. Figures are illustrative but the trial balance balances.

### 4 · Land & construction
**Parcels**
- Boundary: draw on the map or type beacons from the survey plan (Minna datum, UTM 31N). On a phone, walk the boundary and capture each beacon by GPS.
- Clearing an encumbrance needs evidence and two approvals; sales unblock only after the second.
**Contractors**
- An expired COREN or CORBON registration blocks new contracts and large payments, with a warning 30 days before.
**Request → order → receive**
- The same four-step indicator appears on each screen so people know where an order is.

### 5 · Documents & messages
**Legal documents (A4, organization letterhead)**
- One layout for every document: letterhead in the developer’s brand, reference and date, title, key-facts table, numbered clauses, signature blocks, verify link. These replace the two earlier letters on the Desktop page.
- Legal wording is a placeholder for your lawyers to replace.
**Emails**
- Single column, 600 px, so the same email works on a phone. Approvals never happen from email.
**WhatsApp**
- Each is an approved template with quick-reply buttons. Replies land in the buyer’s conversation in Vento Real Estate.

### 6 · Settings & admin
**New components in this round**
- Proposed only where nothing in the design system fitted; the reason is on each card.
**Settings with left navigation**
- New settings pages use a left sub-navigation (new component: settings nav). The older Roles, Security and AI pages still use the tab row and should move to it.
- Statutory rates are sourced and dated, but must be confirmed by your finance team before go-live.
**Super-admin (Vento Real Estate staff)**
- Staff-only console with its own label in the sidebar so nobody mistakes it for a customer workspace. Support access is read-only and logged.