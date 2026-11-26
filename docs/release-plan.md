# Release plan

- **Status:** draft for the owner's review (26 Nov 2026)
- **Related:** `docs/PRODUCT.md` (scope), decision 0002 (all ten modules in v1), [feature flags spec](specs/feature-flags.md) (how built features stay off until released), `docs/journeys/README.md` (journey IDs)

**The idea in one line:** we build all ten modules (decision 0002 stands), but customers get them in releases. Each release is a set of feature flags switched on, not a separate deploy. Anything already built that isn't in the current release stays switched off for customers. Vento staff and pilot organizations can still use it. On top of that, a customer gets a released feature only if their **plan** includes it (section 5).

Everything marked **Owner decides** has a recommended default. If you agree with the default, nothing else needs doing.

---

## 1. The first customer

Taken from `docs/PRODUCT.md` ("growing firms, 1–3 projects"). The numbers are assumptions for the pilots to confirm.

**Who.** A Nigerian developer selling off-plan, typically in Lagos (Lekki–Epe corridor) or Abuja. A holding company plus one SPV per project, 1–3 live projects and a few hundred buyers, a good share of them in the diaspora (UK, US, Canada, UAE). An MD who signs off on everything, a sales team supported by realtors, and one to three people in finance.

**How they work today.** Excel sheets for units, buyers and payment schedules. Bank alerts and WhatsApp screenshots as proof of payment. Receipts and letters typed in Word. Books kept in separate accounting software, or by an outside accountant who gets the figures at month end. The MD asks "how much have we collected?" and waits a day for the answer.

**What they need from Vento in month one:**
> Every unit, buyer and instalment in one place. Every naira or dollar received recorded once, allocated to the right instalment and posted to the right SPV's books. Buyers who can see their own balance without calling. An MD who sees sales, collections and arrears without asking anyone.

That is the thread `Land parcel → Project → Units → Subscription + Payment plan → Receipts → Ledger (per SPV)` from `PRODUCT.md`, plus the buyer portal and the executive view. Every other module adds value to that thread. None of them is the reason a developer switches.

---

## 2. MVP (Release 1): "Sell and collect"

**Test for each item:** would a developer refuse to switch without it, or would money or the law be at risk without it? If neither, it isn't in Release 1.

### Platform (always on, not flagged)
| In | Why |
|---|---|
| Accounts, two-step, roles, invitations, entities (bricks 2a, 3b, 3c) | Without them, no team can use Vento safely. Already built or approved. |
| App shell, ⌘K, error pages (3a) | Needed to find your way around. In build. |
| My security: two-step settings, backup codes, sessions (3d) | Finance and MD accounts need it. **Passkeys ship turned off** (flag `platform.passkeys`, pilot first): good to have, but nobody needs them to switch. |
| **Maker-checker approvals** with default rules, Approvals inbox, approval notifications (brick 4) | Money moves in Release 1. Reversing a receipt, refunds, cancellations, price list changes, reschedules and manual journals each need a second person. |
| **Audit log** and record timelines (brick 4) | "Money and title you can trust" (principle 4). The first time a balance is disputed, the MD will ask who changed it. |
| **Excel import**: units, buyers, subscriptions, payments to date, with undo | **The single biggest reason a pilot succeeds or fails.** Nobody re-keys 300 buyers. Importing parcels and staff comes later. |
| **Branding** (logo and colours on documents and the portal) | Owner's decision 6 in the app-shell spec: it arrives with the first customer-facing document, which is in Release 1. |
| **Email** (Postmark) for invitations, receipts, statements, reminders and approvals | Owner's decision 5. Every message in Release 1 can at least go by email. |
| **WhatsApp, one-way** (reminder, overdue, receipt templates) | WhatsApp is where Nigerian buyers actually read messages. It depends on a provider and Meta approving the templates, so it ships behind `platform.whatsapp`. If it isn't ready at launch, Release 1 goes out email-only. **Owner decides** (see 8.4). |
| **Automatic reminders** on the default schedule | Saves the most time after Paystack. **Off for each organization until finance confirms the imported balances are right**, so a wrong figure from Excel never goes to a buyer. |
| Setup checklist on Home | Walks a new customer through team, bank account, Paystack, import and reminders. |

