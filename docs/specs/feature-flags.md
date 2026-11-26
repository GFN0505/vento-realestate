# Feature flags and plan entitlements

- **Status:** approved (26 Nov 2026); see [Owner's decisions](#owners-decisions-26-nov-2026)
- **Module:** Platform
- **Journeys:** J-ADM-01 and J-ADM-02 (new), J-ONB-05 (step 2 and watch-for changed), J-AI-04 (an add-on appears only once it's available to the organization)
- **Screens:** see [Screens this spec touches](#screens-this-spec-touches)
- **Decisions:** builds on app-shell owner's decisions 12 (modules a role can't view are never shown) and 2 (the "one switch per module"); a decision record for the flag and plan store is the architect's to write
- **Release plan:** [docs/release-plan.md](../release-plan.md) (releases, and the starting plans)

## Problem
Vento will build all ten modules, release them a few at a time, and sell them in plans at different prices. Today, whether a module appears is a hard-coded `status` in the web app's `nav.ts`, so a module is shown to every organization or to none, the API serves it either way, and releasing anything takes a deploy. Vento staff need to try a finished feature on production, give it to two pilot developers, release it to everyone, and switch it off within seconds if it breaks. They also need to give each organization what its plan pays for, run a 30-day trial of a bigger plan, and honour a negotiated deal. A customer must never see or call a feature that isn't released to them, and members should never meet features their organization hasn't bought.

## Two questions, kept apart
| | **Release flag** | **Plan entitlement** |
|---|---|---|
| Question | Is this feature ready, and released to this organization? | Does this organization's plan (or an add-on) include it? |
| Changes when | Engineering and product readiness | Commercial: plan, add-on, trial, deal |
| Values | Stage `off` · `internal` · `pilot` · `on`, plus release overrides | Plan contents and limits, add-ons, entitlement overrides (with expiry) |
| Who changes it | Vento super-admin | Vento super-admin now; the billing screen later sets plan and add-ons from payments |

**A feature is available to an organization only when it's released to them *and* they're entitled to it.** Both checks run on the server and drive navigation. Neither check alone can turn a feature on.

## Persona and job
| Who | Job | How often |
|---|---|---|
| **Vento super-admin** (Vento staff) | Release features stage by stage; switch a broken one off; put an organization on a plan; start a trial; record a negotiated deal | Releases every few weeks; plan changes weekly once selling |
| **Organization owner** | Know what their plan includes and what's near a limit; switch on AI add-ons in Settings → AI | Occasionally |
| **Every other member** | Nothing. They only see what their organization has and their role allows, and never see flags, plans or upgrade prompts. | Always |

## Success looks like
- Releasing a feature to a pilot, putting an organization on a plan, or starting a trial takes **one command and under a minute**, with no deploy.
- A kill switch takes effect for every user within **30 seconds**.
- Checking availability adds **no database query** to a request and **under 1 ms** to it. Availability arrives in the `account.me` response the shell already waits for, so there is **no flash** of items that shouldn't show.
- **Zero** procedures of an unavailable feature run. A test walks every procedure to enforce it.
- **No plan limit can be exceeded** by a create call, including two at once (a concurrency test).
- Every flag, plan, add-on and override change is in the audit trail with who, what, before → after, reason and when.

## Concepts

### Release (is it ready?)
**Release stage** per flag, set once for all organizations:

| Stage | Released to |
|---|---|
| `off` | Nobody. **Kill switch:** beats every override and every plan. |
| `internal` | Organizations in the `internal` release group (Vento's demo and test organizations) |
| `pilot` | `internal` and `pilot` organizations |
| `on` | Everyone |

**Release group** of an organization: `standard` (default) · `pilot` · `internal`.

### Plans (is it paid for?)
- **Plan:** a named tier (names, contents and prices are the owner's to decide; the release plan recommends Starter, Growth and Enterprise). It is data, not code. Each plan lists the **features it includes** (catalog keys) and its **limits**.
- **Limits** in v1: `projects` (active projects), `entities` (active entities), `members` (active members plus pending invitations), `ai_budget` (monthly AI budget in NGN, when AI is included). Archived records don't count. A missing limit means unlimited.
- **Plan versions:** changing what a plan includes or its limits publishes a new version. Organizations stay on their version (their deal doesn't change under them) until Vento moves them. This keeps an organization's entitlements stable for the length of its contract.
- **Add-on:** something bought on top of a plan that includes more features, raises limits, or both. AI is the first add-on: it includes the `ai.*` features and sets `ai_budget`. Others can follow later (e.g. "Extra project" raises `projects` by 1). An organization can hold several add-ons.
- **Core features** are in every plan and never priced separately: accounts, two-step and passkeys, the app shell, team, roles and entities settings, approvals, audit log, notifications, compliance (`compliance`, `compliance.permits`, `compliance.ubo_scuml`: KYC and AML are a legal duty), and the data protection tools. **Vento doesn't charge extra for security or compliance.** Core features that are still being built keep a release flag; core only means every plan includes them.

### Overrides
An **override** is a per-organization exception, always with a reason, optionally with an **expiry date**:
- **Release override** (`on` / `off` for one flag): give one developer a feature before its release, or hold one back from it.
- **Entitlement override:** grant or remove one feature, or set one limit, regardless of the plan. Use it for a **trial** (expiry required, e.g. Growth features for 30 days) or a **negotiated deal** (e.g. 8 projects on Growth, no expiry). On expiry it simply stops applying; nothing is deleted.

### Availability rule
For an organization and a feature:
1. **Released?** If the stage is `off`, the answer is no. Otherwise, a live release override decides. Otherwise, it's yes if the stage reaches the organization's release group.
2. **Entitled?** Core features always are. `internal` organizations are entitled to everything, with no limits, so Vento staff can test. Otherwise, a live entitlement override decides. Otherwise, it's yes if the organization's plan version **or** any active add-on includes the feature.
3. **Prerequisites:** every prerequisite flag must also be available (e.g. `buyer_portal` needs `sales` and `finance`).
4. **Available** = released **and** entitled **and** prerequisites.

**Limit rule:** limit = live entitlement override for that limit, else plan limit + add-on increases, else unlimited.

**AI add-on features** need one more step (`ai-features` skill): available **and** switched on by the owner in Settings → AI **and** under budget.

## Initial catalog
The "Release" column is the [release plan](../release-plan.md)'s recommendation; the owner releases each flag when they choose, once it is *releasable* (built, tested, reviewed, documented, and reviewed hands-on by the owner). The catalog is code in `packages/shared` (key, kind, prerequisites, one-line description, label used in prompts). Stages, release groups, plans, add-ons and overrides are data. A new flag starts at `internal` when its first code merges. A flag needs a reason to exist: a module, a part released or sold on its own, or an add-on. Options and small screens don't get flags.

| Key | Kind | Release | Prerequisites |
|---|---|---|---|
| `land` | module | R1 | – |
| `projects` | module | R1 | – |
| `sales` | module | R1 | `projects` |
| `finance` | module | R1 | – |
| `compliance` | module | R1 (KYC and AML are core inside it) | – |
| `documents` | module | R1 | – |
| `analytics` | module (Reports) | R1 | – |
| `buyer_portal` | module | R1 | `sales`, `finance` |
| `platform.import` | feature | R1 | – |
| `finance.paystack`, `finance.bank_import` | feature | R1 | `finance` |
| `platform.whatsapp` | feature | R1 (if the provider is ready) | – |
| `platform.passkeys` | feature (core once released) | R1 at `pilot` | – |
| `sales.leads`, `sales.commissions`, `sales.site_plan`, `sales.transfer`, `sales.construction_linked_plans` | feature | R2 | `sales` |
| `realtor_portal` | module | R2 | `sales.leads`, `sales.commissions` |
| `platform.sms`, `platform.digest`, `platform.ekyc` | feature | R2 | – |
| `projects.costs` (BoQ, material rates, budget vs actual), `projects.procurement` (contractors, vendors, material requests, POs, goods received), `projects.site_diary` (full diary with offline) | feature | R1 | `projects` |
| `finance.vendor_bills` (with WHT), `compliance.permits` | feature | R1 | their module |
| `finance.close`, `finance.facilities`, `finance.revenue_recognition`, `finance.intercompany`, `finance.tax` | feature | R3 | `finance` |
| `documents.contracts`, `compliance.ubo_scuml`, `analytics.board_pack` | feature | R3 | their module |
| `facility`, `hr` | module | R4 | – |
| `ai.document_extraction`, `ai.payment_matching`, `ai.ask`, `ai.drafting`, `ai.site_diary_voice`, `ai.predictions`, `ai.anomaly_detection` | add_on feature | Per feature, after its eval | e.g. `ai.payment_matching` needs `finance.bank_import` |

## User flow
**Release to a pilot developer (J-ADM-01): 1 command**
1. `pnpm flags show sales`: stage, who has it, overrides, prerequisites, which plans include it.
2. `pnpm flags group "Lekki Partners Ltd" pilot --reason "Pilot agreement signed" --by ada@vento.ng` (once per pilot).
3. `pnpm flags stage sales pilot --reason "Release 1 pilot" --by ada@vento.ng`. It shows what changes ("Sales will be available to 3 organizations: 1 internal, 2 pilot") and asks to confirm.
4. Within 30 seconds, Lekki Partners' members who can view Sales see it with an "Early access" tag.

**Release to everyone:** `pnpm flags stage sales on …`. The command warns if no plan includes the feature ("Sales is in no plan, so standard organizations still won't have it"). **Kill switch:** `pnpm flags stage sales off …`.

**Put an organization on a plan, start a trial, record a deal (J-ADM-02): 1 command each**
- `pnpm plans assign "Lekki Partners Ltd" growth --reason "Signed annual Growth" --by …` (latest version of Growth).
- `pnpm plans trial "Lekki Partners Ltd" enterprise --days 30 --reason "Board pack trial" --by …`: entitlement overrides for every Enterprise feature and limit not already included, expiring together.
- `pnpm plans override "Lekki Partners Ltd" limit projects 8 --reason "Negotiated: 8 projects" --by …` or `… feature sales.commissions on --until 2027-01-31 …`, or `… clear`.
- `pnpm plans addon "Lekki Partners Ltd" ai --budget 150000 --reason … --by …`.
- `pnpm plans publish growth --from plans/growth.json --reason … --by …` publishes a new version of a plan. Existing organizations stay on their version until `assign` moves them.

**Owner hits a limit (2 clicks to the answer):** Olumide adds a second project on Starter → "Your Starter plan includes 1 active project. Archive a project or talk to Vento about Growth." → **Talk to Vento** (opens the support email or WhatsApp with the organization and plan filled in). The self-serve billing screen replaces this link later.

**Owner looks for a feature outside the plan:** ⌘K "commissions" → a quiet row "Commissions · Available on Growth" → **Talk to Vento**.

**Owner turns on an AI add-on (J-AI-04, 3 clicks):** Settings → AI → switch on **Document reading**. Settings → AI appears only when at least one AI feature is available to the organization.

**Later:** the super-admin console (R2) and the *Billing and plan* screen do the same through screens, writing to the same tables and audit trail. The commands stay as a fallback.

## Acceptance criteria

### Availability rule
- **Given** every combination of stage × release group × release override × plan includes it or not × add-on × entitlement override (none, live, expired) × prerequisites, **then** availability follows the rule. This is a table-driven unit test covering every row.
- **Given** stage `off`, **then** the feature is unavailable even with release and entitlement overrides `on` (kill switch).
- **Given** a feature at stage `on` that the Starter plan doesn't include, **then** a Starter organization doesn't have it, and a Starter organization with a live entitlement override does.
- **Given** an `internal` organization, **then** it's entitled to every feature with no limits, but still only to released stages (`internal` and up).
- **Given** an entitlement override that expired at midnight (Africa/Lagos), **then** it stops applying from that moment without any job running. Data created during the trial stays and is hidden if the feature is no longer available.
- **Given** a flag, plan or limit key the catalog doesn't know, **then** the command refuses and suggests the closest key.

### Server enforcement
- **Given** a non-core procedure, **then** it declares its feature key, and the middleware checks availability after sign-in and organization but **before** the permission check. A test walks every procedure and fails if one doesn't declare a key.
- **Given** a feature unavailable to the caller's organization (not released **or** not entitled), **when** any of its procedures is called, even by an owner, **then** it answers **NOT_FOUND** with the standard message, reads and writes nothing, and writes no audit event.
  - *Why NOT_FOUND:* to this organization the feature doesn't exist (decision 12). It's one rule and one path in the web app. It also doesn't turn API errors into sales messages. The upgrade hint for owners comes from `account.me`, not from errors.
- **Given** a create that would exceed a limit (a project, an entity, a member or invitation), **then** it's refused with **FORBIDDEN**, reason `plan_limit`, naming the limit and what's included. It's checked inside the same transaction as the create, so two creates at once can't both pass the last slot.
- **Given** a plan change or expiry leaves an organization over a limit (e.g. 3 projects on a 1-project plan), **then** nothing is archived or deleted. Existing records work as before, and only new creates are refused.
- **Given** an unavailable feature, **then** its background jobs skip the organization, and none of its reminders, digests, notifications or emails go out. Messages and jobs check at send time.
- **Given** money arriving through `finance.paystack` for an organization that has lost the feature (rollback, downgrade or expiry), **then** the webhook is still verified and the payment recorded. Availability hides features; it never drops inbound money or data.
- **Given** an audit log entry from a feature that's no longer available, **then** it stays visible (history is never hidden), and its link opens *404*.

### Navigation and what people see
- **Given** a feature unavailable to the organization, **then** it appears nowhere for any member: sidebar, mobile tabs, More sheet, ⌘K actions, shortcuts, Home cards, setup checklist, settings sections, permissions matrix, approval rule settings, Preview as role.
- **Given** a direct link to an unavailable module, **then** *404* appears (not *403*), even for roles that could view it.
- **Given** an available module, **then** the 3a rule applies: shown only if the role can view it, otherwise *403*.
- **Given** a feature that's **released to the organization but not in its plan**, **then**:
  - **non-owners** never see it or any hint of it (same reasoning as decision 12: they can't act on it, so it's noise);
  - **owners** don't see it in the sidebar, tabs or Home either (a locked menu is permanent clutter and feels like advertising), but **at the point of need** they get one calm line with **Talk to Vento**: in ⌘K when they search for it ("Commissions · Available on Growth"), and in the limit message when they hit a limit;
  - while an owner previews another role, the hints follow the previewed role (none for non-owners).
  - *Why this and not hidden for everyone:* owners are the only people who can buy, and they need to discover what exists at the moment they look for it. *Why not a visible locked entry:* the sidebar is the daily workspace; principle "nothing extra".
- **Given** an internal organization and a module that isn't built yet (route still the placeholder), **then** it shows the "Soon" tag and the *Coming soon* page, as in 3a. Customers can't reach this state.
- **Given** a module or feature available through stage `internal` or `pilot`, or a release override, rather than stage `on`, **then** its sidebar entry carries an "Early access" tag. A trial (entitlement override with expiry) shows no tag. Instead, the owner gets a trial line on Home in the last 7 days, and an email 7 days and 1 day before it ends.
- **Given** a limit message, **then** an owner sees what to do and **Talk to Vento**; any other member sees who to ask (names from the server, as on *403*), never the plan's name or price.

### No flash, caching and speed
- **Given** sign-in or a reload, **then** `account.me` returns the organization's **available** features (key and `early_access` true or false), the limits with current use, and for owners only, upgrade hints (feature label and the lowest plan that includes it). The shell renders navigation only after `me` loads, as it already does for permissions. An e2e test watches the DOM from first paint and fails if an unavailable item appears for even one frame.
- **Given** a request, **then** availability is read from an in-memory snapshot on each API server (stages, release groups, plan versions, add-ons, overrides), with no database query. An integration test counts queries. Limit checks query current counts only on the create calls that need them.
- **Given** any change, **then** every API server picks it up within **30 seconds**, and the web app on its next `me` refetch (page change, tab focus, or after a NOT_FOUND from a module procedure).
- **Given** a member mid-task when a feature becomes unavailable, **when** their next call returns NOT_FOUND, **then** the app refetches `me`, opens *Home* and shows the toast below.

### Organization isolation
- **Given** a person in an `internal` organization and a `standard` Starter organization, **when** they switch, **then** the browser cache (including availability) is cleared, and the Starter organization's navigation and API never include anything it isn't released or entitled to. Tested with two tabs (decision 0013).
- **Given** an override, an add-on or a plan assignment for one organization, **then** it never affects another. These tables carry `organizationId` and are in the 2a isolation test.
- **Given** `account.me`, **then** it never sends unavailable feature keys, stages, other plans' contents or prices. Upgrade hints, for owners only, contain a label and a plan name.

### Who can change what
- **Given** a Vento super-admin (a platform role on the person's account, set only by command, two-step required), **then** they can change stages, release groups, plan contents, plan assignments, add-ons and overrides. **Given** anyone else, including an organization owner, **then** no API or screen exists for it. The commands refuse unless `--by` names a super-admin.
- **Given** an organization owner, **then** they can see their plan and limits (read-only, on the Billing and plan screen when it ships) and switch available AI add-on features on or off. Nobody else in the organization sees plans.

### Audit
- **Given** any change to a stage, release group, plan version, plan assignment, add-on or override, **then** an append-only platform audit event is written in the same transaction: who, what, before → after, reason (required), when.
- **Given** a change that affects one organization (its group, plan, add-ons, overrides, trial start or end), **then** its own audit trail also records it in plain words, visible to owners: "Vento moved your organization to Growth", "Vento started a 30-day Enterprise trial (ends 2 Jan 2027)", "Vento turned on Estates for your organization".
- **Given** an owner switching an AI feature on or off, **then** it's an ordinary organization audit event.

### Replacing nav.ts status (brick 3a)
- **Given** this spec is built, **then** `status: 'built' | 'soon' | 'hidden'` in `apps/web/src/features/shell/nav.ts` becomes `flag` (the catalog key) and `built` (a code fact: the real route exists, or still the placeholder). Visibility = available to the organization **and** the role can view it. 3a's "hidden" switch is now the release stage.
- **Given** the 3a role navigation tests, **then** they take the available set as input and still derive their expected result from the permission table.

### Development and tests
- **Given** the local seed, **then** Vento Homes Ltd is `internal` (everything, no limits), and a second seeded organization is `standard` on Starter, so plan behaviour is visible locally. Every catalog flag starts at `internal`. e2e fixtures set release, plan and overrides explicitly.

## Behind the scenes
- **Data (for the architect):**
  - Platform-level: flag stages and plan versions with their features and limits. These have no `organizationId`, like statutory rules: platform configuration, not customer data. Record this exception to non-negotiable 1 in the decision.
  - Per organization (`organizationId` NOT NULL, indexed): release group, plan assignment (plan version, since when), add-ons (key, limit increases, since, until), overrides (kind `release` or `entitlement`, feature or limit key, value, reason, expires, who).
  - A platform audit table, append-only. Super-admin is a platform role on the user, never an organization role.
- **Snapshot** refreshed within 30 seconds on each API server; the mechanism is the architect's choice. Expiry is compared at read time, so no job is needed to end a trial. A daily job only sends the trial-ending emails.
- **Errors:** add `plan_limit` to `forbiddenReason`, with data `{ limit, included, askName?, askRole? }`.
- **Commands:** `pnpm flags list | show | stage | group | override` and `pnpm plans list | show | publish | assign | trial | addon | override`, each with `--reason` and `--by`. They confirm before changing anything, print what changes, and warn when data will drop out of view ("Lekki Partners Ltd has 214 records in Sales. Its members will stop seeing them."). They run where devops grants database access; there is no web endpoint until the console.
- **Billing later:** the *Billing and plan* screen and payment collection will call the same `assign` and `addon` operations. Nothing in this spec takes payment.

## Screens this spec touches
| Screen (row in SCREENS.md) | Change |
|---|---|
| App shell (sidebar, tabs, More, ⌘K) | Visibility = available and the role can view it; "Early access" tag; owner-only "Available on …" rows in ⌘K |
| Module placeholder (Coming soon) | Only reachable in `internal` organizations |
| 404 | Also for a module unavailable to the organization |
| Plan limit message (new row) | Owner and non-owner versions, inline where the create happens |
| Trial ending: Home line and email (new row) | Owners only |
| Settings → AI | Only AI features available to the organization; hidden if none |
| Billing and plan | Later; will show plan, limits with use, add-ons, trial end (owner only) |
| Super-admin: Feature flags, Organizations list and detail | Console in R2 (plans, add-ons, overrides, release group); commands until then (new row) |

## UI copy
| Where | Copy |
|---|---|
| Sidebar tag | "Early access" · tooltip "You have early access to this. Tell us what you think." |
| Sidebar tag (internal organizations only) | "Soon" (unchanged from 3a) |
| ⌘K row (owners only) | "Commissions" · "Available on Growth" · action **Talk to Vento** |
| Limit, owner | "Your Starter plan includes 1 active project. Archive a project or talk to Vento about Growth." · **Talk to Vento** |
| Limit, other members | "Your organization has reached its limit of 1 active project. Ask Olumide Bankole (owner)." |
| Limit, invitations (owner) | "Your plan includes 10 people, and 10 are in or invited. Remove someone or talk to Vento about Growth." |
| Feature gone mid-task (toast) | "Sales isn't available on your account right now. What you were typing wasn't saved." |
| Trial line on Home (owner, last 7 days) | "Your Enterprise trial ends on 2 Jan 2027. After that, the board pack is no longer available. Your data stays." · **Talk to Vento** |
| Trial ending email (owner) | Subject "Your Enterprise trial ends on 2 Jan 2027" · same body · **Talk to Vento** |
| Organization audit events | "Vento moved your organization to Growth" · "Vento started a 30-day Enterprise trial (ends 2 Jan 2027)" · "Your Enterprise trial ended" · "Vento added AI (₦150,000 a month)" · "Vento turned on Estates for your organization" |
| Command: confirm | "Sales will be available to 3 organizations (1 internal, 2 pilot). Continue? (y/N)" |
| Command: done | "Sales is now at pilot. Takes effect within 30 seconds." |
| Command: kill switch | "Sales is now off for everyone, including overrides and plans." |
| Command: in no plan | "Sales is in no plan, so standard organizations still won't have it." |
| Command: prerequisite | "Buyer portal needs Sales and Finance, which aren't available to Lekki Partners Ltd." |
| Command: over limit after change | "Lekki Partners Ltd has 3 active projects; Starter includes 1. Nothing is archived, but they can't add projects. Continue? (y/N)" |
| Command: not allowed / no reason | "Only Vento super-admins can change flags and plans." · "Add --reason so the audit trail says why." |

## Out of scope
- **Billing and payment collection:** prices, invoices, card or transfer payment, proration, dunning, self-serve upgrades. The *Billing and plan* screen comes later and uses this model.
- Percentage rollouts, A/B tests, per-user or per-role flags. A handful of customers, release groups and overrides cover every case; permissions already handle "who inside the organization".
- Usage-based limits beyond the four above (e.g. units, buyers, messages). Each new limit needs a reason.
- Customers switching non-AI features on or off, or seeing a roadmap or a "coming soon" list.
- Scheduled stage changes. A third-party flag service.

## Owner's decisions (26 Nov 2026)
All recommendations below were approved, with the release plan's changes applied:
1. Release flags and plan entitlements are separate; a feature is available only when released **and** entitled.
2. NOT_FOUND for unavailable features (not released or not in the plan); upgrade hints come only from `me`, only to owners.
3. Features outside the plan are hidden from every navigation; owners see "Available on …" only in ⌘K and limit messages, with **Talk to Vento**.
4. "Early access" tag for features reached through `internal`, `pilot` or a release override; trials show no tag but get the Home line and emails.
5. "Soon" tags only in `internal` organizations.
6. Plan versions keep existing customers on their deal until reassigned.
7. Security and compliance in every plan; site work (BoQ, procurement, site diary, vendor bills, permits) is in every plan too, as part of Release 1.
8. No second approver for flag and plan changes while fewer than four people are super-admins.
9. Customers are told about changes in their audit trail, and about trials by email.
10. Built as the next slice after 3a, before 3b.
11. Changes propagate within 30 seconds.
12. Pilots are optional and have no fixed thresholds; the owner moves each flag when they choose.

## Open questions (answered above)
1. **NOT_FOUND for unavailable features.** *Recommended:* yes, for both "not released" and "not in plan", as argued above. Upgrade hints come only from `me`, and only to owners.
2. **Released but not in the plan.** *Recommended:* hidden for every non-owner; for owners, hidden from navigation but offered at the point of need (⌘K and limit messages) with **Talk to Vento**. The alternative is a greyed "Available on Growth" sidebar entry for owners, which is more visible but adds permanent clutter.
3. **"Early access" tag for pilots.** *Recommended:* yes, so pilots know what's new. No tag for trials (they get the Home line and emails instead).
4. **"Soon" tags.** *Recommended:* only in `internal` organizations.
5. **Plan versions keep existing customers on their deal.** *Recommended:* yes; moving them is a deliberate `assign`.
6. **Security and compliance in every plan.** *Recommended:* yes: two-step, passkeys, approvals, audit, KYC/AML and data protection are never upsold.
7. **Second approver for flag and plan changes.** *Recommended:* not while Vento's team is small. Add it once more than three people hold super-admin.
8. **Telling the customer about changes.** *Recommended:* yes, in their audit trail and, for trials, by email.
9. **When to build.** *Recommended:* the next slice after 3a, before 3b, while no module procedures exist. Plans can start with one seeded plan and grow to three before the first paying customer.
10. **Propagation time.** *Recommended:* 30 seconds.
