# Role homes: research and direction

*Research, 26 Nov 2026. It guides the role-home work at the end of the module build. Nothing here is a spec yet: each module brick adds its own numbers, queue items and panels (release plan §8), and the final Home pass turns this into `docs/specs/role-homes.md`.*

**In one sentence:** every person opens Vento in the morning and, within five seconds, knows whether their part of the business is on track and what they should do first.

---

## 1. What we already have
The boards in `docs/design/claude-design/` set a good base. Every role home uses the same layout: a greeting line with a count ("6 things need you today"), four number tiles, **Your queue** ("Sorted by due date, then impact") with one action per row and tick-off with Undo, and two job panels.

| Board | Four numbers | Two panels |
|---|---|---|
| ExecutiveHome (MD) | Revenue booked vs cash received, Collections this month (vs target), Delinquency rate (vs target, with an ageing bar), Project completion | Cash by entity, Budget variance. AI on: 13-week cash forecast |
| HomeLand (Ngozi) | Titles in progress, Active encumbrances, Contracts for legal review, Deeds to prepare | Title pipeline, Encumbrances |
| HomePM (Kunle) | Project % (vs plan), On site today, POs in approval, Open issues | Milestones next 30 days, Material use vs BoQ |
| HomeSales (Grace) | My sales this quarter (vs target), Follow-ups due today, Units I can sell, Commission earned | My pipeline, Hot units |
| HomeFinance (Aisha) | Cash (all entities), Bank lines to match, Receipts held for AML review, Month-end close progress | Month-end close checklist, Bank accounts |
| HomeHR (Kemi) | This month's payroll status, Leave requests, Memberships, On leave today | Site workforce today, Statutory remittances |
| HomeFM (Ope) | Open requests, Diesel in tank, Service charge collected, Planned maintenance due | Estates, Power this week |

The phone boards get this right too. On the MD's phone there's one main number and then the queue. The PM's phone puts **Diary entry · Request materials · Report issue** first and shows "Synced". The sales phone shows buyers' local times ("Manchester 13:04").

**Gaps this research fixes:**
1. **Most numbers have nothing to compare against.** Only the MD's collections, delinquency and Grace's sales show a target. "3 active encumbrances" or "11 open requests" can't tell you whether today is better or worse than usual. Few and NN/g both say a number on a dashboard needs a comparison to mean anything (Sources 1, 2).
2. **No rule yet for "impact"** in "due date, then impact", so every brick would invent its own.
3. **No home for Viewer or Admin**, and no split between a sales agent and a sales manager or between a PM and a site engineer.
4. **The location filter isn't designed.** "All entities" with a per-entity breakdown appears only on the MD's cash panel.
5. **"Project completion 64%"** averages five projects. It hides the two that are behind plan, and the MD would act on those.
6. **"Revenue booked"** isn't a term in DOMAIN.md, and under IFRS 15 "revenue" means something else (see §8).

---

## 2. What the research says
**Dashboards are for monitoring, not analysis.** Stephen Few defines a dashboard as the most important information needed for a job, on a single screen, monitored at a glance. He later separated it from exploratory "analytical displays" (Sources 1, 3). NN/g agrees: dashboards are "focused on a single task" and built for "quick consumption, not exploration" (Source 2). **So Home is not a reports page.** Drilling down belongs in the modules and Reports.

**People can hold about four things in mind at once.** Cowan's review of short-term memory puts the limit at about four chunks, not Miller's 7±2 (Source 4). That supports the owner's "four numbers" rule: a fifth tile costs attention.

**Length and position read fastest.** NN/g ranks length and 2D position as the most accurate signals the eye picks up before reading. Area and angle are weak, and colour shows category but not size. NN/g advises against pies and donuts "most of the time", and against gauges, treemaps and 3D (Source 2). Few designed the **bullet graph** to replace gauges: one bar, one target marker and two to five shaded bands (Source 5). Tufte's **sparklines** ("data-intense, design-simple, word-sized graphics") give a trend without a chart (Source 6).

**Big numbers draw the eye.** Tableau's eye-tracking work found people scan dashboards in an F-pattern and are pulled more strongly than expected to big numbers (Source 7). Use one big number per tile and put the most important tile top-left.

**Show numbers that lead to action.** Eric Ries's test is that a number is actionable when its cause and effect are clear (Source 8). "Total leads" is vanity. "Leads not answered within an hour" is actionable.

**Too many alerts get ignored.** Clinicians ignore 49–96% of safety alerts. Accepting an alert fell about 30% with each repeat. People ignore security warnings more when interrupted mid-task (Source 9). The design rules this produces: group repeats, never nag, and only flag something when there's an action to take.

