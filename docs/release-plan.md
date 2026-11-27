# Release plan

- **Status:** approved (26 Nov 2026). A living recommendation, not a gate: see [Owner's decisions](#9-owners-decisions-26-nov-2026)
- **Related:** `docs/PRODUCT.md` (scope), decision 0002 (all ten modules in v1), [feature flags and plan entitlements spec](specs/feature-flags.md) (how built features stay off until released), `docs/journeys/README.md` (journey IDs)

**The owner's principle:** "We can build all and release as we see fit."

- **Build order and release order are separate.** The build continues through all ten modules (decision 0002), whatever is decided about releases.
- **A release is a set of flags switched on**, not a deploy. Anything built but not yet released stays switched off for customers. Vento staff, and any pilot organizations the owner chooses, can still use it.
- **The owner decides what ships and when, feature by feature** (section 6). The releases below are the recommended grouping and order. They aren't a gate.
- On top of release, a customer gets a feature only if their **plan** includes it (section 5).

---

## 1. The first customer

Taken from `docs/PRODUCT.md` ("growing firms, 1–3 projects"). The numbers are assumptions to confirm with early customers.

**Who.** A Nigerian developer selling off-plan, typically in Lagos (Lekki–Epe corridor) or Abuja. A holding company plus one SPV per project, 1–3 live projects and a few hundred buyers, a good share of them in the diaspora (UK, US, Canada, UAE). An MD who signs off on everything, a sales team supported by realtors, a project manager and site engineers on site, and one to three people in finance.

**How they work today.** Excel sheets for units, buyers and payment schedules, and for the BoQ and site costs. Bank alerts and WhatsApp screenshots as proof of payment. Material requests on paper or WhatsApp, and site progress in WhatsApp groups. Receipts and letters typed in Word. Books kept in separate accounting software, or by an outside accountant. The MD asks "how much have we collected, and how much has the site spent?" and waits a day for the answer.

**What they need from Vento in the first phase:**
> Every unit, buyer and instalment in one place. Every naira or dollar received recorded once, allocated to the right instalment and posted to the right SPV's books. Every bag of cement requested, ordered and received against the BoQ and budget, with the site diary kept on a phone even on a weak connection. Buyers who see their own balance and the building going up. An MD who sees sales, collections, arrears and site spend without asking anyone.

That is the thread from `PRODUCT.md`, `Land parcel → Project → Units → Subscription + Payment plan → Receipts → Ledger (per SPV)`, together with the site and its costs, the buyer portal and the executive view.

---

## 2. Release 1 (MVP): "Sell, collect and build"

**Test for each item:** would a developer refuse to switch without it, or would money, the site or the law be at risk without it?

### Platform (always on, not flagged)
| In | Why |
|---|---|
| Accounts, two-step, roles, invitations, entities (bricks 2a, 3b, 3c) | Without them, no team can use Vento Real Estate safely. Already built or approved. |
| App shell, ⌘K, error pages (3a) | Needed to find your way around. In build. |
| My security: two-step settings, backup codes, sessions (3d) | Finance and MD accounts need it. **Passkeys ship at `pilot`** (flag `platform.passkeys`) and are switched on for everyone after the security audit. |
| **Maker-checker approvals** with default rules, Approvals inbox, approval notifications (brick 4) | Money moves in Release 1. Receipt reversals, refunds, cancellations, price list changes, reschedules, purchase orders and manual journals each need a second person. |
| **Audit log** and record timelines (brick 4) | "Money and title you can trust" (principle 4). The first time a balance or a PO is disputed, the MD will ask who changed it. |
| **Excel import**: units, buyers, subscriptions, payments to date, BoQ, with undo | **The make-or-break for a new customer.** Nobody re-keys 300 buyers or a 600-line BoQ. Importing parcels and staff comes later. |
| **Branding** (logo and colours on documents and the portal) | App-shell owner's decision 6: it arrives with the first customer-facing document, which is in Release 1. |
| **Email** (Postmark) for invitations, receipts, statements, reminders, approvals and POs | App-shell owner's decision 5. |
| **WhatsApp, one-way** (reminder, overdue, receipt templates) | WhatsApp is where Nigerian buyers actually read messages. It depends on a provider and Meta's template approval, so it ships behind `platform.whatsapp`; if it isn't ready, Release 1 goes out email-only. |
| **Automatic reminders** on the default schedule | **Off for each organization until finance confirms the imported balances**, so a wrong figure from Excel never reaches a buyer. |
| Setup checklist on Home | Walks a new customer through team, bank account, Paystack, import, BoQ and reminders. |

### Modules
| Module | In Release 1 | Why | Later |
|---|---|---|---|
| **Land & title** (`land`) | Parcels, title stage tracker, document vault with versions, encumbrance register (an active encumbrance blocks units) | Projects sit on parcels. Buyers and their lawyers ask about the C of O and consent before paying. An encumbrance must stop sales the day it's recorded. | Surveys, valuations, land bank (R3) |
| **Projects** (`projects`, `projects.costs`, `projects.procurement`, `projects.site_diary`) | Projects on parcels, owned by an entity. Phases and milestones with % complete. **BoQ** with dated material rates and **budget vs actual** per phase. **Contractors and vendors** (with COREN/CORBON details), **material requests → purchase orders (with approval) → goods received**, vendor scorecards. **Site diary** from a phone with geo-tagged photos, delays with reasons, and the **offline queue**. | **Owner's decision: site work is critical in the first phase.** Construction is where most of a developer's money goes. The site diary feeds buyers' progress photos and the MD's view of the site. | Construction-linked plans (R2) |
| **Sales** (`sales`) | Units (bulk create), price lists (with approval), unit availability grid, contacts and buyers, **subscriptions with payment plans** (outright and fixed instalments, NGN or foreign currency), plan templates, delinquency list and reminders, reschedule (with approval), cancel or default and refund (with approval), **allocation letter** | The core of the job. Reschedules and cancellations happen every month in off-plan sales. | Leads, commissions, unit transfer, estate layout (R2). Handover (R4) |
| **Finance** (`finance`, `finance.paystack`, `finance.bank_import`, `finance.vendor_bills`) | Bank accounts per entity, chart of accounts from the template, **record receipt** (transfer, cash, POS, cheque, foreign transfer) allocated to instalments, receipt PDF, reverse (with approval), FX rates with source, **Paystack** virtual accounts and online payment, **bank statement import with exact-match rules**, **vendor bills and payments with WHT** (from goods received; WHT credit notes), automatic ledger postings per entity, manual journals (with approval), trial balance per entity | "Receipts reconciled to a ledger per SPV", and site costs paid and posted correctly. Paystack virtual accounts give zero manual matching for transfers. | Period close, statements, IFRS 15, facilities, tax summary (R3) |
| **Compliance** (`compliance`, `compliance.permits`) | **Buyer KYC** (manual) and the **large-cash AML flag** with a review list. **Permit tracker** per project with expiry alerts. | Developers are DNFBPs under the MLPPA 2022, so KYC matters from the first sale. Building permits sit beside the site work. | e-KYC (R2). UBO, SCUML/NFIU records (R3) |
| **Documents** (`documents`) | **Letter of offer, allocation letter, receipt, statement of account and purchase order**, in a built-in layout with the developer's branding and **per-project terms text**. Signed contracts uploaded to the record. | Buyers and vendors expect documents on letterhead. Lawyers' wording differs per project, so the terms are text, not a template editor. | Template editor, contract register, e-signature (R3) |
| **Buyer portal** (`buyer_portal`) | One-time-code sign-in, units and payment progress, statement and receipts, **pay now** (Paystack, NGN), **progress photos from the site diary**, download documents | Takes away the "what's my balance?" calls, and shows diaspora buyers the building going up. | Refer a friend, request a document, profile and KYC upload (R2) |
| **Reports** (`analytics`) | Executive home (booked vs received, collections, arrears by age, cash by entity, units sold vs available, **project progress and budget variance**), Sales, Finance and Project manager homes, exports: **sales register, receipts register, receivables ageing, budget vs actual** | The MD's morning check-in. The exports go to the outside accountant until R3. | Board pack, IRR/ROI, report library (R3) |
| Estates, HR & payroll | **Not in Release 1 (recommended)** | Estates start after handover. Payroll is often outsourced, high-risk under the 2025 tax acts, and separate from the sales and site thread. | R4 |
| AI add-on | **Not in Release 1 (recommended)** | Every AI feature has a manual path. Customers' own data is needed to test them properly. | Per feature (section 3) |

### Journeys in Release 1
J-ONB-01 to J-ONB-05 · J-LND-01, J-LND-02, J-LND-03 · J-PRJ-01, J-PRJ-02, J-PRJ-03 · J-SAL-01, J-SAL-03, J-SAL-04, J-SAL-05, J-SAL-06 · J-SAL-07 *(allocation only)* · J-FIN-01, J-FIN-02, J-FIN-03 *(exact-match rules, no AI)*, J-FIN-04, J-FIN-05, J-FIN-06 · J-CMP-01 *(manual KYC)* · J-CMP-02 *(large-cash flag only)* · J-CMP-03 · J-EXE-01, J-EXE-02 · J-BUY-01, J-BUY-02 · J-ADM-01, J-ADM-02 (Vento staff).

### Recommended to leave out of Release 1
Leads pipeline and realtors, commissions, interactive estate layout, construction-linked plans, daily digest, two-way WhatsApp, SMS, e-KYC, self-service NDPA export and deletion (Vento support handles requests until R2), billing (invoiced by hand at first).

---

## 3. Releases after Release 1

These are recommendations for grouping and order. Each feature is released when the owner chooses (section 6), and can go to one organization early with an override.

| Release | Name | What it unlocks for the customer | Main contents | Journeys |
|---|---|---|---|---|
| **R2** | Sell more, chase less | Sales grows without hiring more people, and buyers hear from Vento Real Estate where they read: WhatsApp. | Leads pipeline, realtor portal and **commissions** (paid with WHT), construction-linked plans and milestone billing, unit transfer, interactive estate layout, two-way WhatsApp and SMS fallback, reminder schedule settings, daily digest, e-KYC, buyer portal extras, self-service NDPA export | J-SAL-02, J-SAL-08, J-RLT-01, J-PRJ-04, J-CMP-01 (e-KYC) |
| **R3** | Close the books, brief the board | Finance stops exporting to the outside accountant, and the MD gets a board pack. | Period close and lock, financial statements, intercompany entries, construction facilities and drawdowns, IFRS 15 revenue recognition, tax summary. Documents in full: template editor, contract register, e-signature. UBO register, SCUML/NFIU records. Board pack, IRR/ROI, land bank valuations, report library. | J-FIN-07, J-FIN-08, J-DOC-01, J-EXE-03 |
| **R4** | Hand over and run | The developer keeps the relationship after handover, and the whole company is on Vento Real Estate. | Handover checklist and certificate, Estates (service charge, utilities, maintenance, assets), HR & payroll (PAYE under the 2025 acts, pension, NHF, NSITF, ITF), leave, professional memberships | J-SAL-07 (handover), J-FAC-01, J-FAC-02, J-HR-01 to J-HR-03 |
| **AI** | Add-on, released per feature | Less typing and matching, for customers who turn it on. | Each feature is releasable once its eval passes (`ai-features` skill). Likely order: payment matching (extends statement import), document reading, voice site diary (extends the Release 1 diary), drafting, Ask, predictions and anomalies (once there's history). | J-AI-01 to J-AI-04 |

**Why this order.** R2 makes the Release 1 job cheaper to run and brings in more sales. R3 needs the costs and receipts from Release 1 before the statements and IFRS 15 mean anything. R4 serves projects that have been handed over, and payroll, which customers already handle elsewhere.

---

## 4. Built but off

The full rules are in the [feature flags spec](specs/feature-flags.md). In short:

1. **Everything merged goes to production, switched off for customers.** A new feature starts at stage `internal`: Vento Real Estate staff and its own internal organizations (the seeded Vento Homes Ltd demo) can use it. Customers can't see it, and its API answers "not found".
2. **Pilot (optional).** The owner can put chosen organizations in the `pilot` group and move a feature to stage `pilot` to let them use it early, with an "Early access" tag. There are no fixed thresholds for pilots; they're a choice, not a step every feature must pass.
3. **Release.** Moving a feature's flag to `on` *is* the release, together with release notes, the help article and the journey status changing to `built`. No deploy is needed.
4. **Rollback.** Setting a flag to `off` hides the feature from everyone within 30 seconds. Data is never deleted, and inbound money (Paystack webhooks) is always recorded.
5. **Database changes ship to everyone.** Tables for a switched-off feature exist and sit empty. Migrations stay backward compatible, so switching a flag never needs a migration.
6. **Clean-up.** Once a flag has been `on` for everyone for two releases, it is removed from the code. Add-ons (AI) and integration switches (Paystack, WhatsApp) stay as permanent flags.

**Release and plan are separate questions.** A released feature reaches a customer only if their plan, an add-on or an override from Vento (a trial or a negotiated deal) includes it (section 5).

---

## 5. Plans

Approved as the starting point. Plans are data, so names, contents, limits and prices can change without a deploy. Existing customers keep their plan version until moved.

**Principles**
- **The Release 1 job is in every plan, including the site work.** Even the smallest developer gets land to receipts to ledger, the BoQ, procurement and site diary, the buyer portal and the executive view. Plans differ mainly by **size**, and by the **later releases** larger developers need.
- **Security and compliance are never upsold:** two-step, passkeys, approvals, audit, KYC and AML, permits, UBO and SCUML records, and data protection tools are in every plan.
- **Things that cost Vento money per use** (WhatsApp messages, e-KYC checks, AI) sit in higher plans or add-ons.

| | **Starter** | **Growth** | **Enterprise** |
|---|---|---|---|
| For | 1 project, a small team | 2–5 projects, a sales team and realtors | Several SPVs, in-house finance team, board reporting |
| Active projects | 1 | 5 | Unlimited |
| Active entities | 2 (holding company + 1 SPV) | 6 | Unlimited |
| People (members and pending invitations) | 10 | 40 | Unlimited |
| **Release 1** | Land & title; Projects with BoQ and budget, material requests → POs → goods received, contractors and vendors, site diary with offline; Sales; Finance (receipts, Paystack, statement import, vendor bills with WHT, ledger); KYC, AML and permits; letters, receipts and POs; Buyer portal; Reports; Excel import; email reminders | Everything in Starter, plus **WhatsApp** reminders and receipts | Everything in Growth |
| R2 | – | Leads, commissions, realtor portal, estate layout, unit transfer, construction-linked plans, two-way WhatsApp, SMS, daily digest, e-KYC | Everything in Growth |
| R3 | UBO and SCUML records | UBO and SCUML records | Period close and statements, intercompany, construction finance, IFRS 15, tax summary, contracts and e-signature, board pack |
| R4 | – | Estates, HR & payroll | Everything in Growth |
| AI | Add-on | Add-on | Add-on (a monthly allowance may be included later) |

**Pilot organizations**, if the owner uses them, are on **Enterprise at no charge** while piloting, recorded with a reason, and then move to the plan they choose.

---

## 6. When we release

**The owner decides what ships and when, feature by feature, using the flags.** There are no release gates or fixed adoption thresholds.

A feature is **releasable** when:
1. **Built:** its spec's acceptance criteria are met, and its journey matches what was built.
2. **Tested:** its journey's e2e test and its unit and integration tests pass in CI.
3. **Reviewed:** reviewer and UI-designer checks are done, plus the security audit where money, access or personal data is involved.
4. **Documented:** its help article is written and release notes are drafted.
5. **Seen by the owner:** the owner has done the hands-on review of that feature.

Once a feature is releasable, the owner may:
- **release it to everyone** (`on`);
- **give it to chosen organizations first** (`pilot` with the pilot group, or an override for one organization);
- or **keep it at `internal`** for as long as they like.

Before the first customer goes live, Vento also needs:
- a privacy notice listing every processor (Postmark, Paystack, the WhatsApp provider), each with a data processing agreement;
- backups that have been restored in a drill;
- the platform security audit.

---

## 7. What this changes elsewhere
- `docs/PRODUCT.md`: a pointer to this plan.
- `docs/DOMAIN.md`: terms *Feature*, *Available*, *Releasable*, *Release*, *Release stage*, *Release group*, *Feature flag*, *Early access*, *Plan*, *Entitlement*, *Limit*, *Add-on*, *Override*, *Trial*, *Super-admin*.
- Brick 3a's `nav.ts` `status` field gives way to flags (see the flag spec).
- Specs for J-SAL-07, J-FIN-03, J-CMP-01 and J-CMP-02 must say what Release 1 covers and what comes later.

---

## 8. Build order
The build follows the dependencies, not the release grouping, and continues through every module: shell and settings (3a–3d), feature flags and plans, **the Vento Real Estate console right after 3d** (owner's decision 26 Nov 2026: organizations, plans and trials, releases, AI usage, failed jobs, read-only support access; clearly separate from customer workspaces; real two-step sign-in for admin actions, replacing `--by` attribution), approvals and audit (brick 4), then the modules along the thread (land, projects and site, sales, finance, compliance, documents, buyer portal, reports), then R2–R4 features and the AI add-on. A module can be built well before it is released, and stays at `internal` until the owner releases it.

**Role homes grow with each module (owner's rule, 26 Nov 2026).** Every role lands on a home made for its job, with one anatomy (DESIGN-NOTES "Role homes"): four numbers for the role, a work queue sorted by due date then impact, and two job-specific panels. Each module brick adds its own numbers, queue items and panels to the role homes it serves (e.g. Sales adds overdue buyers to the Sales and MD homes; Projects adds today's diary and deliveries to the project manager and site homes). Everything on Home follows the location filter: **All entities** shows the group-wide view with a per-entity breakdown; choosing one entity shows only that entity's numbers, queue and panels; members limited to one entity see it automatically; Projects adds a project/site filter for project managers and site engineers. No separate dashboard project at the end.

**Entities vs estates (owner's discussion, 26 Nov 2026; for the 3c spec).** An entity is a registered company (SPV); an estate or site is a project under one entity. 3c names the top-bar filter "Company" (not "location"), adds "+ Add entity" at the foot of the switcher for owners and admins, a setup step "Add your other companies (SPVs)", and one line on the Add entity form: "A separate registered company, like an SPV for one estate. To add another estate, create a project instead." The Projects brick adds the project filter beside it.

---

## 9. Owner's decisions (26 Nov 2026)
1. **Release 1 includes site work** (owner's change): BoQ with material rates and budget vs actual; contractors and vendors; material requests → purchase orders → goods received; full site diary with the offline queue. Vendor bills with WHT and the permit tracker come with it. Later releases are renumbered: R2 Sell more, R3 Close the books, R4 Hand over and run.
2. **Site work is in every plan**, Starter included.
3. **No pilot exit criteria** (owner's change). The owner releases feature by feature once a feature is releasable (section 6). Pilots stay optional, with no fixed thresholds.
4. **The plan is a living recommendation, not a gate.** Build order and release order are separate, and the build continues through all modules whatever is released.
5. Leads pipeline, realtor portal and commissions: R2.
6. Passkeys built in 3d, shipped at `pilot`, on for everyone after the security audit.
7. WhatsApp one-way templates behind a flag; email-only if the templates aren't approved in time.
8. Letters, receipts and POs: built-in layout plus per-project terms text; template editor in R3.
9. Automatic intercompany pair for receipts paid into another entity's bank account (drop it if no customer collects that way).
10. Release order R2 → R4 as recommended, with per-organization overrides for a customer who needs a later module early.
11. Automatic reminders off for each organization until finance confirms imported balances.
12. Imported subscriptions without KYC come in `active` with KYC "not collected"; new sales still require KYC before `active`.
13. Pilots are optional; if used, two or three developers, Enterprise at no charge while piloting.
14. Feature flags and plans are built as the next slice after 3a (before 3b).
15. Three plans (Starter, Growth, Enterprise) as in section 5, with the owner free to rename and reprice them.
16. Features outside an organization's plan are hidden from everyone's navigation; owners alone see "Available on Growth" in ⌘K and limit messages, with **Talk to Vento Real Estate**.
17. Security and compliance are in every plan.
18. The flag spec's defaults are approved: NOT_FOUND for unavailable features, "Early access" tag, "Soon" only in internal organizations, no second approver while fewer than four super-admins, customers told of changes in their audit trail, 30-second propagation, plan versions keep existing customers on their deal.
