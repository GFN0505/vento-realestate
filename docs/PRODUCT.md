# Product

## Vision
The operating system for Nigerian real estate developers. One place to run a development business end to end — from acquiring land and perfecting title, through building, selling off-plan on instalments, collecting payments at home and from the diaspora, handing over and managing the estate — with the speed and polish of the best software in the world and none of the clutter of legacy ERPs.

## Principles
1. **Just what's required.** All ten modules ship, but each one only does what a developer genuinely needs. Every option and setting must earn its place; prefer a great default.
2. **Effortless.** A new user finishes their first real task in under 5 minutes without training. Common tasks take ≤ 3 clicks or one ⌘K command.
3. **Fast everywhere.** Every interaction feels instant (< 100 ms), pages load in < 1 s, including on a mid-range Android phone on a site with a weak connection.
4. **Money and title you can trust.** Every naira (or dollar) is traceable from instalment to receipt to ledger. Every title document is versioned. Nothing is silently changed or deleted.
5. **Built for Nigeria.** C of O and governor's consent, off-plan instalments, diaspora buyers, SPVs, PAYE/pension/NHF, WHT/VAT, WhatsApp reminders — first-class, not workarounds.
6. **Connected, not siloed.** One record flows through every module: a land parcel becomes a project, the project's units are sold, buyer payments hit the ledger, the handed-over estate bills service charges, and the executive dashboard sees all of it.

## Who it's for
Real estate **developers** in Nigeria, from growing firms (1–3 projects) to large developers running several SPVs.

| Persona | Main jobs |
|---|---|
| **MD / CEO** | Revenue booked vs received, project progress, delinquency, cash position, board packs |
| **Land & legal officer** | Land acquisition, title perfection, survey, encumbrances, permits, contracts |
| **Project manager / site engineer** | Phases and milestones, BoQ and budget, contractors, materials, site diary from a phone |
| **Sales manager / agent** | Leads, diaspora pipeline, off-plan subscriptions, payment plans, allocation, commissions |
| **Finance & accounts** | Receipts, instalment collection, ledger, FX, SPVs, drawdowns, tax, payroll |
| **HR / admin** | Staff and site workers, payroll, leave, professional body renewals |
| **Facility manager** | Service charge, utilities, maintenance after handover |
| **Buyer / subscriber** (portal) | See payments, statement, allocation, construction progress, documents |

## The ten modules (all in v1)

### 1. Land & Title
Land parcels from acquisition to perfected title: C of O, R of O, governor's consent, deed of assignment, excision gazette, survey plan. Document vault with versions, title stage tracker, encumbrance register (mortgage, caveat, court order) with alerts, surveyor assignments.
*Lean choices:* registry status is tracked manually with document evidence; live registry integrations are added per state only where a reliable official API exists.

### 2. Projects & Construction
Projects on a parcel, phases (substructure → superstructure → finishing → handover) and milestones, BoQ with local material rates, budget vs actual per phase, contractors with COREN/CORBON registration details, material requests and purchase orders with vendor scorecards, site diary with geo-tagged photos.
*Lean choices:* delays are logged in the site diary with a reason (weather, materials, funding, approvals) instead of a weather-API feed.

### 3. Sales & CRM
Units and inventory per project, leads and pipeline (with diaspora segment: UK, US, Canada, UAE), off-plan subscriptions with instalment payment plans, delinquency alerts, document workflow (Letter of Offer → Contract of Sale → Allocation Letter → Deed of Assignment), agent and broker commissions, automated WhatsApp/SMS/email reminders.

### 4. Finance
General ledger with multi-currency (NGN base; USD, GBP, EUR), FX rates (CBN official rate, with a flag for the market rate used), multiple legal entities (holding company and project SPVs) with intercompany entries, budgets vs actual per project phase, construction-finance facilities and drawdowns, IFRS 15 revenue recognition for off-plan (over time / percentage of completion where criteria are met), tax (VAT, WHT, CIT, PAYE remittance), receipts and payment collection (Paystack, bank transfer).

### 5. Facility & Estate Management (post-handover)
Estates and handed-over units, residents, service charge billing, utilities (borehole, generators, solar) and their costs, maintenance requests from residents, preventive maintenance schedules, common-area asset register.

### 6. HR & Payroll
Employees across entities, site workers and artisans (daily rates), Nigerian payroll (PAYE, pension under PenCom, NHF, NSITF, ITF), payslips, leave, appraisals, professional body memberships and renewal alerts (NSE/COREN, NIQS, ARCON, NIESV, etc.).

### 7. Regulatory & Compliance
Permit tracker per project (planning permit, building permit, EIA, DPC, CCCN) with expiry alerts, estate agency board compliance where applicable, AML: customer due diligence on buyers, large-cash and unusual-transaction flags, SCUML registration and NFIU reporting records, UBO register per entity.

### 8. Documents & Contracts
Contract lifecycle for buyers, contractors, vendors and JV partners: templates, generation from records, approval workflow, versions, e-signature, renewal and expiry tracking, NDA and JV agreement register.

### 9. Buyer Portal
Buyers sign in to see their units, payment plan and history, statement of account, receipts, allocation, construction progress photos, request and download documents, pay online, and refer friends.

### 10. Executive Analytics
Real-time dashboards (revenue booked vs received, collections, delinquency rate, project completion %, budget variance, cash by entity), project IRR/ROI, land bank valuation tracker (valuer, date, value history), board-ready report packs (PDF).