**The best products open on "what needs me", ranked.**
- **Linear** *My issues → Focus* orders your work in fixed sections: urgent, then work with a deadline (SLA), blockers, current cycle, the rest. Empty sections don't show (Source 10).
- **Brex** ranks its inbox "by priority according to urgency" and splits personal tasks from company tasks. Its admin home is "understand at a glance, act in a click" (Source 11).
- **Ramp's** homepage replaced its inbox: a task feed of approvals and missing items, short FYIs, and collapsible sections that stay collapsed (Source 12).
- **Procore** *My Open Items* shows only items from tools you can access, colours overdue items red, and filters by due date (Source 13).
- **Autodesk Construction Cloud** added a cross-project *My Home* for the same reason (Source 14).
- **HubSpot's** sales workspace and **Attio's** Home both open on tasks due today, overdue and due tomorrow (Sources 15, 16).
- **Salesforce Home** pairs a quarterly performance chart against an editable goal with an "Assistant" list of today's to-dos (Source 17).
- **BambooHR's** "Needs your attention" widget stays hidden until something needs you. *Who's out* sits next to it (Source 18).
- **Xero's** new homepage shows "key business performance metrics and jobs to be done at a glance", with six months of cash in and cash out (Source 19).
- **Yardi Breeze** lets property managers text a tenant straight from the delinquency list (Source 20).
- **Buildertrend's** phone home has a **+** for common jobs and per-user card order. Its summary works for one job or all jobs (Source 21).
- **Notion** and **Stripe** let people add and arrange widgets. Stripe offers over 35 (Sources 22, 23). This is where Vento should *not* follow: see §6.

**Who uses Home in Nigeria, and on what.** About 88% of Nigerian smartphone users are on Android (Source 24). Data prices rose by up to 50% in January 2025 (Source 25). WhatsApp is the main messaging app. Diaspora buyers are a large share of off-plan sales (one estimate says 70% of real-estate investment) and trust is their main worry (Source 26). So the site phone home must be light and work offline, and the morning digest belongs on WhatsApp. Diaspora money, foreign currencies and buyers' local times belong on the Sales and Finance homes.

---

## 3. Principles for Vento's role homes
1. **Home answers two questions in five seconds:** *Am I on track?* (four numbers) and *What do I do first?* (queue). Anything that answers neither goes elsewhere.
2. **Four numbers, each with a comparison.** Every number shows a target, the same period last time, or both, and gets colour only when it's off. A number with no comparison isn't a number for Home.
3. **Actionable, not impressive.** Every number links to the list behind it, and its tile says what's driving it ("₦437m overdue · 42 buyers"). No totals that only grow (all-time leads, all-time receipts).
4. **One queue, one ranking rule, one action per row.** Rows are grouped by when they're due (overdue → today → this week → later), then ordered by impact (§4). The row's button does the job or opens exactly where it's done.
5. **Group, don't nag.** Repeats collapse into one row ("6 buyers 1–30 days overdue · ₦38m · Send reminders"). An item leaves the queue when the underlying work is done; nobody has to clear it. Alerts appear only where there is an action.
6. **The location filter is the only filter.** All entities shows the group with a per-entity breakdown on every number. One entity shows that entity only. Project and site narrow it further for site roles. The header always says which scope you're looking at.
7. **Same layout, distinct character.** Every home uses the same frame. Each role's signature panel and hero line make it unmistakably that job's home. Colour means status, never decoration.
8. **Phone-first for the field, keyboard-first for the office.** Site and sales homes open on actions and work offline from the last copy. Office homes are fully keyboard-driven (`j`/`k` to move through the queue, Enter to act, ⌘K for everything).
9. **Calm when all is well.** Show a designed "You're clear for today" state that names the next thing coming up. No zero-value tiles shouting, no confetti.
10. **Home, the digest and notifications say the same thing.** The morning digest is Home's top lines in six. A notification is a queue row that couldn't wait. The same data and words are used in all three places.

---

## 4. The shared layout (every role)
**Hero band** (navy, as built in brick 3a): greeting · role · location scope · date, and one plain sentence summarising the day, generated from the data with fixed rules (no AI needed). For example: "6 things need you. Collections are 8% ahead of target; delinquency is above your 5% limit." On the right, one primary action for the role (MD: *Open board pack*; Sales: *New subscription*; PM: *Diary entry*).

**Four number tiles.**
- Each tile has: a label, the number in display type, and one comparison line (vs target and/or vs last period, with an arrow and the change). A small visual sits under it, chosen by the rules in §5.
- With **All entities** selected, a thin per-entity breakdown bar sits in the tile. On hover or tap it lists each entity's figure.
- The whole tile is a link to the list behind it.

**Your queue** (left, wider) and **two panels** (right). The phone shows the same blocks stacked in that order.

**Queue ranking rule (one rule, every module):**
1. **When it's due:** Overdue → Today → This week → Later. Items with no date (e.g. "3 deeds to prepare") use their age.
2. **Impact, within each group:**
   - **Blockers first:** safety issues, legal blocks (court orders, expired permits or registrations), and items that stop a sale or a payment.
   - **Then money at stake in ₦**, converting foreign amounts at the day's rate.
   - **Then age.**
3. **Caps:** show 7 rows, then "Show all 23". Similar items are grouped into one row.

**Every queue item carries the same fields.** Each module supplies them; Home only renders.
- Title: the object and what to do.
- Detail: why it matters, with the amount, age or place.
- Due date, and the impact fields (blocker yes/no, ₦ at stake).
- Entity and project, so the location filter works.
- **One action** with its label.
- The permission needed to act.
- A key that groups repeats.