### Modules
| Module | In Release 1 | Why | Later |
|---|---|---|---|
| **Land & title** (`land`) | Parcels, title stage tracker, document vault with versions, encumbrance register (an active encumbrance blocks units) | Projects sit on parcels. Buyers and their lawyers ask about the C of O and consent before paying. An encumbrance must stop sales the day it's recorded. | Surveys, valuations and the land bank (R4) |
| **Projects** (`projects`) | Projects on parcels, owned by an entity. Phases with planned dates and % complete. **Progress updates** with photos from a phone (online only). | Units need a project. Buyers want proof that building is happening, and the portal shows these photos. | BoQ, budget vs actual, contractors, POs, full site diary with offline (R3). Construction-linked plans (R2) |
| **Sales** (`sales`) | Units (bulk create), price lists (with approval), unit availability grid, contacts and buyers, **subscriptions with payment plans** (outright and fixed instalments, NGN or foreign currency), plan templates, delinquency list and reminders, reschedule (with approval), cancel or default and refund (with approval), **allocation letter** | This is the core of the job. Reschedules and cancellations happen every month in off-plan sales. Without them, finance goes back to Excel. | Leads pipeline, commissions, unit transfer, estate layout (R2). Handover (R5) |
| **Finance** (`finance`) | Bank accounts per entity, chart of accounts from the template, **record receipt** (transfer, cash, POS, cheque, foreign transfer) allocated to instalments, receipt PDF, reverse (with approval), FX rates with source, **Paystack** virtual accounts and online payment, **bank statement import with exact-match rules** (CSV or Excel, mapping remembered per account), automatic ledger postings per entity, manual journals (with approval), trial balance per entity | This is "receipts reconciled to a ledger per SPV". Paystack virtual accounts give zero manual matching for transfers, which is the headline reason to switch. Statement import is how finance reconciles the bank at month end. | Vendor bills and WHT (R3). Period close, statements, IFRS 15, facilities, tax (R4) |
| **Compliance** (`compliance`) | **Buyer KYC** (manual: ID type, masked number, documents, status) and the **large-cash AML flag** with a review list | Developers are DNFBPs under the MLPPA 2022. A sale without KYC is a legal risk from the first day, and the flag is a cheap rule. | e-KYC provider (R2). Permits (R3). UBO, SCUML/NFIU records (R4) |
| **Documents** (`documents`) | **Letter of offer, allocation letter, receipt and statement of account**, generated in a built-in layout with the developer's branding and **per-project terms text**. Signed contracts uploaded to the subscription. | Buyers expect a letter of offer and a receipt on letterhead. Lawyers' wording differs per project, so the terms are text, not a template editor. **Owner decides** (8.5). | Template editor, contract register, e-signature (R4) |
| **Buyer portal** (`buyer_portal`) | One-time-code sign-in, my units and payment progress, statement and receipts, **pay now** (Paystack, NGN), progress photos, download documents | Takes away the "what's my balance?" calls, and gives diaspora buyers proof that the building exists. | Refer a friend, request a document, profile and KYC upload (R2) |
| **Reports** (`analytics`) | Executive home (booked vs received, collections this month, arrears by age, cash by entity, units sold vs available), Sales and Finance homes, three exports: **sales register, receipts register, receivables ageing** | The MD's morning check-in. The exports go to the outside accountant until R4. | Board pack, IRR/ROI, report library (R4) |
| Estates, HR & payroll | **Not in Release 1** | Estates start after handover; most first projects are still being built. Payroll is often outsourced, it's high-risk under the 2025 tax acts, and it doesn't touch sales or collections. | R5 |
| AI add-on | **Not in Release 1** | Every AI feature has a manual path. Customers' own data is needed to test them properly. | From R2, one feature at a time (section 3) |

### Journeys in Release 1
J-ONB-01 to J-ONB-05 · J-LND-01, J-LND-02, J-LND-03 · J-PRJ-01 *(reduced: project and phases, no BoQ or budget)* · J-PRJ-02 *(reduced: progress update with photos, online only)* · J-SAL-01, J-SAL-03, J-SAL-04, J-SAL-05, J-SAL-06 · J-SAL-07 *(allocation only)* · J-FIN-01, J-FIN-02, J-FIN-03 *(exact-match rules, no AI)*, J-FIN-04, J-FIN-05 · J-CMP-01 *(manual KYC)* · J-CMP-02 *(large-cash flag only)* · J-EXE-01, J-EXE-02 · J-BUY-01, J-BUY-02 · J-ADM-01 (releasing a feature, Vento staff).