## How modules connect
```
Land parcel ──▶ Project ──▶ Units ──▶ Subscription + Payment plan ──▶ Receipts ──▶ Ledger (per SPV)
     │             │                         │                            │
 Title docs    BoQ, budget,            Documents & contracts         Revenue recognition,
 permits       contractors,            Buyer portal                  tax, dashboards
               site diary                     │
                    └────────── Handover ─────┴──▶ Estate (service charge, maintenance)
```

## Platform capabilities (core, always on)
These make the product trustworthy and easy to adopt. They cost little to run, so they're part of every plan.

| Capability | What it does |
|---|---|
| **Maker-checker approvals** | A second person approves sensitive actions: reversing a receipt, approving payroll, releasing a refund, changing a price list, approving a purchase order, posting a manual journal. Rules per organization (which actions, which roles, amount thresholds). |
| **Audit trail** | Every create, change, approval and export is recorded (who, what, before/after, when) and shown as a timeline on the record. Append-only. |
| **Security** | Two-factor login, role templates (Site engineer, Sales agent, Finance officer…), active sessions list, sign-out everywhere. |
| **e-KYC** | Verify a buyer's NIN or passport through a verification provider in one click; the result is stored, the raw ID number is encrypted and masked. |
| **Excel import** | Guided import for units, buyers, subscriptions, payments to date, parcels, staff: upload, map columns, preview, fix errors, import. Every import can be undone. |
| **Interactive estate layout** | Upload the site plan, draw or place plots/units on it, and use it to see status (available, reserved, sold, fully paid, overdue), open a unit, or start a sale. |
| **Two-way WhatsApp** | Reminders, receipts and statements sent on WhatsApp; buyer replies land in the contact's timeline for the sales team. |
| **Role homes and daily digest** | Each role lands on its own priorities. Optional morning digest by WhatsApp or email (e.g. the MD's cash, sales and risks summary). |
| **Realtor portal** | External agents and brokers register leads (duplicates flagged for a person to decide ownership), see the status of their deals and their commission. |
| **In-app help and product analytics** | Contextual help, a help centre, product analytics and session replay (personal data masked) to find where users struggle, and feature flags for gradual rollouts. |

## AI (optional add-on)
AI is an **add-on**, off by default. Each organization switches on the features it wants, and every feature has a manual path that works the same without AI. Nothing in the product depends on AI being on.

| Feature | What it does | People stay in control |
|---|---|---|
| **Document reading** | Extracts fields from scanned title documents, survey plans, deeds, bank tellers, receipts and contractor invoices, fills in the record and flags mismatches | Fields are shown as suggestions to accept or edit |
| **Payment matching** | Suggests the buyer and instalment for each line of an imported bank statement, with a confidence level | Finance confirms each match (or bulk-confirms high-confidence ones) |
| **Ask Vento** | Plain-English questions in ⌘K ("UK buyers in Lekki Gardens 60+ days overdue") answered with a table of real records and actions | Read-only; actions still go through normal permissions and approvals |
| **Drafting** | Drafts letters, reminders, board-pack commentary, and reviews contracts against templates to flag risky clauses | Always a draft for a person to edit and send |
| **Voice and photo site diary** | Turns a voice note (English or Pidgin) and photos into a structured diary entry | The engineer reviews before saving |
| **Predictions** | Buyer default-risk score, 13-week cash-flow forecast, budget overrun early warning | Shown as signals with the reasons behind them, never automatic actions |
| **Anomaly flags** | Duplicate payments, vendor prices far above recorded material rates, AML-style payment patterns | Go to a review queue |

### Cost control
- **Off by default, per feature.** Organization owners turn each AI feature on or off in Settings → AI.
- **Monthly budget per organization** with a usage meter, alerts at 50%, 80% and 100%, and a hard stop at the limit (the feature falls back to the manual path with a clear message). Plans can include an AI allowance with paid top-ups.
- **Cheapest model that passes testing, per feature.** Each feature is tested on the cheapest model first (usually Claude Haiku) and only moves to a more capable model if quality falls short. Configured centrally, plus prompt caching and batch processing for bulk work (e.g. overnight matching and forecasts).
- **Usage is metered per request** (feature, model, tokens, cost) so pricing can be set from real numbers.

### AI guardrails
- AI suggests; people approve anything involving money, title, legal documents or personal data.
- Every AI suggestion and decision is logged in the audit trail, with the feature and model used.
- Buyer and staff data is never used to train models. Personal data sent to AI is limited to what the task needs (NDPA 2023).
- AI answers only from the organization's own records and permissions; a user never sees data through AI they couldn't see in the app.

## Next phase (after v1)
Open-banking bank feeds (Mono, Okra) for automatic matching, exports to external accounting software, contractor portal, WhatsApp sales assistant with hand-off to a person.

## Deliberately not building
A general chatbot that can't act, virtual-reality tours, gamification.

## Quality bar
- Benchmarks for craft: Linear, Stripe Dashboard, Mercury, Ramp.
- Keyboard-first for office users (⌘K, shortcuts); touch-first and offline-tolerant for site users.
- Every screen has designed loading, empty, error and success states.
- WCAG 2.2 AA in light and dark mode.
- Tax rates, statutory deductions and regulatory rules are **configuration with effective dates**, never hard-coded, and must be checked against current law (Nigeria's 2025 tax reform acts take effect from 2026).