The item disappears when its record changes, and ticking is only for items that are plain to-dos. Money movements and approvals keep their confirm dialogs (DESIGN-NOTES). Everything else completes with Undo.

**States.**
- **Loading:** skeleton in the final layout.
- **Nothing to do:** "You're clear for today. Next: Parkview building permit renewal, 12 Jan."
- **Module not set up yet:** the tile shows the first step ("Add your first parcel"), replacing the brick 3a placeholder.
- **Offline:** "Showing 07:12 · will update when you're back online".
- **Error:** retry only the block that failed; the rest of Home stays.

---

## 5. Per role
*Module tags show which brick adds each item: **Land**, **Proj** (projects and site), **Sales**, **Fin**, **Cmp** (compliance), **Doc**, **HR**, **Est** (estates), **Rep** (reports), **Plat** (approvals, audit, digest).*

### MD / CEO (owner role; Admin sees this too, see decision D1)
**The morning job:** "Is cash coming in as planned, is anything about to hurt us (a delinquent buyer, a stalled site, a court order, a permit), and what's waiting for my signature?" The MD reads the digest at 07:00 and opens Home to approve.

| # | Number | Comparison | From |
|---|---|---|---|
| 1 | **Cash received vs sales booked** (hero tile, with a progress bar) | % collected; diaspora balances still due in £/$ with the ₦ equivalent | Sales, Fin |
| 2 | **Collections this month** | Bullet bar vs monthly target; sparkline of the last 12 months; vs the same month last year | Fin |
| 3 | **Delinquency rate** | vs the limit (e.g. ≤ 5%), arrow vs last month; ageing bar (1–30 / 31–60 / 61–90 / 90+) | Sales |
| 4 | **Projects on plan** ("3 of 5"), replacing the blended 64% | Each project's % complete vs plan as a small bar with a plan marker; late ones get colour | Proj |