The journeys marked *reduced* are edited when their specs are written, so each one says exactly what Release 1 covers.

### Deliberately left out of Release 1
Leads pipeline and realtors (they live in WhatsApp and the realtors' own networks today, so this isn't a reason to switch). Commissions (calculated in Excel for now). Interactive estate layout (the unit grid does the job). Construction-linked plans. Daily digest. Two-way WhatsApp. SMS. e-KYC. Super-admin console (a command does the job, see the flag spec). Self-service NDPA export and deletion (handled by Vento support on request until R2). Billing (pilots are invoiced by hand).

---

## 3. Releases after the MVP

Ordered by what the first customers will ask for next, following the thread from `PRODUCT.md` outward. Each release starts in pilot and goes to everyone once it meets the bar in section 4.

| Release | Name | What it unlocks for the customer | Main contents | Journeys |
|---|---|---|---|---|
| **R2** | Sell more, chase less | Sales grows without hiring more people, and buyers hear from Vento where they read: WhatsApp. | Leads pipeline, realtor portal and **commissions** (paid with WHT from statutory rules), construction-linked plans and milestone billing, unit transfer, interactive estate layout, two-way WhatsApp and SMS fallback, reminder schedule settings, daily digest, e-KYC, buyer portal extras, self-service NDPA export, **super-admin console** | J-SAL-02, J-SAL-08, J-RLT-01, J-PRJ-04, J-CMP-01 (e-KYC) |
| **R3** | Build on site | The project manager and site team move into Vento, and costs start flowing to the books. | Projects in full: BoQ with material rates, budget vs actual, contractors, material requests and POs, vendor scorecards, site diary with the offline queue. Vendor bills with WHT. Permit tracker with expiry alerts. | J-PRJ-01 (full), J-PRJ-02 (full), J-PRJ-03, J-FIN-06, J-CMP-03 |
| **R4** | Close the books, brief the board | Finance stops exporting to the outside accountant, and the MD gets a board pack. | Period close and lock, financial statements, intercompany entries, construction facilities and drawdowns, IFRS 15 revenue recognition, tax summary. Documents in full: template editor, contract register, e-signature. UBO register, SCUML/NFIU records. Board pack, IRR/ROI, land bank valuations, report library. | J-FIN-07, J-FIN-08, J-DOC-01, J-EXE-03 |
| **R5** | Hand over and run | The developer keeps the relationship after handover, and the whole company is on Vento. | Handover checklist and certificate, Estates (service charge, utilities, maintenance, assets), HR & payroll (PAYE under the 2025 acts, pension, NHF, NSITF, ITF), leave, professional memberships | J-SAL-07 (handover), J-FAC-01, J-FAC-02, J-HR-01 to J-HR-03 |
| **AI** | Add-on, released per feature | Less typing and matching, for customers who turn it on. | Each feature goes internal → pilot → on once its eval passes (`ai-features` skill). Likely order: payment matching (extends R1 statement import), document reading, drafting, Ask Vento, voice site diary (after R3), predictions and anomalies (once there's history to learn from). | J-AI-01 to J-AI-04 |

**Why this order.** R2 makes the Release 1 job cheaper to run and brings in more sales, which is what a developer pays for. R3 brings the second-largest group of users (site and project staff) and the cost side of the books. R4 needs R3's costs before the statements and IFRS 15 mean anything. R5 serves projects that have been handed over, and payroll, which customers already handle elsewhere.

**Owner decides (8.7):** if a pilot developer has already handed over estates, or insists on payroll, one module can move earlier on its own (a `pilot` override for that organization). The release order itself stays the same.

---

## 4. Built but off

The full rules are in the [feature flags spec](specs/feature-flags.md). In short:

1. **Everything merged goes to production, switched off for customers.** A new module or feature starts at stage `internal`: Vento staff and Vento's own test organizations (the seeded Vento Homes Ltd demo) can use it. Customers can't see it in navigation, ⌘K, Home or settings, and its API answers "not found".
2. **Pilot.** At stage `pilot` it is also on for organizations in the pilot group (chosen developers who have agreed to try new things and talk to us weekly). Pilot users see an "Early access" tag beside it.
3. **Release.** Moving the release's flags to `on` *is* the release, together with release notes, help articles and the journey statuses changing to `built`. No deploy is needed.
4. **Rollback.** Setting a flag back to `off` hides the feature from everyone within 30 seconds. Data is never deleted, and inbound money (Paystack webhooks) is always recorded.
5. **Database changes ship to everyone.** Tables for a feature that's switched off exist and sit empty. Migrations stay backward compatible, so switching a flag never needs a migration.
6. **Clean-up.** Once a flag has been `on` for everyone through two releases, it is removed from the code. Add-ons (AI) and integration switches (Paystack, WhatsApp) stay as permanent flags.

**When a feature can move up a stage:**
- `internal → pilot`: its journey's e2e test passes, reviewer and UI-designer checks are done, the security audit is done where money, access or personal data is involved, and the help article is drafted.
- `pilot → on`: at least one pilot organization has used it for real work for 2 weeks, there are no open serious bugs, the help article is published and support knows the feature.

**Release and plan are separate questions.** A released feature reaches a customer only if their plan, an add-on, or an override from Vento (a trial or a negotiated deal) includes it. See section 5 and the flag spec.

---

## 5. Plans

**Owner decides: names, contents, limits and prices.** Below is the recommended starting point. Plans are data, so they can change without a deploy. Existing customers keep their plan version until moved.

**Principles**
- **The Release 1 job is in every plan.** Even the smallest developer gets the full thread: land to receipts to ledger, the buyer portal and the executive view. Plans differ mainly by **size**, and by the **later releases** that larger developers need.
- **Security and compliance are never upsold:** two-step, passkeys, approvals, audit, KYC and AML, permits, UBO and SCUML records, and data protection tools are in every plan.
- **Things that cost Vento money per use** (WhatsApp messages, e-KYC checks, AI) sit in higher plans or add-ons.

| | **Starter** | **Growth** | **Enterprise** |
|---|---|---|---|
| For | 1 project, a small team | 2–5 projects, a sales team and realtors | Several SPVs, in-house finance team, board reporting |
| Active projects | 1 | 5 | Unlimited |
| Active entities | 2 (holding company + 1 SPV) | 6 | Unlimited |
| People (members and pending invitations) | 10 | 40 | Unlimited |
| **Release 1** | Land & title, Projects (lean), Sales, Finance (receipts, Paystack, statement import, ledger), KYC and AML, letters and receipts, Buyer portal, Reports, Excel import, email reminders | Everything in Starter, plus **WhatsApp** reminders and receipts | Everything in Growth |
| R2 | – | Leads, commissions, realtor portal, estate layout, unit transfer, construction-linked plans, two-way WhatsApp, SMS, daily digest, e-KYC | Everything in Growth |
| R3 | Permits | Costs (BoQ, budget), procurement, full site diary, vendor bills with WHT, permits | Everything in Growth |
| R4 | UBO and SCUML records | UBO and SCUML records | Period close and statements, intercompany, construction finance, IFRS 15, tax summary, contracts and e-signature, board pack |
| R5 | – | Estates, HR & payroll | Everything in Growth |
| AI | Add-on | Add-on | Add-on (a monthly allowance may be included later) |

**Pilots** are placed on **Enterprise at no charge** for the pilot, recorded with a reason, and move to the plan they choose at MVP exit (criterion 9 in section 6).

---

## 6. MVP exit criteria

Release 1 goes to everyone (`pilot → on`) when **all** of these hold:

1. **A real month.** At least one pilot developer (target: two) has run one project's sales and collections in Vento for **30 consecutive days**, with no parallel Excel schedule after week two.
2. **Import is exact.** Every imported subscription's paid-to-date and balance matches the customer's own spreadsheet to the kobo, and finance has signed this off in writing.
3. **Every receipt is in Vento.** 100% of receipts for the pilot project in the month are recorded in Vento. Each SPV's trial balance balances, and each bank account's balance in Vento matches the bank statement at month end.
4. **Collections are fast.** At least **95% of Paystack payments** are allocated with no manual step. Recording a bank-transfer receipt takes a median of **under 20 seconds** (product analytics or a timed session).
5. **Buyers use the portal.** At least **30% of the pilot project's buyers** sign in to the portal at least once, and the developer reports fewer "what's my balance?" calls.
6. **The MD uses it.** The MD opens the executive home at least weekly, unprompted.
7. **Nothing broke trust.** No data shown across organizations, no unbalanced ledger, no lost or duplicated receipts, no buyer message with a wrong amount. Backups restore in a drill.
8. **Ready for the next customer.** The security audit has passed. The privacy notice lists every processor (Postmark, Paystack, the WhatsApp provider) with a data processing agreement. Every Release 1 journey is `built` with a passing e2e test.
9. **They'd pay.** The pilot developer signs a paid agreement, or a letter of intent at the list price.

---

## 7. What this changes elsewhere
- `docs/PRODUCT.md`: a pointer to this plan (added).
- `docs/DOMAIN.md`: terms *Release*, *Release stage*, *Release group*, *Feature flag*, *Plan*, *Entitlement*, *Limit*, *Add-on*, *Override*, *Trial*, *Early access*, *Vento super-admin* (added).
- Brick 3a's `nav.ts` `status` field gives way to flags (see the flag spec). Building flags right after 3a means every module procedure written from brick 4 onwards declares its flag from the start.
- Specs for the *reduced* Release 1 journeys must say what is left for later, and update the journey files to match.

---

## 8. Owner's decisions (with recommended defaults)

| # | Decision | Recommended default |
|---|---|---|
| 8.1 | Release 1 scope as in section 2 | **Yes.** Land & title, projects (lean), sales, finance, KYC/AML, documents (fixed layouts), buyer portal and reports. No leads, commissions, estates, payroll or AI. |
| 8.2 | Leads pipeline, realtor portal and commissions | **Release 2.** Commissions stay in Excel during the pilot. |
| 8.3 | Passkeys (3d) | **Build them in 3d as planned, but ship at `pilot`**, and switch them on for everyone after the security audit and a month of use. |
| 8.4 | WhatsApp in Release 1 | **One-way templates (reminder, overdue, receipt), behind a flag.** Choose the provider during Release 1 (open question in DOMAIN.md). If the templates aren't approved by launch, Release 1 goes out email-only. |
| 8.5 | Letter of offer and allocation letter | **Built-in layout plus per-project terms text** the developer's lawyer can paste in. The template editor comes in R4. |
| 8.6 | Receipts paid into another entity's bank account (e.g. holding company collects for the SPV) | **Include** an automatic intercompany pair for that one case in Release 1, so each SPV's ledger stays right. The full intercompany screen comes in R4. *(Ask the pilots: if they all collect into the SPV's own account, drop it.)* |
| 8.7 | Release order R2 → R5 | **As in section 3**, with per-organization pilot overrides for a developer who needs one later module early. |
| 8.8 | Automatic reminders | **Off for each organization until finance confirms the imported balances**, then switched on from the setup checklist. |
| 8.9 | Imported subscriptions without KYC | **Import as `active`**, with KYC "not collected" on the KYC list for follow-up. New sales still require KYC before `active`. |
| 8.10 | Number of pilots | **Two or three developers, one project each**, at least one with diaspora buyers. |
| 8.11 | Exit criteria | **As in section 6.** The thresholds (95%, 20 s, 30%) are starting points to agree with you. |
| 8.12 | When to build feature flags and plans | **As the next slice after 3a** (before 3b), while no module procedures exist yet. |
| 8.13 | Plans | **Three tiers (Starter, Growth, Enterprise) as in section 5**, differing mainly by size and later releases. Every plan has the full Release 1 job. Names, limits and prices are yours. |
| 8.14 | What members see for features outside their plan | **Hidden from everyone's navigation.** Owners alone see a calm "Available on Growth" at the point of need (⌘K search, limit messages) with **Talk to Vento**. |
| 8.15 | Security and compliance in every plan | **Yes**, never upsold. |
| 8.16 | Pilots' plan | **Enterprise at no charge during the pilot**, then the plan they choose. |
