# Vento console (super-admin)

- **Status:** in build. Approved by the owner on 26 Nov 2026; slice 1 (console core) is built on `feat/admin-console` and becomes `shipped` when it merges. Slice 2 (support view) is not planned yet. Plan: [admin-console](../plans/admin-console.md); decision [0021](../decisions/0021-the-console-is-a-separate-area-behind-fresh-two-step.md).
- **Module:** Platform
- **Journeys:** J-ADM-01 and J-ADM-02 (changed: console first, commands as fallback), J-ADM-03 (new: manage super-admins and review platform activity), J-ADM-04 (new, slice 2: look at a customer's account with their permission), J-ONB-11 (new, slice 2: an owner lets Vento support see their account)
- **Screens:** see [Screens this spec touches](#screens-this-spec-touches)
- **Decisions:** builds on 0015 (platform configuration outside organizations; trust model until the console), 0016 (availability in the contract, snapshot within 30 seconds), 0019 (passkeys count as two-step; passkeys bound to the web app's host), 0013 (tab guard), 0018 ("company" on screen). New record [0021](../decisions/0021-the-console-is-a-separate-area-behind-fresh-two-step.md) "The console is a separate area on the same origin, behind fresh two-step" (amends 0015's trust model); slice 2 still needs "Support view is read-only by declaration".
- **Release plan:** [section 8](../release-plan.md#8-build-order): built right after brick 3d (owner, 26 Nov 2026)
- **Builds on:** [feature-flags](feature-flags.md). Every rule, warning, confirmation and audit event there still holds; this spec only changes *how* a super-admin makes the change.

## Problem
Ada runs Vento's releases and customer accounts. Today every change is a shell command on the API host: she types an organization's exact name, a flag key and her own email as `--by`, and the platform trail can only *say* it was her, because anyone with a shell can type any super-admin's email. When Sales breaks on a Friday night she needs a laptop, a VPN and the host, not her phone. When Olumide at Vento Homes asks "why can't my team see Commissions?", she has to run three commands and work out the availability rule in her head. And when a customer asks for help, nobody at Vento can see what they see without asking for their password, which nobody should ever do. Vento staff need one place, clearly separate from any customer's workspace, where a signed-in super-admin can release features, manage plans, trials and deals, see why an organization has what it has, and (with the customer's permission) look at their account read-only, with every action tied to a real two-step sign-in.

## Persona and job
| Who | Job | How often |
|---|---|---|
| **Vento super-admin** (Ada, product and releases; Tunde, customer success) | Release a feature stage by stage, kill a broken one, put an organization on a plan, start or end a trial, record a deal, add AI, answer "why doesn't this customer have X?" | Releases every few weeks; plan and trial changes weekly once selling; the kill switch rarely, and from wherever they are |
| **Vento super-admin, on support** (slice 2) | See exactly what a customer sees to answer a question or reproduce a problem, without being able to change anything | A few times a week once selling |
| **Organization owner** (Olumide Bankole) | Know what Vento changed on their account, and decide whether Vento support may look at it (slice 2) | Rarely |
| **Every other member** | Nothing. The console doesn't exist for them. | Never |

## Success looks like
- **Kill switch from a phone in 4 taps and under 30 seconds** (open the console already signed in → Releases → the feature → **Turn off for everyone** → reason → confirm), effective for every user within **30 seconds**, as today.
- **Every change command has a console equivalent** that calls the same operation, shows the same preview lines and warnings, and writes the same platform and organization audit events. A parity test lists every change command and fails if one has no console procedure.
- **Zero `--by`:** every console change is attributed to the signed-in super-admin, and the platform trail records it came from the console, with device and masked IP.
- **Zero console procedures callable** without an active super-admin whose two-step was proven within the console window. A walk test calls every console procedure as a customer owner, as a super-admin without fresh two-step and as a revoked super-admin, and expects *not found* each time.
- **"Why doesn't Lekki Partners have Commissions?" answered in 2 clicks** from the console home (search → organization → the feature's row says why).
- **Customers never download console code:** the console is its own lazy-loaded bundle; the customer first-load budget (< 200 KB gzip) doesn't move.
- Usable at **375 px** (designed on [AdminOrgsMobile](../design/claude-design/AdminOrgsMobile.dc.html)), **WCAG 2.2 AA** in light and dark.
- Slice 2: **a support view writes nothing** in the customer's data. A walk test calls every write procedure in a support view and expects it refused before any read or write.

## What's in this brick, and what follows
The owner named six things (section 8 of the release plan). Two of them have no data yet, and one needs its own security review. Building screens without data would mean placeholder numbers, which the owner's "Soon only in internal organizations" rule already rejects for customers; the same standard applies here.

| Slice | Contents | Why then |
|---|---|---|
| **1 · This brick: the console core** | Separate console area, sign-in with fresh two-step, **Organizations** (list and detail with "why" per feature), **Releases** (flags, stages, release groups, release overrides), **Plans** (list, versions, publish a new version), trials, add-ons and entitlement overrides, **Super-admins**, **Activity** (platform audit trail). Change commands retire to break-glass. | All data exists (`feature_releases`, `plans`, `plan_versions`, `organization_*`, `platform_admins`, `platform_audit_events`), and every operation is already a function the commands call (`apps/api/src/platform/operations`). This replaces `--by` with real sign-in, which is the security gap the 0015 review left open. |
| **2 · Support view** (next, before brick 4) | Owner's permission, read-only support view with a banner, page-level logging, customer audit entry and email. | Needs every customer procedure to declare `read` or `write` and a walk test to enforce it. That's cheapest now, while customer procedures are only team, roles, companies and security; after the module bricks it means auditing hundreds. It's also a separate security review (the security agent audits it, as with 3d). |
| **3 · Failed jobs** | The [AdminJobs](../design/claude-design/AdminJobs.dc.html) screen: failed, retrying, needs customer; retry; health line on organization detail. | **No job system exists yet.** Emails send inline (Postmark) and `plans notify-trials` runs from cron with no record. Built with the first queued work (bank import, reminders or WhatsApp), which also defines the jobs table this screen reads. |
| **4 · AI usage** | *Usage and AI* page, AI columns and stat cards on Organizations, AI cards on organization detail. | **No `ai_usage` records exist yet**; they arrive with the AI gateway (`ai-features` skill). Built with the first AI feature. |
| **Later** | Billing facts on the organization (next invoice, payment failed), statutory defaults, second approver. | With the *Billing and plan* screen, the first statutory rules, and the fourth super-admin respectively. |

The console's navigation shows only built sections (the 3a rule): slice 1 has **Organizations · Releases · Plans · Activity · Super-admins**. No "Failed jobs" or "Usage and AI" entry appears until its slice ships.

## Where the console lives
- **One area, `/console`, on the web app's own origin** (`app.ventoerp.com/console`). Same origin means passkeys work there (decision 0019 binds them to the web app's host) and there's one deploy. It's still a different place: its own shell, its own API router and its own session check. (`/admin` is avoided because *admin* is a customer role.)
- **Its own shell.** Navy sidebar with the Vento mark and a fixed amber label **Vento staff · all customers** (as on the boards), no company switcher, no organization switcher, no customer modules, no ⌘K customer actions. Browser tab title "Vento console · {page}". On phones: four bottom tabs (Organizations, Releases, Plans, More).
- **How a super-admin gets there.**
  - The user menu shows **Vento console** to active super-admins only (a separate group under My security). ⌘K offers **Open Vento console**. Nobody else sees either.
  - A super-admin who belongs to no organization lands on the console after sign-in instead of onboarding.
  - From the console, the user menu offers **Back to {organization}** for super-admins who are also members somewhere.
- **For everyone else, `/console` doesn't exist:** *404*, not *403*, for signed-out people, customers, and revoked super-admins. The console bundle is never requested for them.
- **Never mixed:** no console data appears in a customer workspace, and no customer workspace data appears in the console in slice 1 beyond the facts listed under [Organization detail](#organization-detail). A super-admin's membership in Vento's internal organization gives them nothing extra there.

## Sign-in and two-step
- **Who:** an active row in `platform_admins` (granted only by another super-admin, or `--bootstrap` on an empty environment) **and** two-step on (the authenticator app; decision 0019: where two-step is required, the app is set up, and a passkey is the fast path on top).
- **Two-step can't be turned off by a super-admin:** My security shows "Required because you're a Vento super-admin" and no **Turn off** button, like any required role.
- **Fresh two-step to enter.** Opening the console asks *Confirm it's you* with a **passkey** or an **authenticator code** (backup codes work too), never the password alone, unless the person proved a second factor in the last 5 minutes (for example, they just signed in with a passkey or a code). The proof opens a **console window** on this session.
- **Console window:** ends after **15 minutes without console activity** or **8 hours** after it opened, whichever is first, and at once when the person signs out, their session ends, or they're revoked. Customer pages in the same session keep the normal rules (30 minutes / 12 hours / 30 days). When the window ends mid-task, the next action opens *Confirm it's you* over the page; the dialog, the typed reason and the choice stay, and the action runs after the proof.
- **No extra code per action.** Confirmation dialogs (with reason) are the safeguard for each change; the console window is the authentication.
- **The architect's to settle:** the session today records when the password was confirmed (`reauthenticatedAt`), not when a second factor was. The console needs the latter (`secondFactorAt` or a separate console grant row); a test pins that a password-only confirmation never opens the window.

## How `--by` is replaced
- **Console changes:** the actor is the signed-in super-admin; `actorUserId` and `actorName` come from the session, never from input. The platform audit event's operator becomes `console · {device and browser} · {masked IP}` (for example "console · Chrome on Mac · 102.89.••.14"), with `channel: console`.
- **Change commands become break-glass.** Once this brick ships, `pnpm flags|plans|superadmin` change commands refuse unless run with `--break-glass` (plus `--reason` and `--by`, as now). A break-glass change is tagged `channel: command`, keeps the operator as today, and **emails every other active super-admin** at once ("Sales was moved to off from the command line by ada@ventoerp.com on api-1"). Use: the console or sign-in is down.
- **Unchanged:** read commands (`list`, `show`), `plans bootstrap` and `superadmin grant --bootstrap` on an empty environment, and the scheduled `plans notify-trials` (`VENTO_CRON=1`).
- `docs/RUNBOOK.md` and decision 0015's trust-model section are updated: host access stays limited to super-admins, but day-to-day changes need a real sign-in.

## The console, screen by screen (slice 1)

### Organizations (console home)
Design: [AdminOrgs](../design/claude-design/AdminOrgs.dc.html), [AdminOrgsMobile](../design/claude-design/AdminOrgsMobile.dc.html), with the changes in [Design changes](#design-changes).
- **Header:** "Organizations" and one line: "214 organizations · 3,912 people".
- **Four stat cards:** **Organizations** ("+6 this month") · **On trial** ("4 end this week") · **Pilot** (count) · **Over a limit** (organizations with more active projects, companies or people than their limits allow, for example after a downgrade). Each card filters the list.
- **Chips:** All · On trial · Pilot · Internal · Over a limit. **Search:** organization name or owner email.
- **Table:** Organization (owner's name under it) · Plan ("Growth v2"; "Internal · everything") · Group (Standard / Pilot / Internal) · People · Companies · Projects · Last active ("Today", "3 days ago") · Trial ("Enterprise · 9 days left", blue badge, or empty). Sorted by last active. Below `md`: cards with name, plan, trial badge and last active.
- **Row click** opens Organization detail. URL holds chips, search and page.

### Organization detail
Design: [AdminOrgDetail](../design/claude-design/AdminOrgDetail.dc.html) (header and card layout), with the changes in [Design changes](#design-changes).
- **Header:** name, "Growth v2 · Standard · owner Olumide Bankole (olumide@ventohomes.ng) · customer since 3 Feb 2026". Primary **Change plan**; a ⋯ menu with **Start trial** (or **End trial**), **Add AI** (or **Change AI budget**, **Remove AI**), **Change release group**, **Add override**. Slice 2 adds **Open support view**.
- **Plan card:** plan and version, "Growth v3 is available" with **Move to v3** when a newer version exists; limits with use: "Projects 3 of 5 · Companies 2 of 3 · People 11 of 15 · AI budget ₦150,000 a month", each in amber at the limit and rose over it ("7 of 5 · over the limit; nothing archived, new projects refused").
- **Trial card** (when there's one): "Enterprise trial · ends 2 Jan 2027 (9 days)" · reminders sent ("7 days before, sent 26 Dec") · **End trial**.
- **Add-ons card:** "AI · ₦150,000 a month · since 1 Nov 2026" · or "No add-ons".
- **Overrides card:** one row per live override: what ("Commissions · on", "Projects limit · 8"), kind (Release / Plan), until ("until 31 Jan 2027" or "no end date"), reason, who and when; ⋯ **Clear**. Expired overrides collapse under "3 ended".
- **Features card (the "why"):** every catalog feature, grouped by module, with **Available** (emerald) or **Not available** (slate) and one plain reason from the availability rule, in its order:
  - "Off for everyone" · "At internal; this organization is standard" · "Released on through an override (until 31 Jan 2027)" · "Not in Starter; in Growth and Enterprise" · "From the Enterprise trial (ends 2 Jan 2027)" · "Needs Sales and Finance" · "Core: in every plan" · "Early access (pilot)".
  - Filter: All · Available · Not available. Each row's ⋯ offers **Release override** and **Plan override** (the same sheets as **Add override**, prefilled).
- **Activity card:** this organization's platform audit events, newest first (who, what, before → after, reason, when, console or command line), with **See all** to *Activity* filtered.
- **Facts only.** The detail page shows the owner's name and email, counts and dates. It never shows members' names, buyers, money, documents or KYC. Those need a support view (slice 2), with permission.

### Changes on an organization (sheets and confirms)
Each change is a side sheet with the fewest fields, a required **Reason**, and a confirm step that shows the same preview lines the command prints today (from the same `preview*` functions). The primary button names the change.
| Change | Fields (defaults) | Confirm shows |
|---|---|---|
| **Change plan** | Plan (current preselected), version (latest; "Use an older version" under More options) | Over-limit warning, features gained and lost by name, records that drop out of view |
| **Start trial** | Plan (the next plan up), days (30) | End date; "Owners get an email 7 days and 1 day before it ends" |
| **End trial** | – | Features that stop; records that drop out of view |
| **Add AI / Change AI budget** | Monthly budget in naira (₦150,000) | "Owners can then switch AI features on in Settings → AI". Change is one step for the super-admin: today's operations need remove then add, so the architect adds a change-budget operation (one transaction, one audit event, "Vento changed your AI budget to ₦250,000 a month") |
| **Remove AI** | – | AI features that stop |
| **Change release group** | Standard / Pilot / Internal | Features gained or lost by name; for Internal: "Internal organizations get every feature with no limits. Use only for Vento's own organizations." |
| **Add override** | Kind (Release / Plan), feature or limit, value (on / off, or a number / unlimited), until (empty = no end date) | Prerequisite warnings, kill-switch note when the feature is off |
| **Clear override** | – | What applies after ("Projects limit goes back to Growth's 5") |

### Releases
No design: built from the *list page* and *detail page* archetypes (status `pattern`). Designers get the flag list for the next pass.
- **List:** every catalog feature: name and key · module · stage (Off rose · Internal slate · Pilot blue · On emerald) · organizations that have it · plans that include it ("Growth, Enterprise"; "Core"; "AI add-on"; "None" in amber). Chips: All · Off · Internal · Pilot · On · In no plan. A banner when data holds keys the code no longer has: "2 keys in data are no longer in the code and are ignored: sales.old_reports, ai.summaries."
- **Feature detail:** header with name, key, one-line description and stage. **Stage** control (Off · Internal · Pilot · On) with the current one selected. Below: Needs (prerequisites), Included in (plans), Organizations that have it grouped by Internal / Pilot / Standard (names link to detail), Overrides (live), Recent changes. A separate destructive **Turn off for everyone** at the foot, always visible, so the kill switch is never inside a menu.
- **Moving a stage:** pick the stage → confirm dialog with the preview ("Sales will be available to 3 organizations (1 internal, 2 pilot).", the in-no-plan warning, "Lekki Partners Ltd has 214 records in Sales. Its members will stop seeing them.") → Reason → **Move Sales to pilot**.

### Plans
No design (status `pattern`, also `needs-design`: it's the one screen with a real editor).
- **List:** each plan with latest version, organizations per version, "Default for new organizations" tag.
- **Plan detail:** versions side by side with the latest first: features (grouped by module, core features collapsed as "Core: in every plan"), limits, organizations on each version (link to Organizations filtered).
- **Publish new version** (side sheet, stepped): (1) features as checkboxes grouped by module, starting from the latest version; limits as number fields with "Unlimited"; (2) **review**: what's added and removed compared with the latest version, and "47 organizations stay on v2 until you move them"; Reason → **Publish Growth v3**. Name, sort order and "Default for new" are under More options. Publishing never moves anyone.
- **Move organizations to the new version** is per organization (**Move to v3** on its detail page), as today. A bulk move is out of scope.

### Super-admins
No design (status `pattern`).
- List: name, email, since, granted by, last console activity. **Add super-admin** (email of an existing Vento account with two-step on) and ⋯ **Remove**. Nobody can remove themselves; there's always at least one.
- A line under the list: "No second approver is needed while there are fewer than 4 super-admins." When a fourth is added, the confirm says: "This is the fourth super-admin. The owner asked for a second approver from now on; that's not built yet."

### Activity
No design: *list page* (status `pattern`). Vento's platform audit trail: when, who, what (in words: "Moved Sales to pilot"), organization or feature, before → after, reason, console or command line. Filters: person, organization, feature, kind, date. Break-glass entries carry a rose **Command line** tag. Read-only, append-only, no export in slice 1.

## User flows
**Release to a pilot (J-ADM-01): 3 clicks from the console**
1. **Releases** → **Sales** (1).
2. **Stage: Pilot** (2) → confirm: "Sales will be available to 3 organizations (1 internal, 2 pilot)." → Reason "Release 1 pilot" → **Move Sales to pilot** (3).
3. Toast "Sales is now at pilot. Takes effect within 30 seconds." Pilot members who can view Sales see it with "Early access" on their next page change.
- Making an organization a pilot first: Organization detail → ⋯ **Change release group** → Pilot → reason → **Move to pilot** (4 clicks, once per pilot).

**Kill switch (J-ADM-01): 4 taps on a phone**
1. Console → **Releases** (1) → **Sales** (2) → **Turn off for everyone** (3).
2. Confirm: "Turn off Sales for everyone? It stops for all 41 organizations, including overrides and plans. Nothing is deleted." Reason → **Turn off Sales** (4).
3. Toast "Sales is now off for everyone. Takes effect within 30 seconds."

**Put an organization on a plan (J-ADM-02): 4 clicks**
1. Search "Lekki" → **Lekki Partners Ltd** (1) → **Change plan** (2) → **Growth** (3, latest version preselected).
2. Confirm shows over-limit and lost-feature warnings, if any → Reason → **Move to Growth** (4).
3. Toast "Lekki Partners Ltd is now on Growth." The owner's audit trail reads "Vento moved your organization to Growth".

**Start a trial: 4 clicks** — Organization → ⋯ (1) → **Start trial** (2) → Enterprise and 30 days preselected (3) → reason → **Start 30-day trial** (4).

**Record a deal: 5 clicks** — Organization → ⋯ → **Add override** → Plan · Projects limit · 8 → reason → **Set projects limit to 8**.

**Why doesn't this organization have X? 2 clicks** — Search → organization (1) → Features card, filter **Not available** (2): "Commissions · Not in Starter; in Growth and Enterprise".

**Add a super-admin (J-ADM-03): 3 clicks** — **Super-admins** → **Add super-admin** (1) → email (2) → reason → **Make Tunde a super-admin** (3).

## Acceptance criteria

### Reaching the console
- **Given** an active super-admin with two-step on, **when** they open the user menu or ⌘K, **then** they see **Vento console**; **given** anyone else (including an organization owner, an admin, and a revoked super-admin), **then** neither entry exists and `/console` and every path under it shows *404* without loading the console bundle.
- **Given** a super-admin with no organization membership, **when** they sign in, **then** they land on the console (after *Confirm it's you*, skipped because they just proved two-step), never on onboarding.
- **Given** the console, **then** no company or organization switcher, customer module, customer ⌘K action, setup checklist, or role preview appears, and the amber label "Vento staff · all customers" is visible on every page at every width.

### Two-step and the console window
- **Given** a super-admin who signed in with a password and code or a passkey less than 5 minutes ago, **when** they open the console, **then** no extra step is asked.
- **Given** a super-admin whose last second-factor proof is older than 5 minutes, **when** they open the console, **then** *Confirm it's you* asks for a passkey or a code; the password alone is never enough. Five wrong codes lock sign-in as today (DOMAIN access rules).
- **Given** a console window idle for 15 minutes or open for 8 hours, **when** the super-admin acts, **then** *Confirm it's you* opens over the page, keeps the open dialog and typed reason, and runs the action after the proof.
- **Given** a super-admin removed by another super-admin, **when** they make their next console request, **then** it answers *not found*, their console window ends, and their customer workspace sessions carry on unaffected.
- **Given** a super-admin whose two-step was reset by an owner of an organization they belong to, **then** the console stays closed until they set up the authenticator app again; the console shows "Set up two-step to use the Vento console." with **Set up two-step**.
- **Given** a super-admin on My security, **then** two-step shows "Required because you're a Vento super-admin" and can't be turned off.

### Parity with the commands
- **Given** any change the commands support (`flags stage | group | override`, `plans publish | assign | trial | trial --end | addon | addon --remove | override feature | override limit | … clear`, `superadmin grant | revoke`), **then** the console has a procedure that calls the same operation in `apps/api/src/platform/operations`, inside the same transaction, writing the same platform and organization audit events. The parity test fails if a change command has no console procedure.
- **Given** a change, **then** its confirm shows the same preview lines and warnings as the command (shared functions, not copied strings): stage preview with organization counts by group; "in no plan"; prerequisites missing; records that drop out of view; over a limit after a plan change; already at that stage.
- **Given** a change, **then** a reason is required (trimmed, at least 3 characters) and the confirm button stays disabled without one.
- **Given** a successful change, **then** the toast says what changed and "Takes effect within 30 seconds" where it affects availability, and every API server applies it within 30 seconds (unchanged mechanism).
- **Given** the command line after this brick ships, **when** a change command runs without `--break-glass`, **then** it refuses: "Make this change in the Vento console. If the console is down, add --break-glass." With `--break-glass`, the change runs as today, is tagged `command`, and every other active super-admin is emailed.

### Conflicts and errors
- **Given** two super-admins with the same feature open, **when** one moves Sales to pilot and the other then confirms a move to on, **then** the second is refused with "Sales moved to pilot a moment ago (by Ada). Check the preview and try again." and the page refreshes. Every change carries the before-state it was previewed against.
- **Given** an override "until" date in the past, a non-number limit, a budget of zero, or a trial of 0 or more than 90 days, **then** the field says what's needed and nothing is sent.
- **Given** an operation error (for example "Lekki Partners Ltd already has a trial ending 2 Jan 2027."), **then** the console shows the operation's own plain message in the dialog; no codes or stack traces. Some operation messages name command flags today ("End it first with plans trial … --end", "--days must be…", "Run the command again"); the operation returns the fact and each channel adds its own next step ("End it first" with an **End trial** link in the console).
- **Given** a network failure while confirming, **then** the dialog stays open with the reason kept and "Couldn't reach Vento. Your change wasn't made. Try again."; retrying never applies a change twice (idempotency key per confirm).

### Organizations and detail
- **Given** an internal organization, **then** the Plan card says "Internal: every feature, no limits" and limits show use without a cap.
- **Given** an organization with no plan row, **then** it shows "No plan" in amber with **Choose a plan**.
- **Given** an organization over a limit, **then** it appears under **Over a limit** and its Plan card says which limit and by how much; nothing is archived.
- **Given** the Features card, **then** each row's reason matches `organizationAvailability` for that organization at that moment (a unit test runs the card's explainer against the availability table test's rows).
- **Given** no organizations match a search or chip, **then** "No organizations match these filters." with **Clear filters**.

### Releases and plans
- **Given** a stage moved to `off`, **then** the feature is unavailable to everyone including overrides, the feature's row shows **Off** in rose, and its detail page shows "Off for everyone since 26 Nov 2026, 21:14 · Ada · Receipt allocation bug" at the top.
- **Given** a plan version published, **then** no organization moves; the plan detail shows the new version with 0 organizations and every organization on an older version shows "Growth v3 is available".
- **Given** a feature unchecked in a new version, **when** reviewing, **then** the review lists it as removed and says "Organizations stay on their version until you move them."

### Super-admins
- **Given** an email with no Vento account, or an account without two-step, **then** adding is refused with "No Vento account uses tunde@ventoerp.com." or "Tunde Bello needs two-step sign-in on before becoming a super-admin."
- **Given** a super-admin removing themselves, **then** there's no **Remove** on their own row (and the API refuses: "You can't remove yourself. Ask another super-admin.").
- **Given** a new super-admin, **then** they're emailed "You're now a Vento super-admin" and every other super-admin gets a short notice; the same on removal.

### Customers
- **Given** any change made in the console, **then** the affected organization's audit trail gets the same plain-words entry as from the command ("Vento moved your organization to Growth"), actor "Vento", never the staff member's name or Vento's internal reason (decision 0015).
- **Given** an organization owner, **then** nothing in their workspace changes in slice 1 except those audit entries.

### Isolation
- **Given** console procedures, **then** they live on a separate platform router with its own middleware (session → active super-admin → two-step on → console window), never on `memberMiddleware`, and carry no `organizationId` from the session; an organization is always named by ID in the input. The 0016 walk test is extended: every console procedure is on the platform router, and no customer procedure is.
- **Given** a customer procedure, **then** being a super-admin changes nothing about it.

## Support view (slice 2)
Specified here so slice 1 doesn't paint it into a corner; built and security-reviewed as its own slice.

**Rules**
1. **Only with the owner's permission.** Under the NDPA Vento processes customers' buyer and staff data on their instructions, so support looks only when an owner says so. An owner gives permission for **7 days** in one click: in **Talk to Vento** (a checkbox "Let Vento support see our account for 7 days", ticked by default when they open it from a problem) or on *Organization profile → Security* (**Let Vento support in**). They can end it at any time; it ends by itself after 7 days.
2. **Opened by a super-admin, for a reason the customer will read**, for at most **60 minutes** at a time (**Open support view** on organization detail → reason → **Open read-only view**). It opens the customer workspace in a new tab with an amber banner on every page: "Support view of Lekki Partners Ltd · read-only · ends 15:40" and **Leave**.
3. **Sees what an owner sees, on screen only.** Every page and record an owner can view, across every company. Never: ID numbers revealed (masked, no reveal), identity documents or any file downloaded, exports, PDFs generated for download, My security or anyone's sessions or passkeys, or the buyer and realtor portals.
4. **Changes nothing.** Every customer procedure declares `read` or `write` in the contract (like `meta.feature`); in a support view every `write` answers FORBIDDEN `support_read_only` before it reads or writes anything. Reads with side effects (marking notifications read, last active, setup checklist "hide", known devices) are skipped. Action buttons stay in place, disabled, with the tooltip "Read-only support view", so support sees the layout the customer sees.
5. **Not a member.** The support viewer isn't in Team, doesn't take a place on the plan, doesn't appear as anyone's "last active", and gets no notifications or emails.
6. **Logged twice.** Platform trail: opened (who, reason, organization), every page viewed (route and record ID, never content), closed (how: left, timed out, permission ended, revoked). Customer trail: "Vento support viewed your account from 14:40 to 15:05. Reason: Checking why invitations to two people bounced." Owners are emailed when a view opens ("Vento support is looking at your account") with **End access**.
7. **Ends** on **Leave**, after 60 minutes, when the owner ends permission (within 30 seconds), or when the super-admin's console window ends or they're removed.

**Acceptance (summary; full set in the slice 2 plan):** a walk test calls every `write` procedure in a support view and expects refusal with no rows touched; a test fails if a customer procedure lacks `read` or `write`; a view can't open without a live permission; the banner is on every page at every width; a support viewer's request carries both the super-admin and the organization in its audit context; ending permission closes an open view within 30 seconds.

## Behind the scenes
- **Data:** no new platform tables in slice 1 except what the architect needs for the console window (a column on `sessions` or a `console_grants` row). `platform_audit_events` gains `channel` (`console` | `command` | `scheduled`) in metadata or a column. Slice 2 adds `support_permissions` (organization-scoped, owner, from, until, ended) and `support_views` (organization-scoped, super-admin, reason, opened, closed, how), and page views in the platform trail or a sibling append-only table, with the same `REVOKE UPDATE, DELETE` as `platform_audit_events` (RUNBOOK §1).
- **API:** a `platform` oRPC router with `superAdminMiddleware`; every procedure calls an existing operation. `CommandError` messages become the procedure's error message (they're already plain words); rename to `PlatformError` is the architect's call.
- **Idempotency and concurrency:** each confirm sends an idempotency key and the previewed before-state; the operation refuses with CONFLICT if the state moved.
- **Emails (Postmark, decision 0017):** break-glass change (to other super-admins), super-admin added or removed (to the person and the others). Slice 2: support view opened (to owners).
- **Web:** `/console` is a separate route tree and lazy chunk with its own shell; preloaded on hover of **Vento console** for super-admins only.
- **Commands:** change commands require `--break-glass` (see above); `RUNBOOK.md` §3 and §4 and `ARCHITECTURE.md`'s commands row are updated.

## Screens this spec touches
Rows to add or change in `docs/design/SCREENS.md` §15 (Design `–` unless named; Status `todo`):
| Screen | Design | Slice |
|---|---|---|
| Console shell: navy sidebar with "Vento staff · all customers", bottom tabs on phones, user menu with **Back to {organization}** | [AdminOrgs](../design/claude-design/AdminOrgs.dc.html) (sidebar) | 1 |
| *Confirm it's you* for the console (passkey or code) and "Set up two-step to use the Vento console" | – (pattern from My security dialogs) | 1 |
| Organizations list (replaces the row "Organizations list and detail…") | [AdminOrgs](../design/claude-design/AdminOrgs.dc.html), [AdminOrgsMobile](../design/claude-design/AdminOrgsMobile.dc.html) (with design changes) | 1 |
| Organization detail: Plan, Trial, Add-ons, Overrides, Features ("why"), Activity | [AdminOrgDetail](../design/claude-design/AdminOrgDetail.dc.html) (layout; with design changes) | 1 |
| Organization change sheets and confirms: change plan, start or end trial, AI add-on, release group, override, clear override | – | 1 |
| Releases list and feature detail with stage control and **Turn off for everyone** (replaces "Feature flags: stage per flag…") | – (needs-design) | 1 |
| Plans list, plan detail, **Publish new version** stepped sheet (replaces "Plans: contents, limits, versions") | – (needs-design) | 1 |
| Super-admins list, add and remove | – | 1 |
| Activity (platform audit trail) | – (pattern from [AuditLog](../design/claude-design/AuditLog.dc.html)) | 1 |
| Emails: break-glass change, super-admin added or removed | – | 1 |
| User menu and ⌘K: **Vento console** (super-admins only); My security "Required because you're a Vento super-admin" (§0 rows) | – | 1 |
| Flag and plan commands: change commands need `--break-glass` (existing row) | – | 1 |
| Support permission: in **Talk to Vento** and *Organization profile → Security* (§12 row) | – | 2 |
| Support view banner and disabled actions in the customer workspace | – | 2 |
| Email to owners: "Vento support is looking at your account" | – | 2 |
| System health and failed jobs (existing row) | [AdminJobs](../design/claude-design/AdminJobs.dc.html) | 3 |
| AI usage and cost by organization and feature (existing row) | [AdminOrgDetail](../design/claude-design/AdminOrgDetail.dc.html) (per organization) | 4 |

### Design changes
To record in `docs/design/CHANGES.md` when built:
- **Organization detail, "Feature flags" card with on/off switches → "Features" card with the reason per feature.** A switch hides the model: a per-organization change is an override with a reason and an optional end date, and it can't beat `off`. Stages are Off / Internal / Pilot / On, not "GA / Beta".
- **"Entities" → "Companies"** in the table and Plan card (decision 0018); "Users" → "People" to match Team.
- **No billing or ticket facts yet:** "Next invoice", "Payment failed", "₦450,000 / month" and "Support tickets" are left out until billing and a ticket system exist; "Failed jobs" and AI cards and columns wait for slices 3 and 4.
- **Sidebar:** only built sections; "Usage & AI", "Failed jobs" and "Statutory defaults" appear with their slices.

## Changes to `docs/DOMAIN.md`
Platform table:
- **Add "Vento console":** "The staff-only area where super-admins manage releases, plans, trials, add-ons, overrides and super-admins. | At `/console`, its own shell, never inside a customer workspace. Needs a fresh two-step proof (passkey or code) and closes after 15 minutes idle or 8 hours."
- **Change "Vento super-admin" notes:** "…Two-step required and can't be turned off. Works in the Vento console; the commands are for break-glass only. Every change is attributed to the signed-in person…"
- **Change "Platform audit event" notes:** "Who, channel (console, command line, scheduled), operator (console device and masked IP, or the host user), before → after, reason."
- **Add "Break-glass change":** "A platform change made from the command line because the console is unavailable. | Needs `--break-glass`; every other super-admin is emailed."
- Slice 2: **add "Support permission"** ("An owner's permission for Vento support to view the account read-only. | 7 days, ended by the owner at any time.") and **"Support view"** ("A super-admin's read-only look at a customer's workspace, with the owner's permission. | At most 60 minutes, reason required and shown to the customer; every page viewed is logged; changes nothing; never reveals IDs or downloads files.").

Access rules: add "**Console window:** opens with a passkey or code (not the password alone) and ends after 15 minutes without console activity or 8 hours, whichever is first."

## Journey changes
- **J-ADM-01, J-ADM-02** (`docs/journeys/12-vento-admin.md`): steps become console steps (flows above); the commands become the fallback with `--break-glass`; the header's trust-model paragraph changes to "signed in with fresh two-step". Targets: 3 clicks for a stage change, 4 for the kill switch and a plan change. Tests: `e2e/console/releases.spec.ts`, `e2e/console/plans.spec.ts`; existing CLI tests stay.
- **J-ADM-03 (new):** add and remove a super-admin; review activity. Test: `e2e/console/super-admins.spec.ts`; API: `apps/api/src/platform/console-access.test.ts` (walk test and console window).
- **J-ADM-04 (new, slice 2):** open a support view with the owner's permission. Test: `e2e/console/support-view.spec.ts`; API: `apps/api/src/platform/support-read-only.test.ts`.
- **J-ONB-11 (new, slice 2):** an owner lets Vento support in and sees what it looked at.
- Assumptions to confirm (for the journey file): `/console` as the path; 30 days as the default trial length and 90 as the maximum; ₦150,000 as the prefilled AI budget; reason at least 3 characters.

## UI copy
| Where | Copy |
|---|---|
| Sidebar label | "Vento staff · all customers" |
| User menu / ⌘K | "Vento console" · "Open Vento console" · in the console: "Back to Vento Homes Ltd" |
| Confirm it's you (console) | Title "Confirm it's you" · "Use your passkey or a code from your authenticator app to open the Vento console." · **Use passkey** · **Use a code instead** · **Confirm** |
| Console window ended | "Your console session timed out. Confirm it's you to carry on. Your change is still here." |
| Two-step missing | "Set up two-step to use the Vento console." · **Set up two-step** |
| My security (super-admin) | "Required because you're a Vento super-admin" |
| Organizations header | "214 organizations · 3,912 people" |
| Organizations empty | "No organizations yet. They appear here when someone finishes signing up." |
| Filtered empty | "No organizations match these filters." · **Clear filters** |
| Plan card | "Growth v2" · "Growth v3 is available" · **Move to v3** · "Projects 7 of 5 · over the limit. Nothing is archived; new projects are refused." · "Internal: every feature, no limits" · "No plan" · **Choose a plan** |
| Trial card | "Enterprise trial · ends 2 Jan 2027 (9 days)" · **End trial** |
| Overrides empty | "No overrides. This organization gets exactly what its plan and release group give it." |
| Features reasons | "Off for everyone" · "At internal; this organization is standard" · "Not in Starter; in Growth and Enterprise" · "Released through an override until 31 Jan 2027" · "From the Enterprise trial (ends 2 Jan 2027)" · "Needs Sales and Finance" · "Core: in every plan" · "Early access (pilot)" |
| Reason field | Label "Reason" · helper "Kept in Vento's activity. The customer doesn't see it." · error "Add a reason so the activity says why." |
| Stage confirm | Title "Move Sales to pilot?" · body: preview lines · **Move Sales to pilot** |
| Kill switch confirm | Title "Turn off Sales for everyone?" · "It stops for all 41 organizations, including overrides and plans. Nothing is deleted." · **Turn off Sales** |
| Plan confirm | Title "Move Lekki Partners Ltd to Growth?" · "Lekki Partners Ltd has 7 active projects; Growth includes 5. Nothing is archived, but they can't add projects." · **Move to Growth** |
| Trial confirm | Title "Start a 30-day Enterprise trial?" · "Lekki Partners Ltd gets Enterprise features and limits until 26 Dec 2026. Owners get an email 7 days and 1 day before it ends." · **Start 30-day trial** |
| Release group confirm (internal) | "Internal organizations get every feature with no limits. Use only for Vento's own organizations." · **Move to internal** |
| Toasts | "Sales is now at pilot. Takes effect within 30 seconds." · "Sales is now off for everyone." · "Lekki Partners Ltd is now on Growth." · "Enterprise trial started, ends 26 Dec 2026" · "Projects limit set to 8" · "Override cleared" · "Growth v3 published" · "Tunde Bello is now a super-admin" |
| Conflict | "Sales moved to pilot a moment ago (by Ada). Check the preview and try again." |
| Network | "Couldn't reach Vento. Your change wasn't made. Try again." |
| Publish review | "2 features added, 1 removed. 47 organizations stay on Growth v2 until you move them." · **Publish Growth v3** |
| Super-admins | **Add super-admin** · "No second approver is needed while there are fewer than 4 super-admins." · confirm **Make Tunde a super-admin** / **Remove Tunde** |
| Activity tag | "Command line" (rose) · "Console" |
| Command refused | "Make this change in the Vento console. If the console is down, add --break-glass." |
| Break-glass email | Subject "Sales moved to off from the command line" · "Ada Okafor moved Sales to off on api-1 at 21:14 on 26 Nov 2026. Reason: Receipt allocation bug. If you didn't expect this, check the Activity page." |
| Super-admin email | Subject "You're now a Vento super-admin" · "Tunde, Ada made you a Vento super-admin. Open the console from your user menu. You'll need your passkey or authenticator code each time." |
| Slice 2: permission (owner) | Checkbox "Let Vento support see our account for 7 days" · card line "Vento support can see your account until 3 Dec 2026." · **End access** · off: "Vento support can't see your account." · **Let Vento support in** |
| Slice 2: open view | Title "Open a read-only view of Lekki Partners Ltd?" · "Reason (Olumide will see this)" · **Open read-only view** · no permission: "Lekki Partners Ltd hasn't let Vento support in. Ask the owner to allow it from Talk to Vento." |
| Slice 2: banner | "Support view of Lekki Partners Ltd · read-only · ends 15:40" · **Leave** · disabled tooltip "Read-only support view" |
| Slice 2: customer audit | "Vento support viewed your account from 14:40 to 15:05. Reason: Checking why invitations to two people bounced." |
| Slice 2: owner email | Subject "Vento support is looking at your account" · "Reason: Checking why invitations to two people bounced. Access ends by 15:40. You can end it now." · **End access** |

## Out of scope
- **Billing:** prices, invoices, payment state, dunning. The Plan card shows no price until billing exists.
- **Writing as the customer** (impersonation with write access), and support views of the buyer or realtor portals. Support is read-only, always.
- **Editing customer data from the console** (members, companies, roles, two-step resets for customers). Owners and admins do that in their workspace; support guides them.
- **A second approver** for platform changes (settled: not while fewer than four super-admins).
- **Bulk changes** (move all Growth v2 organizations to v3; stage many flags at once), scheduled stage changes, percentage rollouts.
- **Platform roles below super-admin** (read-only staff, support-only staff). One role while the team is small.
- **Exporting** the platform trail; streaming it off the database is RUNBOOK §2, not a screen.
- **Failed jobs, AI usage, statutory defaults, system health:** slices 3, 4 and later, as above.
- **A separate admin host name** (owner's decision 1).
- **Restricting super-admins to `@ventoerp.com` addresses** (owner's decision 8): later, once Vento has domain mailboxes.

## Owner's decisions (26 Nov 2026)
1. **Where the console lives:** `app.ventoerp.com/console`, a separate area on the same origin with its own shell and fresh two-step. Passkeys work there with no new decision; one deploy.
2. **Support view needs the owner's permission first:** yes, 7 days per permission, given in one click from **Talk to Vento** or the Security card, ended at any time.
3. **What the customer sees about a support view:** "Vento support", the reason, and the start and end times in their audit trail, plus an email to owners when a view opens. No staff name (decision 0015).
4. **The command line after the console:** change commands refuse without `--break-glass`, and every break-glass change emails all other super-admins. Bootstrap, read commands and the daily trial job stay as they are.
5. **Slicing:** slice 1 (console core) now; slice 2 (support view) straight after, before brick 4; failed jobs with the first queued work; AI usage with the first AI feature.
6. **Console window length:** fresh passkey or code to enter, then 15 minutes idle or 8 hours, whichever is first.
7. **Publishing plan versions in the console:** yes, in slice 1, as a two-step sheet, so the console fully replaces `plans publish --from file.json`.
8. **Who can be a super-admin:** for now, any existing account with two-step on, as today. Restricting super-admins to `@ventoerp.com` addresses is **deferred** until Vento has domain mailboxes; it then becomes a per-environment setting (allowed domain) checked when a super-admin is added, from the console and the command line.