**Queue** (the board's "Needs attention"):
- Approvals waiting for the MD (PO, payroll, refund, price below floor): **Approve**. *Plat* + source module.
- Overdue buyers over a threshold or 60+ days: **Send reminder**. *Sales*
- Delayed milestones holding stage payments back ("₦486m waiting"): **Open project**. *Proj*
- Expiring permits: **Renew**. *Cmp*
- Active court orders blocking units: **Review**. *Land*
- Budget lines over budget: **Open project**. *Proj/Fin*

**Panels:**
1. **Cash by entity.** Sorted horizontal bars. With one entity selected, it becomes *Cash by bank account*. *Fin*
2. **Budget variance by project.** Bars with a budget marker; overruns in rose. *Proj/Fin*

With AI on, the 13-week forecast takes the place of panel 2's slot above the fold, and the MD can swap it back.

**Location filter:** All entities shows group totals and a per-entity bar in each tile. One entity hides the "by entity" splits and shows only that SPV's projects and approvals.

**Phone** (tabs Home · Approvals · Projects · Reports):
- Hero: cash received vs booked.
- Then the three other numbers as a compact 3-up row.
- Then the queue, with approvals first. Panels sit below the fold.

**Worth flagging:**
- A covenant breach on a construction facility.
- Cash at any entity below its next 4 weeks of committed payments. With AI off this uses committed payables, not a forecast.
- A buyer refund to a different account (AML flag).
- A collection-rate drop of more than X points vs last month.

**Leave out:** lead counts, site diary detail, individual receipts, the ledger, and charts that need reading.

### Land & legal officer
**The morning job:** "Which title steps are moving, which are stuck with a government office, is any encumbrance blocking sales, and what documents are waiting on me?" Mostly desktop, out at the Lands Bureau some days.

| # | Number | Comparison | From |
|---|---|---|---|
| 1 | **Units blocked by encumbrances** (a number with consequences, unlike "3 active encumbrances") | ₦ value of the blocked units; vs last month | Land, Sales |
| 2 | **Titles in progress** | Average days at the current stage vs the organization's typical; how many are stalled over 90 days | Land |
| 3 | **Documents waiting on legal** (contracts to review, deeds to prepare) | The oldest one's age | Doc |
| 4 | **Permits and registrations expiring in 60 days** | Count, with the soonest date | Cmp |

**Queue:**
- Government queries to answer: **Open parcel**.
- Court dates within 30 days: **Open order**.
- Fully paid buyers who need a deed of assignment, grouped by project: **Prepare deeds**.
- Contracts to review: **Review**.
- Missing UBO documents: **Open UBO**.
- Excision and consent chases: **Track**.

Modules: *Land, Doc, Cmp.*

**Panels:**
1. **Title pipeline.** The stage stepper (survey plan → excision gazette → C of O → governor's consent → registered), showing how many parcels sit at each stage and for how long. *Land*
2. **Encumbrances.** Each with its type, the units it blocks and the next date. *Land*

**Location filter:** parcels belong to an entity, so the same filter applies. Parcels not yet assigned to an entity appear under All entities only, labelled "Not assigned".

**Phone:** cards plus a sticky **Upload document** action. Photograph a document at the registry and attach it to a parcel in two taps.

**Worth flagging:**
- A new encumbrance, or a caveat lodged.
- Any title stage with no movement in 90 days.
- A developer or estate-agent registration renewal (e.g. LASRERA in Lagos) coming due. Make this a configurable item per state and confirm current requirements with legal (Source 27).

**Leave out:** sales pipeline, cash, valuation history (that's Reports).

### Project manager and site engineer (same role; the engineer is limited to one project)
**The morning job:**
- **Site engineer, 7am on site, on a phone with weak signal:** "Log yesterday and today, who's on site, what materials are coming, what's blocked."
- **PM:** "Are my projects on plan, what must I certify or approve, what's late?"

| # | Number | Comparison | From |
|---|---|---|---|
| 1 | **Progress vs plan** for the selected project | Bar with a plan marker and today's position; "12 days behind" | Proj |
| 2 | **On site today** | vs yesterday and vs the planned crew | Proj (diary), HR |
| 3 | **Budget used vs value of work done** | Bullet bar; overrun in rose | Proj, Fin |
| 4 | **Open issues** (safety first) | vs last week | Proj |

**Queue:**
- Diary not yet logged today: **Log diary**.
- Entries waiting to sync: **Open diary**.
- Valuations to certify: **Certify**.
- Deliveries due today: **Receive goods**.
- Material requests to approve: **Approve**.
- Milestone evidence for stage payments or LASBCA inspections: **Upload**.
- Work held by a court order: **View parcel**.

Modules: *Proj, Cmp, Land.*

**Panels:**
1. **Next 30 days of milestones**, each showing which buyer stage payments it triggers. This is the link between construction and cash. *Proj, Sales*
2. **Materials:** used vs BoQ, plus deliveries due this week. *Proj*

**Location filter:** adds the **project/site** filter. An engineer limited to one project sees it automatically, with no switcher. A PM with several projects defaults to the last project they used and can pick All my projects.

**Phone (the most important phone home):**
- Opens on three big actions: **Diary entry · Request materials · Report issue** (the board's design is right).
- Then the progress bar and today's queue. Sync status is always visible.
- **Budget:** the home works fully from the cache when offline. Payload under 30 KB and no chart library on first paint; bars are plain HTML and CSS.

**Worth flagging:**
- A diary not logged by 10:00.
- A delay reason logged three days running.
- A material price far above the recorded rate.
- A contractor's COREN/CORBON registration expiring.
- A permit or inspection stage due.

**Leave out:** buyer names and balances, cash, payroll amounts.

### Sales (agent and sales manager share the role; see decision D2)
**The morning job:**
- **Agent:** "Who must I call now, and where are they in the world? Which holds expire today? What can I sell?"
- **Manager:** "Are we on target this quarter, which deals are stuck, and who's falling behind on payments?"

| # | Number | Comparison | From |
|---|---|---|---|
| 1 | **Sales this quarter** (mine, or the team's for managers) | Bullet bar vs quarterly target; vs the same point last quarter | Sales |
| 2 | **Follow-ups due today** (overdue in rose) | How many are diaspora, with their local times | Sales |
| 3 | **Overdue buyers** (mine) | ₦ overdue; vs last month | Sales |
| 4 | **Units available to sell** | By project; sold this month vs last | Sales |

Commission becomes one line under the pipeline panel ("₦9.6m earned this quarter · ₦2.1m waiting for receipts to clear"). It matters to agents, but it isn't what they act on in the morning.

**Queue:**
- Reservation holds ending within 48 h: **Open**.
- New leads inside the reply target: **Reply**.
- Calls scheduled today, showing the buyer's local time: **Call** (tap to call or WhatsApp).
- Overdue instalments on my buyers: **Send reminder** (WhatsApp, with Undo).
- Site visits to confirm: **Confirm**.
- KYC still missing before a subscription can go active: **Collect KYC**.

Modules: *Sales, Cmp, Plat.*

**Panels:**
1. **My pipeline** as horizontal stage bars with ₦ values. No funnel graphic. *Sales*
2. **Units to sell:** a mini availability strip per block, using the unit-grid colours (violet outline = available), with "Share price list on WhatsApp". *Sales*

**Location filter:** projects sit under entities. Diaspora currencies show beside ₦.

**Phone:** the queue first, then a sticky **New subscription** button. Each row shows the buyer's local time and has call/WhatsApp buttons.

**Worth flagging:**
- A hold expiring.
- A lead with no reply after the target time.
- A buyer's payment that bounced or was reversed.
- A price list changing on a date.

**Leave out:** other agents' leads (privacy), ledger and cash, construction detail beyond "milestone reached" (which is useful talk with buyers).

### Finance
**The morning job:** "What came in overnight and is it matched? What's held for review? What do I have to pay or file this week? Where are we on month-end close?" Desktop, keyboard-heavy.

| # | Number | Comparison | From |
|---|---|---|---|
| 1 | **Cash, all entities** | Sparkline of 13 weeks; ₦ held in GBP/USD; vs last month | Fin |
| 2 | **Receipts to match** (unmatched bank lines) | Count and ₦; the oldest one's age | Fin |
| 3 | **Held for AML review** | Count and ₦; the oldest one's age | Cmp |
| 4 | **Month-end close** ("6 of 10") | Days to the close deadline | Fin |

**Queue:**
- Unmatched credits: **Match**.
- Receipts and refunds awaiting approval: **Approve**. The person who recorded it never sees it as an approver.
- FX rate edits to review: **Review**.
- Tax payments due (WHT, VAT, PAYE), with dates from statutory rules: **Pay**.
- Drawdown requests: **Prepare**.
- Intercompany entries to post: **Post**.

Modules: *Fin, Cmp, Plat.*

**Panels:**
1. **Month-end close checklist.** *Fin*
2. **Bank accounts:** balance and last statement import per account, with stale accounts (no import in 3 days) in amber. *Fin*

**Location filter:** the most important role for it. All entities shows a per-entity split on every tile. One entity scopes everything, including tax due.

**Phone:** read and approve only: cash, held items, approvals. Matching stays desktop.

**Worth flagging:**
- A possible duplicate receipt.
- A third-party payer.
- A cash receipt over the threshold.
- A receipt booked at a rate off CBN.
- A tax payment due in 7 days.
- A covenant ratio near its limit.

Thresholds are statutory and organization rules, never constants.

**Leave out:** lead and site detail, charts of revenue mix.

### HR / admin
**The morning job:** "Is payroll on track for the pay date? Who's off today? Whose professional membership has lapsed? Are site attendance figures in?"

| # | Number | Comparison | From |
|---|---|---|---|
| 1 | **This month's payroll** (status and days to pay date) | Gross vs last month, with the change explained | HR |
| 2 | **Off today** (staff on leave plus site workers absent) | vs the usual | HR, Proj |
| 3 | **Requests waiting** (leave, changes) | The oldest one's age | HR |
| 4 | **Memberships lapsed or due in 60 days** | Count, with the soonest date | HR |

**Queue:**
- Payroll exceptions (missing PenCom PIN, cash-paid workers): **Fix**.
- Leave decisions: **Review**.
- Expired memberships (COREN, NIQS, ARCON, ICAN): **Renew**.
- Statutory payments due (PAYE by state, pension, NHF, NSITF, ITF): **Pay**. Dates come from statutory rules.
- New starters missing documents: **Request**.

**Panels:**
1. **Site workforce today** from the diaries. *Proj, HR*
2. **Statutory payments** for the month: due, paid, overdue. *HR, Fin*

**Location filter:** employees belong to entities, so the payroll tile follows it. Site workers also follow the project.

**Phone:** approve leave, and see who's out.

**Leave out:** salary details on the phone's lock-screen view (hide amounts until tapped), sales, cash.

### Facility manager
**The morning job:** "What broke, which jobs are past their target time, do we have power and water, and who hasn't paid their service charge?" Often walking the estate.

| # | Number | Comparison | From |
|---|---|---|---|
| 1 | **Open maintenance requests** | How many are past their target time (in rose); vs last week | Est |
| 2 | **Power: days of diesel left** | vs the reorder level | Est |
| 3 | **Service charge collected this quarter** | Bullet bar vs billed; vs last quarter | Est |
| 4 | **Planned maintenance due this week** | How many are overdue | Est |

**Queue:**
- Safety and security first (gate, fire, lifts): **Update** or **Escalate**.
- Requests past their target time: **Escalate**.
- Diesel below the reorder level: **Order**.
- Planned maintenance due: **Book**.
- Service charge arrears: **Send reminders**, grouped.

**Panels:**
1. **Estates:** each estate's occupancy, open requests and arrears. *Est*
2. **Power this week:** generator hours, diesel, solar, grid, as a daily bar. *Est*

**Location filter:** estates belong to entities. The FM is often limited to one estate, so a project/estate filter applies as it does for PMs.

**Phone:** the queue with photo updates. **Log request** sits in the sticky bar.

**Leave out:** construction, sales, ledger.

### Viewer (board member, investor, external accountant)
**The job:** "How is the business doing?", read-only, weekly rather than daily. Viewers have no work to do, so the queue becomes **This week**: a short read-only list of milestones reached, units sold, permits renewed and big receipts, from modules the viewer can see.
- Numbers: the MD's four, limited to what the viewer can see.
- Panels: Projects on plan, and Collections trend.
- No buttons, buyer names or balances. *Rep, Plat.*

---

## 6. Personalisation that stays simple
The research points in two directions. Stripe, Notion, Buildertrend and Autodesk offer widget libraries and drag-and-drop (Sources 21–23, 14). Linear and Brex win with one strong default ranking (Sources 10, 11). Each Vento role already has a home built for it, so a widget library would add choices without making the default better. **Offer three things only:**
1. **Pin a number.** Swap one of the four tiles for another from that role's short list of 6 to 8 options; e.g. a Sales manager pins "Holds expiring". The choice is remembered per person.
2. **Collapse a panel.** It stays collapsed on that device, as in Ramp (Source 12). No reordering in v1: the order *is* the design.
3. **Morning digest settings.** Time and channel (WhatsApp or email) and "Pause for a week", as on the MorningDigest board. Every role can turn on a digest. Its content is the role's hero sentence, four numbers and the top three queue rows, so it fits six lines on WhatsApp. "Skips weekends and public holidays unless something is overdue."

**Don't offer:** widget libraries, custom charts on Home, date-range pickers (Home is always "now"; history lives in Reports), themes per role, a separate "dashboard builder", or queue snooze. Snoozing hides risk; grouping fixes the noise instead.

---

## 7. Visual direction
**Overall feel.** Stripe-calm and Mercury-premium. The navy hero band (built in 3a) carries the brand. Below it, white cards on the light slate background, subtle borders, generous spacing, Geist for headings, Inter tabular figures for every number. One display-size number per tile, never two.

**What makes each home distinct.** It isn't colour, which is reserved for status. It's three things:
- **The hero sentence**, written for the role.
- **The primary action** in the hero.
- **One signature visual** in the first panel:

| Role | Signature visual |
|---|---|
| MD | Cash received vs booked bar with a diaspora split |
| Land | Title stage stepper |
| PM | Progress bar with plan marker and a "today" line |
| Sales | Unit availability strip |
| Finance | Entity cash bars |
| HR | Payroll run stepper (draft → reviewed → approved → paid) |
| FM | Daily power bars |

Each empty state gets its own small line illustration in brand violet.

**Which chart for which number** (NN/g and Few, Sources 2, 5):

| Kind of number | Chart | Example |
|---|---|---|
| Actual vs target | **Bullet bar** (bar, target tick, faint bands) | Collections vs target; sales vs quarter target; service charge collected vs billed |
| Trend over time | **Sparkline** under the number, last point marked; no axes | Cash 13 weeks; collections 12 months |
| Progress vs plan | Bar with a **plan marker** and **today line**; colour only when late | Project %; Gantt-lite in panels |
| Composition or ageing | One **stacked bar**, one hue from amber to rose, labelled | Delinquency ageing |
| Compare entities or projects | **Horizontal bars, sorted** | Cash by entity; budget variance |
| Pipeline | Horizontal stage bars with ₦ | Sales pipeline |
| Counts per day | Small **vertical bars** | Power this week; workers on site |
| Forecast (AI) | Range band with a midpoint dot | 13-week cash |

**Never on Home:** pies, donuts, gauges, dials, 3D, dual axes, maps used to show numbers, or legends you have to look up.

**Colour.** Neutral data is brand violet and slate. Amber means "watch" and rose means "act", and they appear *only* when a number crosses its line. Emerald appears only when a target is met (sparingly, so it keeps its meaning). A badge is always a dot plus a word. Arrows carry direction **and** good/bad: a falling delinquency rate is a green ↓.

**Numbers and money.**
- Compact forms in tiles, with the full figure in the tooltip and the list behind.
- Foreign amounts show the ₦ equivalent beside them.
- Relative dates for urgency ("in 9 days", "31 h") and absolute dates in detail ("12 Jan 2027").

**Motion.**
- Numbers appear with a 150 ms fade, not a count-up: count-ups delay reading and suggest live data that isn't.
- A ticked row collapses in 200 ms with the Undo toast.
- Changing the location filter crossfades the content without moving the layout.
- Nothing loops. Everything respects reduced motion.

**Dark mode.** The same rules apply. Status tints use the dark tokens, and the navy hero becomes the near-black surface with a brand-violet hairline.

**Speed.**
- Home loads from one request per block, each streamed in as it arrives, with skeletons in the final shape.
- The last copy is cached on the device so a phone opens instantly and updates in place.
- Recharts loads only for the larger panels on desktop. Tiles use CSS and inline SVG.

---

## 8. What each module brick adds
| Brick | Numbers | Queue items | Panels |
|---|---|---|---|
| Land & title | Units blocked; titles in progress | Government queries, court dates, title chases | Title pipeline; Encumbrances |
| Projects & site | Progress vs plan; on site; budget vs work done; issues; MD's projects on plan | Diary due/sync, certify, receive, approve requests, milestone evidence | Milestones and stage payments; Materials; Site workforce (HR) |
| Sales | Sales this quarter; follow-ups; overdue buyers; units to sell; MD's delinquency and booked | Holds, leads, calls, reminders, KYC | Pipeline; Units to sell |
| Finance | Cash; to match; close; collections | Match, approve, FX, tax payments, drawdowns, intercompany | Cash by entity; Bank accounts; Close; Budget variance |
| Compliance | AML held; permits expiring | AML review, permit renewals, UBO gaps | – |
| Documents | Documents waiting on legal | Reviews, deeds to prepare | – |
| HR & payroll | Payroll; off today; requests; memberships | Exceptions, leave, renewals, statutory payments | Statutory payments |
| Estates | Requests; diesel; service charge; planned maintenance | Safety, past target time, diesel, maintenance, arrears | Estates; Power |
| Approvals (brick 4) | – | Every approval, routed to the checker | – |
| Reports | Viewer's home; digest | – | Collections trend |

**Each brick's definition of done:** its queue items follow the item fields in §4, its numbers have a comparison, and it adds the role's empty and filtered states.

**Proposed DOMAIN.md additions** (for the owner to approve with the Home spec):
- **Sales booked:** total contract value of active and completed subscriptions in a period. It isn't revenue; revenue follows IFRS 15. Replaces "Revenue booked" on the MD home.
- **Collection rate:** cash received ÷ instalments due in a period.
- **Delinquency rate:** overdue amount ÷ amount due to date, on subscriptions past the grace period, by ageing bucket.
- **Queue item:** something on a role's Home that needs a person. Each has a due date, an impact (blocker, ₦ at stake), one action, and its entity/project. It disappears when the underlying record is resolved.
- **Location filter:** the entity (and for site roles, project or estate) scope that Home and lists follow. All entities means the group view.

---

## 9. Decisions for the owner
| # | Question | Recommendation |
|---|---|---|
| D1 | What does **Admin** land on? | The MD home, with setup items in the queue (pending invitations, a failed import, an integration that stopped). No separate admin home. |
| D2 | **Sales agent vs sales manager** share the `sales` role. How does the manager see the team? | One Sales home showing "mine" by default. People whose access covers everyone's leads get a two-option **Mine / Team** switch on that page only. The alternative is a built-in "Sales manager" role. |
| D3 | Replace the MD's **"Project completion 64%"** with **"Projects on plan: 3 of 5"**? | Yes. The average hides the late projects. Log it in CHANGES.md when built. |
| D4 | Rename **"Revenue booked"** to **"Sales booked"** and add the five DOMAIN terms in §8? | Yes. "Revenue" must mean IFRS 15 revenue everywhere, or Finance and the MD will see two different "revenue" numbers. |
| D5 | **Compact money format:** the boards use `₦428m`, `₦5.38bn`; the ux-writing skill says `₦2.5M`. | Use the boards' `m` / `bn`. It's how Nigerian business press and boards write it. Update the skill. |
| D6 | **Targets.** Comparisons need targets: monthly collections, quarterly sales per agent or team, the delinquency limit, the diesel reorder level. Who sets them, and where? | One small **Targets** settings page (owner and finance). Until a target is set, the tile compares with last period and shows "Set a target". |
| D7 | **Personalisation** limited to pinning one number and collapsing panels. No widgets, reordering or snooze. | Yes (§6). Revisit only if real users ask repeatedly. |
| D8 | **Digest for every role?** | Yes, opt-in, with the same six-line format. On by default only for the MD (owner). |

New screens these decisions would add, to go into SCREENS.md with the Home spec: Viewer home, Pin a number sheet, Targets settings, and the role digests (WhatsApp and email).

---

## 10. Claude Design prompt (paste when it's time)
> Design the role homes for Vento Real Estate, an ERP for Nigerian property developers, in one pass: MD (owner), Land & legal, Project manager, Site engineer (same role, one project, phone-first), Sales (agent's "Mine" and manager's "Team" view), Finance, HR, Facility manager, Viewer. Desktop 1440, mobile 390, light and dark. Use the existing tokens (navy sidebar and hero band, brand violet #7677FB, action #5B5CE0, status emerald/amber/blue/rose/slate, Geist headings, Inter tabular numbers, 10px radius, borders over shadows) and the existing boards ExecutiveHome, HomeLand, HomePM, HomeSales, HomeFinance, HomeHR, HomeFM as the starting point.
> Same layout on every home: a navy hero with greeting, role, location scope ("All entities" or one SPV, plus project for site roles), date, one plain summary sentence and the role's primary action; four number tiles, each with one big number, one comparison line (vs target and/or last period) and one small visual (bullet bar for vs-target, sparkline for trend, bar with plan marker for progress, one stacked bar for ageing); "Your queue" sorted overdue → today → this week, then by impact (blockers first, then ₦ at stake), max 7 rows, repeats grouped into one row, one action button per row; two job panels, the first being the role's signature visual. No pies, donuts or gauges. Colour only for status; amber and rose only when a number is off its line.
> Use the numbers, queues and panels in docs/research/role-homes.md §5. Show for each home: All entities (with per-entity breakdown in each tile on hover) and one entity selected; the "You're clear for today. Next: …" state; first-run (module not set up) tiles; offline ("Showing 07:12"). Phone: site engineer opens on three big actions (Diary entry, Request materials, Report issue) with sync status; MD on one hero number then approvals; sales rows show the buyer's local time with call and WhatsApp buttons. Also: the "Pin a number" picker (one sheet), and the morning digest for each role in six WhatsApp lines. Make each home feel distinct through its hero sentence, primary action and signature visual, and make it beautiful: premium, calm, Stripe/Linear/Mercury quality.

---

## Sources
1. Stephen Few's dashboard definition, quoted in Tableau, ["What the heck is a dashboard anyway"](https://www.tableau.com/sites/default/files/webinars/what_the_heck_is_a_dashboard_anyways.pdf); [UXmatters review of *Information Dashboard Design*](https://www.uxmatters.com/mt/archives/2007/04/book-review-information-dashboard-design.php)
2. NN/g, [Dashboards: Making Charts and Graphs Easier to Understand](https://www.nngroup.com/articles/dashboards-preattentive/)
3. Stephen Few, [Why Most Dashboards Fail](https://blogs.ischool.berkeley.edu/i247s13/files/2013/02/WhyMostDashboardsFail.pdf)
4. Cowan, [The magical number 4 in short-term memory](https://pubmed.ncbi.nlm.nih.gov/11515286/), *Behavioral and Brain Sciences*, 2001
5. Stephen Few, [Bullet Graph Design Specification](https://www.telerik.com/docs/default-source/blogs-docs/bullet_graph_design_spec-pdf); [Wikipedia: Bullet graph](https://en.wikipedia.org/wiki/Bullet_graph)
6. Edward Tufte, [Sparkline theory and practice](https://www.edwardtufte.com/notebook/sparkline-theory-and-practice-edward-tufte/)
7. Tableau, [Eye-tracking study of dashboards (whitepaper)](https://tableau.com/sites/default/files/whitepapers/core_eye-tracking_whitepaper_update.pdf) (summary via search; the PDF blocked direct fetch)
8. NN/g, [Vanity metrics](https://www.nngroup.com/articles/vanity-metrics/); Mountain Goat Software, [Are vanity metrics really all that bad?](https://www.mountaingoatsoftware.com/agile/are-vanity-metrics-really-all-that-bad)
9. KFF Health News, ['Alert fatigue' spreads through medicine](https://kffhealthnews.org/news/screen-flashes-and-pop-up-reminders-alert-fatigue-spreads-through-medicine); Atlassian, [Alert fatigue](https://www.atlassian.com/incident-management/on-call/alert-fatigue)
10. Linear, [My issues](https://linear.app/docs/my-issues); [Priority inbox changelog](https://linear.app/changelog/2026-09-03-priority-inbox)
11. Brex, [New task overview page](https://www.brex.com/product-announcements/new-task-overview-page); [How the Home page works](https://www.brex.com/support/home-page); [Spring 2025 release](https://www.brex.com/spring-2025)
12. Ramp, [Introduction to Homepage](https://support.ramp.com/introduction-to-homepage)
13. Procore, [View My Open Items in the project's Home page](https://support.procore.com/products/online/user-guide/project-level/home-project/tutorials/view-my-open-items-from-the-project-overview-in-the-projects-home-page)
14. Autodesk, [My Home in Autodesk Construction Cloud](https://www.autodesk.com/blogs/construction/acc-personalized-experience/); [About Project Home](https://help.autodesk.com/cloudhelp/ENU/Build-Hub/files/Project_Home.html)
15. HubSpot, [Use the sales workspace](https://knowledge.hubspot.com/prospecting/use-the-sales-workspace)
16. Attio, [Navigating your workspace](https://attio.com/help/getting-started/navigating-your-workspace)
17. Salesforce Trailhead, [Lightning Experience Home](https://trailhead.salesforce.com/lex_salesforce_tour/lex_salesforce_tour_home)
18. BambooHR, [Needs Your Attention widget](https://www.bamboohr.com/product-updates/needs-your-attention-widget-beta); [Insights dashboard and homepage redesign](https://www.bamboohr.com/product-updates/introducing-insights-dashboard-and-a-redesigned-home)
19. Xero, [New Xero homepage](https://blog.xero.com/product-updates/new-xero-homepage/)
20. Yardi Breeze, [Recent changes](https://www.yardibreeze.com/?p=322103); [Features (G2)](https://g2.com/products/yardi-breeze/features)
21. Buildertrend, [Introduction to mobile navigation](https://buildertrend.com/help-article/introduction-to-mobile-navigation/); [Summary page redesign](https://buildertrend.com/blog/summary-page-redesign/)
22. Notion, [Home and My tasks](https://www.notion.com/help/home-and-my-tasks)
23. Stripe, [Dashboard home page charts](https://support.stripe.com/questions/customize-your-dashboard-home-page-charts-for-better-business-insights)
24. KPMG and Orange, [Nigeria Smartphone Study 2026](https://assets.kpmg.com/content/dam/kpmgsites/ng/pdf/2026/09/Nigeria%20Smartphone%20Study%20-%20Orange%20Group%20and%20KPMG.pdf.coredownload.inline.pdf); ThisDay, [Nigeria rapidly becoming a mobile-first economy](https://www.thisdaylive.com/2026/09/27/kpmg-report-nigeria-rapidly-becoming-a-mobile-first-economy/)
25. TechCabal, [Nigeria loses 1 million internet users in six months](https://techcabal.com/2025/08/06/nigeria-loses-one-million-internet-users/)
26. The Guardian Nigeria, [Diasporan investors drive growth, expose fault lines](https://guardian.ng/property/diasporan-investors-drive-growth-expose-fault-lines-in-real-estate-sector/)
27. Nairametrics, [Lagos declares real estate practice without LASRERA registration illegal](https://nairametrics.com/2025/06/28/lagos-govt-declares-real-estate-practice-without-lasrera-registration-illegal/); Mondaq, [Analysis of the LASRERA Law 2022](https://www.mondaq.com/nigeria/real-estate/1197052/analysis-of-the-lagos-state-real-estate-regulatory-authority-law-2022)
28. NN/g, [Response time](https://www.nngroup.com/topic/response-time/) (0.1 s / 1 s / 10 s limits behind "feels instant")
