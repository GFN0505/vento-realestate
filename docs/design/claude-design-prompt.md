# Claude Design prompt

Paste everything below the line into Claude Design. It's long on purpose: one consistent system across ten modules. If Claude Design works better in steps, paste the whole prompt first, then ask for the screens one module at a time.

---

Design **Vento**, an ERP for Nigerian real estate developers. Web app: desktop-first for office teams, mobile-first for site and sales teams, responsive throughout. It runs the whole development business: land and title → projects and construction → off-plan sales on instalments → finance across project companies → handover and estate management, plus HR and payroll, compliance, contracts, a buyer portal and executive analytics.

The bar is world-class: the craft and calm of Linear, Stripe Dashboard, Mercury and Ramp. Ten modules, but **no clutter**: every element must help someone decide or act.

## Users
- **MD / CEO:** cash and sales at a glance, project progress, delinquency, board packs.
- **Land & legal officer:** parcels, title documents, encumbrances, permits, contracts.
- **Project manager / site engineer (often on a phone on site):** phases, milestones, BoQ and budget, contractors, materials, daily site diary with photos.
- **Sales team:** leads (local and diaspora), unit availability, subscriptions, payment plans, offer and allocation letters, commissions.
- **Finance:** receipts, instalment collection, multi-currency, project SPVs, bank drawdowns, tax, payroll.
- **HR, facility manager**, and **buyers** in their own portal.

## Nigerian context the design must handle naturally
- Title stages: survey plan → C of O / R of O → governor's consent → deed of assignment; excision gazette for family land; encumbrances (caveat, court order, mortgage).
- Off-plan sales on **instalment plans** (6, 12, 24 months or construction-linked), initial deposit, delinquency, allocation after a % is paid.
- **Diaspora buyers** in the UK, US, Canada and UAE pay in USD, GBP or EUR, so show both the original amount and the ₦ equivalent with the FX rate and its source (CBN official or other).
- Each project usually sits in its own company (SPV), so the entity switcher matters to finance.
- Payroll: PAYE, pension (PenCom), NHF, NSITF; site workers on daily rates.
- WhatsApp is the main channel for reminders; bank transfer is the main payment method, plus Paystack for cards.
- Locations: area, LGA, state (e.g. Ibeju-Lekki, Lagos). Phone numbers: +234 and foreign.
- Sites have weak connectivity: the site diary must work offline and sync later.

## Brand and visual direction
- Primary **#7677FB** (violet). Deep navy sidebar. Light neutral background, white cards, full dark mode.
- Font: Poppins, or propose a better sans for dense financial tables, with reasoning. Tabular numbers for all money.
- Soft 10px radius, subtle borders over heavy shadows, generous whitespace, restrained colour: colour means status or action, never decoration.
- Status colours: emerald = done/paid/titled, amber = due soon/pending/partial, blue = in progress/scheduled, rose = overdue/encumbered/expired, slate = draft/inactive.
- Construction and estate photos used with purpose (progress, site diary, unit gallery), never as filler.

## Global patterns
- **App shell:** sidebar grouped by module with icons (collapsible); top bar with ⌘K search, entity/SPV switcher, project switcher where relevant, notifications and user menu. Mobile: bottom navigation for the 4 most-used destinations for that role, plus "More".
- **⌘K command palette:** jump to any parcel, project, unit, buyer or document; run actions ("Record receipt", "New subscription", "Add site diary entry").
- **Lists:** one consistent table (search, filter pills, saved views, column picker, bulk actions, pagination), with card view on mobile.
- **Detail pages:** header with key facts and status, then tabs; right-side activity timeline.
- **Forms:** side sheets for edits, stepped sheets for flows; smart defaults; inline validation.
- **Feedback:** toasts with undo for reversible actions; confirmation only for money, approvals and deletions, and the button states the exact effect.
- **States:** every screen has skeleton loading, a helpful empty state with one action, error with retry, and offline status.

## Screens (desktop 1440px and mobile 390px, light and dark)
1. **Executive home:** revenue booked vs received (₦ and FX), collections this month, delinquency rate and ageing, project completion %, cash by entity, budget variance, a "Needs attention" list (overdue buyers, expiring permits, active encumbrances, delayed milestones) with one-click actions.
2. **Land & Title:** parcel list and a map view; parcel detail with title stage tracker (horizontal stepper with dates and documents), document vault with versions, encumbrance alerts banner, surveys and valuations history.
3. **Projects:** project list with progress; project detail with phase timeline (Gantt-lite), milestones, budget vs actual by phase, BoQ table with material rates, contractors, purchase orders, and a site diary feed of geo-tagged photos.
4. **Site diary (mobile):** fast entry in under 30 seconds: work done, workers count, delays with reason, photos (camera), offline queue indicator.
5. **Sales:** unit availability grid per project (colour by status, filter by type and price) and lead pipeline board with diaspora segment tags.
6. **New subscription flow (stepped sheet):** pick unit → buyer (search or add, KYC fields) → price and currency → payment plan builder (outright / instalments / construction-linked, with a live instalment schedule preview) → documents to generate (letter of offer) → review. The total, deposit and first due date are always visible.
7. **Subscription detail:** payment plan timeline (paid, due, overdue), receipts, documents issued (offer, contract, allocation, deed), commission, buyer communication history, and actions (record receipt, send reminder, issue allocation).
8. **Record receipt dialog:** amount and currency, FX rate (pre-filled CBN rate, editable with reason), method, reference, allocation to instalments (oldest due first, editable), AML flag notice for large cash; then a beautiful receipt (PDF and WhatsApp-ready).
9. **Finance:** entity switcher; ledger and journal entries, intercompany entries, bank and FX overview, construction facilities and drawdowns, revenue recognition by project, tax summary (VAT, WHT, CIT, PAYE).
10. **Estate management:** estates, service charge billing and arrears, utilities and diesel log, maintenance requests board, preventive schedules, common-area assets.
11. **HR & Payroll:** employees and site workers, payroll run review (gross → statutory deductions → net, by entity) with clear totals before approval, payslip, leave, professional membership renewals.
12. **Compliance:** permit tracker per project with expiry timeline, KYC status, AML review queue, UBO register.
13. **Documents & contracts:** template library, contract detail with approval steps and e-signature status, expiring contracts.
14. **Buyer portal (mobile-first, separate light brand surface):** my units, payment plan and progress ring, pay now, statement and receipts download, construction progress photos, documents, refer a friend.
15. **Board pack:** a printable, beautiful multi-page report (summary, sales, collections, projects, cash, risks).
16. **Onboarding:** create organization → add first entity → add first project and units in under 3 minutes, with a setup checklist on home.

## Deliverables
- The screens above, consistent with each other.
- A design system page: colour tokens (light and dark), type scale, spacing, buttons, inputs, money input with currency, FX rate field, date picker, status badges, table, unit grid cell, stepper (title stages), timeline (payment plan), stat card, empty state, toast, command palette, sidebar and mobile nav.
- Short notes on any UX decision that isn't obvious.

Keep it lean: if an element doesn't help a user decide or act, leave it out.
