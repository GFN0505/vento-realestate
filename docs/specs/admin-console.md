# Vento Real Estate console (super-admin)

- **Status:** in build. Approved by the owner on 26 Nov 2026; slice 1 (console core) is built on `feat/admin-console` and becomes `shipped` when it merges. **Slice 1b** (owner, 27 Nov 2026: staff accounts and invitations, a Dashboard with customer activity, My account in the console, "Vento Real Estate" naming and the `realestate.ventoerp.com` domain) is added on top of slice 1 in the same PR (#9), before merge, and is **built on the branch, awaiting review** (shared e0780d8, screens 7167fdc and f4c5cf0, API c2d92a8; e2e specs and the naming sweep being finished); slice 1 as built stays. Slice 2 (support view) is not planned yet. Plan: [admin-console](../plans/admin-console.md) (the architect amends it for 1b); decision [0021](../decisions/0021-the-console-is-a-separate-area-behind-fresh-two-step.md).
- **Module:** Platform
- **Journeys:** J-ADM-01 and J-ADM-02 (changed: console first, commands as fallback), J-ADM-03 (new; changed in 1b: invite rather than add), J-ADM-05 (new in 1b: join as a super-admin), J-ADM-06 (new in 1b: start the day on the Dashboard), J-ADM-07 (new in 1b: manage my staff sign-in), J-ADM-04 (new, slice 2: look at a customer's account with their permission), J-ONB-11 (new, slice 2: an owner lets Vento Real Estate support see their account)
- **Screens:** see [Screens this spec touches](#screens-this-spec-touches)
- **Decisions:** builds on 0015 (platform configuration outside organizations; trust model until the console), 0016 (availability in the contract, snapshot within 30 seconds), 0019 (passkeys count as two-step; passkeys bound to the web app's host), 0013 (tab guard), 0018 ("company" on screen). New record [0021](../decisions/0021-the-console-is-a-separate-area-behind-fresh-two-step.md) "The console is a separate area on the same origin, behind fresh two-step" (amends 0015's trust model); slice 2 still needs "Support view is read-only by declaration". Slice 1b adds [0022](../decisions/0022-the-product-is-always-called-vento-real-estate.md) "The product is always called Vento Real Estate" and [0023](../decisions/0023-staff-accounts-are-separate-from-customer-accounts.md) "Staff accounts are separate from customer accounts and join by invitation" ([details](#decision-records-needed-for-the-architect)).
- **Release plan:** [section 8](../release-plan.md#8-build-order): built right after brick 3d (owner, 26 Nov 2026)
- **Builds on:** [feature-flags](feature-flags.md). Every rule, warning, confirmation and audit event there still holds; this spec only changes *how* a super-admin makes the change.

> **Reading this spec after 1b.** Slice 1 below is unchanged except where 1b contradicts it; each such place is marked *(1b)* and the full 1b rules are in [Slice 1b](#slice-1b-staff-accounts-staff-invitations-dashboard-and-naming-owner-27-nov-2026). Prose says "Vento" or "Vento staff" for the company; every user-visible string is quoted in full as "Vento Real Estate" ([naming rule](#4-naming-always-vento-real-estate)).

## Problem
Ada runs Vento's releases and customer accounts. Today every change is a shell command on the API host: she types an organization's exact name, a flag key and her own email as `--by`, and the platform trail can only *say* it was her, because anyone with a shell can type any super-admin's email. When Sales breaks on a Friday night she needs a laptop, a VPN and the host, not her phone. When Olumide at Vento Homes asks "why can't my team see Commissions?", she has to run three commands and work out the availability rule in her head. And when a customer asks for help, nobody at Vento can see what they see without asking for their password, which nobody should ever do. Vento staff need one place, clearly separate from any customer's workspace, where a signed-in super-admin can release features, manage plans, trials and deals, see why an organization has what it has, and (with the customer's permission) look at their account read-only, with every action tied to a real two-step sign-in.

## Persona and job
| Who | Job | How often |
|---|---|---|
| **Vento super-admin** (Ada, product and releases; Tunde, customer success) | Release a feature stage by stage, kill a broken one, put an organization on a plan, start or end a trial, record a deal, add AI, answer "why doesn't this customer have X?"; *(1b)* check how customers are doing on the Dashboard; invite other super-admins | Releases every few weeks; plan and trial changes weekly once selling; the kill switch rarely, and from wherever they are; the Dashboard daily |
| **Invited staff member** *(1b)* (Chika, a new hire) | Join the console from an emailed invitation, with a password and two-step, no customer sign-up | Once |
| **Vento super-admin, on support** (slice 2) | See exactly what a customer sees to answer a question or reproduce a problem, without being able to change anything | A few times a week once selling |
| **Organization owner** (Olumide Bankole) | Know what Vento Real Estate changed on their account, and decide whether Vento Real Estate support may look at it (slice 2) | Rarely |
| **Every other member** | Nothing. The console doesn't exist for them. | Never |

## Success looks like
- **Kill switch from a phone in 4 taps and under 30 seconds** (open the console already signed in → Releases → the feature → **Turn off for everyone** → reason → confirm), effective for every user within **30 seconds**, as today.
- **Every change command has a console equivalent** that calls the same operation, shows the same preview lines and warnings, and writes the same platform and organization audit events. A parity test lists every change command and fails if one has no console procedure.
- **Zero `--by`:** every console change is attributed to the signed-in super-admin, and the platform trail records it came from the console, with device and masked IP.
- **Zero console procedures callable** without an active super-admin whose two-step was proven within the console window. A walk test calls every console procedure as a customer owner, as a super-admin without fresh two-step and as a revoked super-admin, and expects *not found* each time.
- **"Why doesn't Lekki Partners have Commissions?" answered in 2 clicks** from the console home (search → organization → the feature's row says why). *(1b: the home is the Dashboard, which has the organization search.)*
- **Customers never download console code:** the console is its own lazy-loaded bundle; the customer first-load budget (< 200 KB gzip) doesn't move.
- Usable at **375 px** (designed on [AdminOrgsMobile](../design/claude-design/AdminOrgsMobile.dc.html)), **WCAG 2.2 AA** in light and dark.
- Slice 2: **a support view writes nothing** in the customer's data. A walk test calls every write procedure in a support view and expects it refused before any read or write.
- Slice 1b success measures are in [its section](#success-looks-like-1b).

## What's in this brick, and what follows
The owner named six things (section 8 of the release plan). Two of them have no data yet, and one needs its own security review. Building screens without data would mean placeholder numbers, which the owner's "Soon only in internal organizations" rule already rejects for customers; the same standard applies here.

| Slice | Contents | Why then |
|---|---|---|
| **1 · This brick: the console core** | Separate console area, sign-in with fresh two-step, **Organizations** (list and detail with "why" per feature), **Releases** (flags, stages, release groups, release overrides), **Plans** (list, versions, publish a new version), trials, add-ons and entitlement overrides, **Super-admins**, **Activity** (platform audit trail). Change commands retire to break-glass. | All data exists (`feature_releases`, `plans`, `plan_versions`, `organization_*`, `platform_admins`, `platform_audit_events`), and every operation is already a function the commands call (`apps/api/src/platform/operations`). This replaces `--by` with real sign-in, which is the security gap the 0015 review left open. |
| **1b · Same PR, on top of slice 1** (owner, 27 Nov 2026) | Staff-only accounts; **Invite super-admin** and the staff sign-up; sign-in lands on a new **Dashboard** with customer activity; **My account** in the console; an **Account activity** card on organization detail; "Vento Real Estate" everywhere; domain `realestate.ventoerp.com`; a small clarity fix for moving a feature between plans. | The owner reviewed the running console: staff shouldn't sign in through a customer organization, staff join differently from customers, other Vento products exist, and the console needs a proper home. "MVP state, not half-baked", then back to customer modules. |
| **2 · Support view** (next, before brick 4) | Owner's permission, read-only support view with a banner, page-level logging, customer audit entry and email. | Needs every customer procedure to declare `read` or `write` and a walk test to enforce it. That's cheapest now, while customer procedures are only team, roles, companies and security; after the module bricks it means auditing hundreds. It's also a separate security review (the security agent audits it, as with 3d). |
| **3 · Failed jobs** | The [AdminJobs](../design/claude-design/AdminJobs.dc.html) screen: failed, retrying, needs customer; retry; health line on organization detail. | **No job system exists yet.** Emails send inline (Postmark) and `plans notify-trials` runs from cron with no record. Built with the first queued work (bank import, reminders or WhatsApp), which also defines the jobs table this screen reads. |
| **4 · AI usage** | *Usage and AI* page, AI columns and stat cards on Organizations, AI cards on organization detail. | **No `ai_usage` records exist yet**; they arrive with the AI gateway (`ai-features` skill). Built with the first AI feature. |
| **Later** | Billing facts on the organization (next invoice, payment failed), statutory defaults, second approver. | With the *Billing and plan* screen, the first statutory rules, and the fourth super-admin respectively. The full list is the [Console backlog](#console-backlog-later). |

The console's navigation shows only built sections (the 3a rule): slice 1 has **Organizations · Releases · Plans · Activity · Super-admins**; *(1b)* **Dashboard** comes first, and **My account** is in the user menu. No "Failed jobs" or "Usage and AI" entry appears until its slice ships.

## Where the console lives
- **One area, `/console`, on the web app's own origin** (`realestate.ventoerp.com/console`; *(1b)* the product lives at `realestate.ventoerp.com`, earlier docs said `app.ventoerp.com`). Same origin means passkeys work there (decision 0019 binds them to the web app's host) and there's one deploy. It's still a different place: its own shell, its own API router and its own session check. (`/admin` is avoided because *admin* is a customer role.)
- **Its own shell.** Navy sidebar with the Vento Real Estate lockup and a fixed amber label **Vento Real Estate staff · all customers** (as on the boards), no company switcher, no organization switcher, no customer modules, no ⌘K customer actions. Browser tab title "{page} · Vento Real Estate console". On phones: four bottom tabs (Organizations, Releases, Plans, More); *(1b)* Dashboard, Organizations, Releases, More, with Plans moving into More.
- **How a super-admin gets there.**
  - ~~The user menu shows **Vento console** to active super-admins only. ⌘K offers **Open Vento console**.~~ *(1b: removed. Super-admins are staff accounts with no workspace, so no customer menu ever shows a console entry.)*
  - ~~A super-admin who belongs to no organization lands on the console after sign-in instead of onboarding.~~ *(1b: every super-admin signs in on the normal sign-in page and lands on the console **Dashboard**.)*
  - ~~From the console, the user menu offers **Back to {organization}**.~~ *(1b: removed; the user menu offers **My account**, theme and **Sign out**.)*
- **For everyone else, `/console` doesn't exist:** *404*, not *403*, for signed-out people, customers, and revoked super-admins. The console bundle is never requested for them.
- **Never mixed:** no console data appears in a customer workspace, and no customer workspace data appears in the console in slice 1 beyond the facts listed under [Organization detail](#organization-detail) *(1b: and the account-level facts on the [Dashboard](#2-dashboard-with-customer-activity))*. ~~A super-admin's membership in Vento's internal organization gives them nothing extra there.~~ *(1b: super-admins aren't members of any organization.)*

## Sign-in and two-step
- **Who:** an active row in `platform_admins` **and** two-step on (the authenticator app; decision 0019: where two-step is required, the app is set up, and a passkey is the fast path on top). *(1b: on a **staff account**, created only by accepting a staff invitation, or the bootstrap invitation on an empty environment; see [Staff accounts](#1-staff-accounts).)*
- **Two-step can't be turned off by a super-admin:** *(1b: on My account in the console)* two-step shows "Required for Vento Real Estate staff" and no **Turn off** button.
- **Fresh two-step to enter.** Opening the console asks *Confirm it's you* with a **passkey** or an **authenticator code** (backup codes work too), never the password alone, unless the person proved a second factor in the last 5 minutes (for example, they just signed in with a passkey or a code). The proof opens a **console window** on this session.
- **Console window:** ends after **15 minutes without console activity** or **8 hours** after it opened, whichever is first, and at once when the person signs out, their session ends, or they're revoked. ~~Customer pages in the same session keep the normal rules.~~ *(1b: staff sessions have no customer pages.)* When the window ends mid-task, the next action opens *Confirm it's you* over the page; the dialog, the typed reason and the choice stay, and the action runs after the proof.
- **No extra code per action.** Confirmation dialogs (with reason) are the safeguard for each change; the console window is the authentication.
- **The architect's to settle:** the session today records when the password was confirmed (`reauthenticatedAt`), not when a second factor was. The console needs the latter (`secondFactorAt` or a separate console grant row); a test pins that a password-only confirmation never opens the window.

## How `--by` is replaced
- **Console changes:** the actor is the signed-in super-admin; `actorUserId` and `actorName` come from the session, never from input. The platform audit event's operator becomes `console · {device and browser} · {masked IP}` (for example "console · Chrome on Mac · 102.89.••.14"), with `channel: console`.
- **Change commands become break-glass.** Once this brick ships, `pnpm flags|plans|superadmin` change commands refuse unless run with `--break-glass` (plus `--reason` and `--by`, as now). A break-glass change is tagged `channel: command`, keeps the operator as today, and **emails every other active super-admin** at once ("Sales was moved to off from the command line by ada@ventoerp.com on api-1"). Use: the console or sign-in is down.
- **Unchanged:** read commands (`list`, `show`), `plans bootstrap` and ~~`superadmin grant --bootstrap`~~ *(1b: `superadmin invite --bootstrap`)* on an empty environment, and the scheduled `plans notify-trials` (`VENTO_CRON=1`).
- *(1b)* `superadmin grant` becomes `superadmin invite` ([Bootstrap and break-glass](#bootstrap-and-break-glass)).
- `docs/RUNBOOK.md` and decision 0015's trust-model section are updated: host access stays limited to super-admins, but day-to-day changes need a real sign-in.

## The console, screen by screen (slice 1)

### Dashboard *(1b)*
The console home from 1b, at `/console`. See [Slice 1b §2](#2-dashboard-with-customer-activity).

### Organizations (console home)
*(1b: no longer the home; moves to `/console/organizations` and is otherwise unchanged.)*
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
- **Account activity card** *(1b)*: people active in the last 7 days and this organization's notable account events for 30 days ([§2](#2-dashboard-with-customer-activity)).
- **Facts only.** The detail page shows the owner's name and email, counts and dates. It never shows members' names, buyers, money, documents or KYC. Those need a support view (slice 2), with permission.

### Changes on an organization (sheets and confirms)
Each change is a side sheet with the fewest fields, a required **Reason**, and a confirm step that shows the same preview lines the command prints today (from the same `preview*` functions). The primary button names the change.
| Change | Fields (defaults) | Confirm shows |
|---|---|---|
| **Change plan** | Plan (current preselected), version (latest; "Use an older version" under More options) | Over-limit warning, features gained and lost by name, records that drop out of view |
| **Start trial** | Plan (the next plan up), days (30) | End date; "Owners get an email 7 days and 1 day before it ends" |
| **End trial** | – | Features that stop; records that drop out of view |
| **Add AI / Change AI budget** | Monthly budget in naira (₦150,000) | "Owners can then switch AI features on in Settings → AI". Change is one step for the super-admin: today's operations need remove then add, so the architect adds a change-budget operation (one transaction, one audit event, "Vento Real Estate changed your AI budget to ₦250,000 a month") |
| **Remove AI** | – | AI features that stop |
| **Change release group** | Standard / Pilot / Internal | Features gained or lost by name; for Internal: "Internal organizations get every feature with no limits. Use only for Vento Real Estate's own organizations." |
| **Add override** | Kind (Release / Plan), feature or limit, value (on / off, or a number / unlimited), until (empty = no end date) | Prerequisite warnings, kill-switch note when the feature is off |
| **Clear override** | – | What applies after ("Projects limit goes back to Growth's 5") |

### Releases
No design: built from the *list page* and *detail page* archetypes (status `pattern`). Designers get the flag list for the next pass.
- **List:** every catalog feature: name and key · module · stage (Off rose · Internal slate · Pilot blue · On emerald) · organizations that have it · plans that include it ("Growth, Enterprise"; "Core"; "AI add-on"; "None" in amber). Chips: All · Off · Internal · Pilot · On · In no plan. A banner when data holds keys the code no longer has: "2 keys in data are no longer in the code and are ignored: sales.old_reports, ai.summaries."
- **Feature detail:** header with name, key, one-line description and stage. **Stage** control (Off · Internal · Pilot · On) with the current one selected. Below: Needs (prerequisites), Included in (plans), Organizations that have it grouped by Internal / Pilot / Standard (names link to detail), Overrides (live), Recent changes. A separate destructive **Turn off for everyone** at the foot, always visible, so the kill switch is never inside a menu. *(1b: "Included in" names each plan as a link, adds "Not in", and a line on how to change it; see [§3](#3-moving-a-feature-between-plans-and-stages).)*
- **Moving a stage:** pick the stage → confirm dialog with the preview ("Sales will be available to 3 organizations (1 internal, 2 pilot).", the in-no-plan warning, "Lekki Partners Ltd has 214 records in Sales. Its members will stop seeing them.") → Reason → **Move Sales to pilot**.

### Plans
No design (status `pattern`, also `needs-design`: it's the one screen with a real editor).
- **List:** each plan with latest version, organizations per version, "Default for new organizations" tag.
- **Plan detail:** versions side by side with the latest first: features (grouped by module, core features collapsed as "Core: in every plan"), limits, organizations on each version (link to Organizations filtered).
- **Publish new version** (side sheet, stepped): (1) features as checkboxes grouped by module, starting from the latest version; limits as number fields with "Unlimited"; (2) **review**: what's added and removed compared with the latest version, and "47 organizations stay on v2 until you move them"; Reason → **Publish Growth v3**. Name, sort order and "Default for new" are under More options. Publishing never moves anyone.
- **Move organizations to the new version** is per organization (**Move to v3** on its detail page), as today. A bulk move is out of scope.

### Super-admins
No design (status `pattern`).
- List: name, email, since, granted by, last console activity. ~~**Add super-admin** (email of an existing Vento account with two-step on)~~ *(1b: **Invite super-admin** (email, name, reason), an **Invitations** section, and ⋯ **Reset two-step**; see [Super-admins page (1b)](#super-admins-page-1b))* and ⋯ **Remove**. Nobody can remove themselves; there's always at least one.
- A line under the list: "No second approver is needed while there are fewer than 4 super-admins." When a fourth is added, the confirm says: "This is the fourth super-admin. The owner asked for a second approver from now on; that's not built yet." *(1b: counted at invitation, active plus invited.)*

### Activity
No design: *list page* (status `pattern`). Vento's platform audit trail: when, who, what (in words: "Moved Sales to pilot"), organization or feature, before → after, reason, console or command line. Filters: person, organization, feature, kind, date. Break-glass entries carry a rose **Command line** tag. Read-only, append-only, no export in slice 1. *(1b adds the staff-invitation kinds.)*

### My account *(1b)*
See [My account in the console](#my-account-in-the-console).

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
3. Toast "Lekki Partners Ltd is now on Growth." The owner's audit trail reads "Vento Real Estate moved your organization to Growth".

**Start a trial: 4 clicks** — Organization → ⋯ (1) → **Start trial** (2) → Enterprise and 30 days preselected (3) → reason → **Start 30-day trial** (4).

**Record a deal: 5 clicks** — Organization → ⋯ → **Add override** → Plan · Projects limit · 8 → reason → **Set projects limit to 8**.

**Why doesn't this organization have X? 2 clicks** — Search → organization (1) → Features card, filter **Not available** (2): "Commissions · Not in Starter; in Growth and Enterprise".

~~**Add a super-admin (J-ADM-03): 3 clicks** — **Super-admins** → **Add super-admin** (1) → email (2) → reason → **Make Tunde a super-admin** (3).~~
**Invite a super-admin (J-ADM-03, 1b): 3 clicks** — **Super-admins** → **Invite super-admin** (1) → email, name, reason → **Review** (2) → **Send invitation** (3).

**Join as a super-admin (J-ADM-05, 1b): 5 clicks from the email** — **Accept invitation** (1) → name, password → **Continue** (2) → scan, code → **Verify code** (3) → **I've saved them** (4) → **Add passkey** or **Skip for now** (5) → Dashboard.

**Start the day (J-ADM-06, 1b): 0 clicks** — sign in → Dashboard.

## Acceptance criteria

### Reaching the console
- ~~**Given** an active super-admin with two-step on, **when** they open the user menu or ⌘K, **then** they see **Vento console**;~~ *(1b)* **Given** anyone who isn't an active super-admin (including an organization owner, an admin, and a revoked super-admin), **then** no console entry exists anywhere in the customer app and `/console` and every path under it shows *404* without loading the console bundle.
- ~~**Given** a super-admin with no organization membership, **when** they sign in, **then** they land on the console…~~ *(1b)* **Given** a staff account, **when** they sign in (password and code, backup code, or passkey), **then** they land on the console **Dashboard** with no *Confirm it's you* (they just proved two-step), never on onboarding or a workspace; opening any customer path sends them to `/console`.
- **Given** the console, **then** no company or organization switcher, customer module, customer ⌘K action, setup checklist, or role preview appears, and the amber label "Vento Real Estate staff · all customers" is visible on every page at every width.

### Two-step and the console window
- **Given** a super-admin who signed in with a password and code or a passkey less than 5 minutes ago, **when** they open the console, **then** no extra step is asked.
- **Given** a super-admin whose last second-factor proof is older than 5 minutes, **when** they open the console, **then** *Confirm it's you* asks for a passkey or a code; the password alone is never enough. Five wrong codes lock sign-in as today (DOMAIN access rules).
- **Given** a console window idle for 15 minutes or open for 8 hours, **when** the super-admin acts, **then** *Confirm it's you* opens over the page, keeps the open dialog and typed reason, and runs the action after the proof.
- **Given** a super-admin removed by another super-admin, **when** they make their next console request, **then** it answers *not found* and their console window ends. ~~…and their customer workspace sessions carry on unaffected.~~ *(1b: removal closes the staff account and ends every session.)*
- ~~**Given** an owner or admin of an organization a super-admin belongs to, **when** they try to reset that super-admin's two-step, **then** it's refused: "Vento staff reset two-step with Vento."~~ *(1b: super-admins belong to no organization; another super-admin resets their two-step in the console.)* A super-admin without two-step sees "Set up two-step to use the Vento Real Estate console." with **Set up two-step**.
- **Given** a super-admin on ~~My security~~ *(1b: My account)*, **then** two-step shows "Required for Vento Real Estate staff" and can't be turned off.

### Parity with the commands
- **Given** any change the commands support (`flags stage | group | override`, `plans publish | assign | trial | trial --end | addon | addon --remove | override feature | override limit | … clear`, `superadmin grant | revoke` *(1b: `superadmin invite | revoke`)*), **then** the console has a procedure that calls the same operation in `apps/api/src/platform/operations`, inside the same transaction, writing the same platform and organization audit events. The parity test fails if a change command has no console procedure.
- **Given** a change, **then** its confirm shows the same preview lines and warnings as the command (shared functions, not copied strings): stage preview with organization counts by group; "in no plan"; prerequisites missing; records that drop out of view; over a limit after a plan change; already at that stage.
- **Given** a change, **then** a reason is required (trimmed, at least 3 characters) and the confirm button stays disabled without one.
- **Given** a successful change, **then** the toast says what changed and "Takes effect within 30 seconds" where it affects availability, and every API server applies it within 30 seconds (unchanged mechanism).
- **Given** the command line after this brick ships, **when** a change command runs without `--break-glass`, **then** it refuses: "Make this change in the Vento Real Estate console. If the console is down, add --break-glass." With `--break-glass`, the change runs as today, is tagged `command`, and every other active super-admin is emailed.

### Conflicts and errors
- **Given** two super-admins with the same feature open, **when** one moves Sales to pilot and the other then confirms a move to on, **then** the second is refused with "Sales moved to pilot a moment ago (by Ada). Check the preview and try again." and the page refreshes. Every change carries the before-state it was previewed against.
- **Given** an override "until" date in the past, a non-number limit, a budget of zero, or a trial of 0 or more than 90 days, **then** the field says what's needed and nothing is sent.
- **Given** an operation error (for example "Lekki Partners Ltd already has a trial ending 2 Jan 2027."), **then** the console shows the operation's own plain message in the dialog; no codes or stack traces. Some operation messages name command flags today ("End it first with plans trial … --end", "--days must be…", "Run the command again"); the operation returns the fact and each channel adds its own next step ("End it first" with an **End trial** link in the console).
- **Given** a network failure while confirming, **then** the dialog stays open with the reason kept and "Couldn't reach Vento Real Estate. Your change wasn't made. Try again."; retrying never applies a change twice (idempotency key per confirm).

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
- ~~**Given** an email with no Vento account, or an account without two-step, **then** adding is refused…~~ *(1b: replaced by the [staff invitation criteria](#acceptance-criteria-1b).)*
- **Given** a super-admin removing themselves, **then** there's no **Remove** on their own row (and the API refuses: "You can't remove yourself. Ask another super-admin.").
- **Given** a new super-admin, **then** ~~they're emailed "You're now a Vento super-admin" and~~ *(1b: they joined through the staff sign-up, so they need no "you're now" email)* every other super-admin gets a short notice; on removal, the person and the others are emailed.

### Customers
- **Given** any change made in the console, **then** the affected organization's audit trail gets the same plain-words entry as from the command ("Vento Real Estate moved your organization to Growth"), actor "Vento Real Estate", never the staff member's name or Vento's internal reason (decision 0015).
- **Given** an organization owner, **then** nothing in their workspace changes in slice 1 except those audit entries.

### Isolation
- **Given** console procedures, **then** they live on a separate platform router with its own middleware (session → active super-admin → two-step on → console window), never on `memberMiddleware`, and carry no `organizationId` from the session; an organization is always named by ID in the input. The 0016 walk test is extended: every console procedure is on the platform router, and no customer procedure is.
- **Given** a customer procedure, **then** being a super-admin changes nothing about it.

## Support view (slice 2)
Specified here so slice 1 doesn't paint it into a corner; built and security-reviewed as its own slice.

**Rules**
1. **Only with the owner's permission.** Under the NDPA Vento processes customers' buyer and staff data on their instructions, so support looks only when an owner says so. An owner gives permission for **7 days** in one click: in **Talk to Vento Real Estate** (a checkbox "Let Vento Real Estate support see our account for 7 days", ticked by default when they open it from a problem) or on *Organization profile → Security* (**Let Vento Real Estate support in**). They can end it at any time; it ends by itself after 7 days.
2. **Opened by a super-admin, for a reason the customer will read**, for at most **60 minutes** at a time (**Open support view** on organization detail → reason → **Open read-only view**). It opens the customer workspace in a new tab with an amber banner on every page: "Support view of Lekki Partners Ltd · read-only · ends 15:40" and **Leave**.
3. **Sees what an owner sees, on screen only.** Every page and record an owner can view, across every company. Never: ID numbers revealed (masked, no reveal), identity documents or any file downloaded, exports, PDFs generated for download, My security or anyone's sessions or passkeys, or the buyer and realtor portals.
4. **Changes nothing.** Every customer procedure declares `read` or `write` in the contract (like `meta.feature`); in a support view every `write` answers FORBIDDEN `support_read_only` before it reads or writes anything. Reads with side effects (marking notifications read, last active, setup checklist "hide", known devices) are skipped. Action buttons stay in place, disabled, with the tooltip "Read-only support view", so support sees the layout the customer sees.
5. **Not a member.** The support viewer isn't in Team, doesn't take a place on the plan, doesn't appear as anyone's "last active", and gets no notifications or emails.
6. **Logged twice.** Platform trail: opened (who, reason, organization), every page viewed (route and record ID, never content), closed (how: left, timed out, permission ended, revoked). Customer trail: "Vento Real Estate support viewed your account from 14:40 to 15:05. Reason: Checking why invitations to two people bounced." Owners are emailed when a view opens ("Vento Real Estate support is looking at your account") with **End access**.
7. **Ends** on **Leave**, after 60 minutes, when the owner ends permission (within 30 seconds), or when the super-admin's console window ends or they're removed.

*(1b note: a staff account has no workspace of its own, so the support view is the only way a super-admin ever sees a customer workspace; the architect plans it as a session scoped to one organization.)*

**Acceptance (summary; full set in the slice 2 plan):** a walk test calls every `write` procedure in a support view and expects refusal with no rows touched; a test fails if a customer procedure lacks `read` or `write`; a view can't open without a live permission; the banner is on every page at every width; a support viewer's request carries both the super-admin and the organization in its audit context; ending permission closes an open view within 30 seconds.

## Behind the scenes
- **Data:** no new platform tables in slice 1 except what the architect needs for the console window (a column on `sessions` or a `console_grants` row). `platform_audit_events` gains `channel` (`console` | `command` | `scheduled`) in metadata or a column. Slice 2 adds `support_permissions` (organization-scoped, owner, from, until, ended) and `support_views` (organization-scoped, super-admin, reason, opened, closed, how), and page views in the platform trail or a sibling append-only table, with the same `REVOKE UPDATE, DELETE` as `platform_audit_events` (RUNBOOK §1). *(1b: staff invitations (email, name, invited by, token hash, expiry, status, last sent); a way to mark an account as staff; an index on `audit_events (action, created_at)` for the Dashboard feed. No new customer tracking.)*
- **API:** a `platform` oRPC router with `superAdminMiddleware`; every procedure calls an existing operation. `CommandError` messages become the procedure's error message (they're already plain words); rename to `PlatformError` is the architect's call. *(1b adds `dashboard.get`, `organizations.accountActivity`, `superAdmins.invite | resend | withdraw | resetTwoStep`, and public, rate-limited `staffInvitation.get | accept`; My account reuses the personal `account.*` procedures, which need no membership.)*
- **Idempotency and concurrency:** each confirm sends an idempotency key and the previewed before-state; the operation refuses with CONFLICT if the state moved.
- **Emails (Postmark, decision 0017):** break-glass change (to other super-admins), super-admin added or removed (to the person and the others). *(1b: staff invitation; notices to other super-admins on invite, join, two-step reset and removal; password link on reset. Sender "Vento Real Estate".)* Slice 2: support view opened (to owners).
- **Web:** `/console` is a separate route tree and lazy chunk with its own shell; ~~preloaded on hover of **Vento console** for super-admins only~~ *(1b: staff land on it after sign-in; Organizations moves to `/console/organizations`; adds `/console/account` and the public staff sign-up route outside `/console`)*.
- **Commands:** change commands require `--break-glass` (see above); `RUNBOOK.md` §3 and §4 and `ARCHITECTURE.md`'s commands row are updated. *(1b: `superadmin invite` replaces `grant`; bootstrap prints a link.)*

## Screens this spec touches
Rows to add or change in `docs/design/SCREENS.md` §15 (Design `–` unless named; Status `todo`):
| Screen | Design | Slice |
|---|---|---|
| Console shell: navy sidebar with "Vento Real Estate staff · all customers", bottom tabs on phones, user menu ~~with **Back to {organization}**~~ *(1b: with **My account**; Dashboard first; tabs Dashboard · Organizations · Releases · More)* | [AdminOrgs](../design/claude-design/AdminOrgs.dc.html) (sidebar) | 1, changed 1b |
| *Confirm it's you* for the console (passkey or code) and "Set up two-step to use the Vento Real Estate console" | – (pattern from My security dialogs) | 1 |
| **Dashboard**: four numbers, Needs attention, Customer activity, Plans and releases | – (role-home anatomy; needs-design) | 1b |
| Organizations list (replaces the row "Organizations list and detail…"; *1b: at `/console/organizations`*) | [AdminOrgs](../design/claude-design/AdminOrgs.dc.html), [AdminOrgsMobile](../design/claude-design/AdminOrgsMobile.dc.html) (with design changes) | 1 |
| Organization detail: Plan, Trial, Add-ons, Overrides, Features ("why"), Activity; *1b: Account activity* | [AdminOrgDetail](../design/claude-design/AdminOrgDetail.dc.html) (layout; with design changes) | 1, changed 1b |
| Organization change sheets and confirms: change plan, start or end trial, AI add-on, release group, override, clear override | – | 1 |
| Releases list and feature detail with stage control and **Turn off for everyone** (replaces "Feature flags: stage per flag…"); *1b: plan links and the "publish a new version" line* | – (needs-design) | 1, changed 1b |
| Plans list, plan detail, **Publish new version** stepped sheet (replaces "Plans: contents, limits, versions") | – (needs-design) | 1 |
| Super-admins list, ~~add~~ and remove; *1b: **Invite super-admin** sheet, Invitations section (resend, withdraw), ⋯ Reset two-step* | – | 1, changed 1b |
| **Staff sign-up** (public): join, two-step and backup codes, passkey offer, bad-link states | – (pattern from SignUp and two-step set-up; needs-design) | 1b |
| **My account** (console): profile, sign-in, passkeys, sessions | – (pattern from [SecuritySettings](../design/claude-design/SecuritySettings.dc.html)) | 1b |
| Activity (platform audit trail) | – (pattern from [AuditLog](../design/claude-design/AuditLog.dc.html)) | 1 |
| Emails: break-glass change, super-admin added or removed; *1b: staff invitation, invited, joined and two-step reset notices* | – | 1, changed 1b |
| User menu and ⌘K: **Vento console** (super-admins only); My security "Required because you're a Vento super-admin" (§0 rows) *(1b: removed; staff have no workspace)* | – | 1, removed 1b |
| Customer *Invite people*: row problem for a staff email | – | 1b |
| Every screen, email and PDF: "Vento Real Estate" naming | – | 1b |
| Flag and plan commands: change commands need `--break-glass` (existing row); *1b: `superadmin invite`* | – | 1, changed 1b |
| Support permission: in **Talk to Vento Real Estate** and *Organization profile → Security* (§12 row) | – | 2 |
| Support view banner and disabled actions in the customer workspace | – | 2 |
| Email to owners: "Vento Real Estate support is looking at your account" | – | 2 |
| System health and failed jobs (existing row) | [AdminJobs](../design/claude-design/AdminJobs.dc.html) | 3 |
| AI usage and cost by organization and feature (existing row) | [AdminOrgDetail](../design/claude-design/AdminOrgDetail.dc.html) (per organization) | 4 |

### Design changes
To record in `docs/design/CHANGES.md` when built:
- **Organization detail, "Feature flags" card with on/off switches → "Features" card with the reason per feature.** A switch hides the model: a per-organization change is an override with a reason and an optional end date, and it can't beat `off`. Stages are Off / Internal / Pilot / On, not "GA / Beta".
- **"Entities" → "Companies"** in the table and Plan card (decision 0018); "Users" → "People" to match Team.
- **No billing or ticket facts yet:** "Next invoice", "Payment failed", "₦450,000 / month" and "Support tickets" are left out until billing and a ticket system exist; "Failed jobs" and AI cards and columns wait for slices 3 and 4.
- **Sidebar:** only built sections; "Usage & AI", "Failed jobs" and "Statutory defaults" appear with their slices.
- *(1b)* **The console home is a Dashboard** (role-home anatomy), not Organizations; its queue items leave when resolved instead of being ticked off.

## Changes to `docs/DOMAIN.md`
Platform table:
- **Add "Vento console":** "The staff-only area where super-admins manage releases, plans, trials, add-ons, overrides and super-admins. | At `/console`, its own shell, never inside a customer workspace. Needs a fresh two-step proof (passkey or code) and closes after 15 minutes idle or 8 hours."
- **Change "Vento super-admin" notes:** "…Two-step required and can't be turned off. Works in the Vento console; the commands are for break-glass only. Every change is attributed to the signed-in person…"
- **Change "Platform audit event" notes:** "Who, channel (console, command line, scheduled), operator (console device and masked IP, or the host user), before → after, reason."
- **Add "Break-glass change":** "A platform change made from the command line because the console is unavailable. | Needs `--break-glass`; every other super-admin is emailed."
- Slice 2: **add "Support permission"** ("An owner's permission for Vento Real Estate support to view the account read-only. | 7 days, ended by the owner at any time.") and **"Support view"** ("A super-admin's read-only look at a customer's workspace, with the owner's permission. | At most 60 minutes, reason required and shown to the customer; every page viewed is logged; changes nothing; never reveals IDs or downloads files.").

Access rules: add "**Console window:** opens with a passkey or code (not the password alone) and ends after 15 minutes without console activity or 8 hours, whichever is first."

**Slice 1b changes (exact):** see [Slice 1b · Changes to DOMAIN.md](#changes-to-domainmd-1b).

## Journey changes
- **J-ADM-01, J-ADM-02** (`docs/journeys/12-vento-admin.md`): steps become console steps (flows above); the commands become the fallback with `--break-glass`; the header's trust-model paragraph changes to "signed in with fresh two-step". Targets: 3 clicks for a stage change, 4 for the kill switch and a plan change. Tests: `e2e/console/releases.spec.ts`, `e2e/console/plans.spec.ts`; existing CLI tests stay. *(1b: step 1 is "sign in → Dashboard"; J-ADM-02 gains how to move a feature between plans.)*
- **J-ADM-03 (new):** ~~add~~ *(1b: invite)* and remove a super-admin; review activity. Test: `e2e/console/super-admins.spec.ts`; API: `apps/api/src/platform/console-access.test.ts` (walk test and console window).
- **J-ADM-04 (new, slice 2):** open a support view with the owner's permission. Test: `e2e/console/support-view.spec.ts`; API: `apps/api/src/platform/support-read-only.test.ts`.
- **J-ONB-11 (new, slice 2):** an owner lets Vento Real Estate support in and sees what it looked at.
- *(1b)* **J-ADM-05** join as a super-admin (`e2e/console/staff-sign-up.spec.ts`; API `apps/api/src/platform/console/staff-invitations.test.ts`), **J-ADM-06** start the day on the Dashboard (`e2e/console/dashboard.spec.ts`; API `apps/api/src/platform/console/dashboard.service.test.ts`), **J-ADM-07** manage my staff sign-in (`e2e/console/my-account.spec.ts`).
- Assumptions to confirm (for the journey file): `/console` as the path; 30 days as the default trial length and 90 as the maximum; ₦150,000 as the prefilled AI budget; reason at least 3 characters.

## UI copy
*(1b: every string below now says "Vento Real Estate" in full; 1b's own copy is in [its section](#ui-copy-1b).)*
| Where | Copy |
|---|---|
| Sidebar label | "Vento Real Estate staff · all customers" |
| User menu / ⌘K | ~~"Vento console" · "Open Vento console" · in the console: "Back to Vento Homes Ltd"~~ *(1b: console user menu: **My account** · theme · **Sign out**)* |
| Confirm it's you (console) | Title "Confirm it's you" · "Use your passkey or a code from your authenticator app to open the Vento Real Estate console." · **Use passkey** · **Use a code instead** · **Confirm** |
| Console window ended | "Your console session timed out. Confirm it's you to carry on. Your change is still here." |
| Two-step missing | "Set up two-step to use the Vento Real Estate console." · **Set up two-step** |
| My security (super-admin) | ~~"Required because you're a Vento super-admin"~~ *(1b: on My account: "Required for Vento Real Estate staff")* |
| Organizations header | "214 organizations · 3,912 people" |
| Organizations empty | "No organizations yet. They appear here when someone finishes signing up." |
| Filtered empty | "No organizations match these filters." · **Clear filters** |
| Plan card | "Growth v2" · "Growth v3 is available" · **Move to v3** · "Projects 7 of 5 · over the limit. Nothing is archived; new projects are refused." · "Internal: every feature, no limits" · "No plan" · **Choose a plan** |
| Trial card | "Enterprise trial · ends 2 Jan 2027 (9 days)" · **End trial** |
| Overrides empty | "No overrides. This organization gets exactly what its plan and release group give it." |
| Features reasons | "Off for everyone" · "At internal; this organization is standard" · "Not in Starter; in Growth and Enterprise" · "Released through an override until 31 Jan 2027" · "From the Enterprise trial (ends 2 Jan 2027)" · "Needs Sales and Finance" · "Core: in every plan" · "Early access (pilot)" |
| Reason field | Label "Reason" · helper "Kept in Vento Real Estate's activity. The customer doesn't see it." · error "Add a reason so the activity says why." |
| Stage confirm | Title "Move Sales to pilot?" · body: preview lines · **Move Sales to pilot** |
| Kill switch confirm | Title "Turn off Sales for everyone?" · "It stops for all 41 organizations, including overrides and plans. Nothing is deleted." · **Turn off Sales** |
| Plan confirm | Title "Move Lekki Partners Ltd to Growth?" · "Lekki Partners Ltd has 7 active projects; Growth includes 5. Nothing is archived, but they can't add projects." · **Move to Growth** |
| Trial confirm | Title "Start a 30-day Enterprise trial?" · "Lekki Partners Ltd gets Enterprise features and limits until 26 Dec 2026. Owners get an email 7 days and 1 day before it ends." · **Start 30-day trial** |
| Release group confirm (internal) | "Internal organizations get every feature with no limits. Use only for Vento Real Estate's own organizations." · **Move to internal** |
| Toasts | "Sales is now at pilot. Takes effect within 30 seconds." · "Sales is now off for everyone." · "Lekki Partners Ltd is now on Growth." · "Enterprise trial started, ends 26 Dec 2026" · "Projects limit set to 8" · "Override cleared" · "Growth v3 published" · ~~"Tunde Bello is now a super-admin"~~ *(1b: "Invitation sent to Tunde Bello")* |
| Conflict | "Sales moved to pilot a moment ago (by Ada). Check the preview and try again." |
| Network | "Couldn't reach Vento Real Estate. Your change wasn't made. Try again." |
| Publish review | "2 features added, 1 removed. 47 organizations stay on Growth v2 until you move them." · **Publish Growth v3** |
| Super-admins | ~~**Add super-admin**~~ *(1b: **Invite super-admin**)* · "No second approver is needed while there are fewer than 4 super-admins." · confirm ~~**Make Tunde a super-admin**~~ *(1b: **Send invitation**)* / **Remove Tunde** |
| Activity tag | "Command line" (rose) · "Console" |
| Command refused | "Make this change in the Vento Real Estate console. If the console is down, add --break-glass." |
| Break-glass email | Subject "Sales moved to off from the command line" · "Ada Okafor moved Sales to off on api-1 at 21:14 on 26 Nov 2026. Reason: Receipt allocation bug. If you didn't expect this, check the Activity page." |
| Super-admin email | ~~Subject "You're now a Vento super-admin" · "Tunde, Ada made you a Vento super-admin. Open the console from your user menu…"~~ *(1b: replaced by the staff invitation email)* |
| Slice 2: permission (owner) | Checkbox "Let Vento Real Estate support see our account for 7 days" · card line "Vento Real Estate support can see your account until 3 Dec 2026." · **End access** · off: "Vento Real Estate support can't see your account." · **Let Vento Real Estate support in** |
| Slice 2: open view | Title "Open a read-only view of Lekki Partners Ltd?" · "Reason (Olumide will see this)" · **Open read-only view** · no permission: "Lekki Partners Ltd hasn't let Vento Real Estate support in. Ask the owner to allow it from Talk to Vento Real Estate." |
| Slice 2: banner | "Support view of Lekki Partners Ltd · read-only · ends 15:40" · **Leave** · disabled tooltip "Read-only support view" |
| Slice 2: customer audit | "Vento Real Estate support viewed your account from 14:40 to 15:05. Reason: Checking why invitations to two people bounced." |
| Slice 2: owner email | Subject "Vento Real Estate support is looking at your account" · "Reason: Checking why invitations to two people bounced. Access ends by 15:40. You can end it now." · **End access** |

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

These are also listed, with triggers, in the [Console backlog](#console-backlog-later).

## Owner's decisions (26 Nov 2026)
1. **Where the console lives:** ~~`app.ventoerp.com/console`~~ `realestate.ventoerp.com/console` *(host changed 27 Nov 2026)*, a separate area on the same origin with its own shell and fresh two-step. Passkeys work there with no new decision; one deploy.
2. **Support view needs the owner's permission first:** yes, 7 days per permission, given in one click from **Talk to Vento Real Estate** or the Security card, ended at any time.
3. **What the customer sees about a support view:** "Vento Real Estate support", the reason, and the start and end times in their audit trail, plus an email to owners when a view opens. No staff name (decision 0015).
4. **The command line after the console:** change commands refuse without `--break-glass`, and every break-glass change emails all other super-admins. Bootstrap, read commands and the daily trial job stay as they are.
5. **Slicing:** slice 1 (console core) now; slice 2 (support view) straight after, before brick 4; failed jobs with the first queued work; AI usage with the first AI feature.
6. **Console window length:** fresh passkey or code to enter, then 15 minutes idle or 8 hours, whichever is first.
7. **Publishing plan versions in the console:** yes, in slice 1, as a two-step sheet, so the console fully replaces `plans publish --from file.json`.
8. **Who can be a super-admin:** ~~for now, any existing account with two-step on, as today~~ *superseded on 27 Nov 2026: only staff accounts, added by invitation (1b decision 1)*. Restricting super-admins to `@ventoerp.com` addresses is **deferred** until Vento has domain mailboxes; it then becomes a per-environment setting (allowed domain) checked when a super-admin is invited, from the console and the command line.

## Slice 1b: staff accounts, staff invitations, dashboard and naming (owner, 27 Nov 2026)

Updates on top of slice 1, in the same PR. Slice 1 as built stays; 1b adds the Dashboard, staff invitations and sign-up, My account and the naming and domain rule, and changes only what they contradict (marked *(1b)* above). The owner's words:
1. "I should not be able to sign into an organisation as an admin; I should just access the console directly and see my super admin dashboard."
2. "How do I move features between plans and between releases?"
3. Naming: there are other Vento products (Vento Hotels; Vento Manufacturing, the original "Vento ERP"), so this product always says "Vento Real Estate".
4. "I should be able to invite a super-admin that's not a user on the system; they'll sign up and join — the way a super-admin signs up is different from the way a customer signs up."
5. "There should also be a proper dashboard for the super admin to view customers' activities."
6. "Let's have the console working at an MVP state (not half-baked) so we can build the actual customer modules; we can come back to the console for clean-up and updates."

### Success looks like (1b)
- **A staff member signs in and sees the Dashboard in one step**, with no workspace, organization or extra *Confirm it's you*.
- **A new super-admin joins in under 3 minutes** from opening the invitation email (name, password, two-step, backup codes, optional passkey), with no customer sign-up screens.
- **"How are customers doing?" answered on the Dashboard without a click.**
- **Zero bare "Vento"** in user-visible text (copy test).

### 1. Staff accounts
**Problem (one sentence):** a super-admin today is a customer account with extra power, so staff reach the console through a customer organization and staff power is tangled with customer membership.

**Rules**
1. **A staff account is only for the console.** It's created only by accepting a staff invitation, is never a member of any organization, can't create an organization, and can't accept a customer invitation. Sign-in takes it straight to the Dashboard; any customer path redirects to `/console`.
2. **One email, one kind of account.** An email with a customer account can't be invited as staff; a staff email can't join a customer organization. A staff member who wants to use the product as a customer uses a separate customer account with a different email.
3. **Two-step always**, set up during the staff sign-up before the account is usable; it can't be turned off.
4. **Their own sign-in is managed in the console** on **My account**.
5. **Removing a super-admin closes their staff account:** every session ends, passkeys and authenticator are removed, they can't sign in, and their name stays on past activity. Inviting the same email again starts fresh (new password and two-step) on the same account record, so history still links.
6. **Lost phone:** backup codes first; otherwise another super-admin uses ⋯ **Reset two-step** on their row (same rules as a customer reset: sessions end, passkeys removed, a password link is emailed, two-step set up again before the console opens). Nobody resets their own.

**Existing super-admins at deploy:** a super-admin who is also a member of an organization stops being a super-admin when 1b deploys (platform event, reason "Staff accounts are separate from customer accounts"); their customer access is unchanged. If none remains, the bootstrap invitation works. **Seed:** Ada and Tunde become staff accounts with no organization (Ada is no longer a viewer in Vento Homes); one open staff invitation (Chika Obi, chika@ventoerp.com, invited by Ada).

#### Staff invitation and staff sign-up
**Invite** (Super-admins → **Invite super-admin**, side sheet)
- Fields: **Email** (`type=email`, `autoComplete=off`, no spell-check or auto-capitals), **Name**, **Reason**.
- **Review:** "Tunde Bello (tunde@ventoerp.com) gets an email to join. The link works for 48 hours." · "They become a super-admin only after setting a password and two-step sign-in." · on the fourth (active plus invited): "This would be the fourth super-admin. The owner asked for a second approver from then on; that's not built yet." → **Send invitation**. Toast "Invitation sent to Tunde Bello".
- **Refused:** customer account ("tunde@gmail.com already has a Vento Real Estate customer account. Invite a different email, such as their @ventoerp.com address."); already a super-admin ("Tunde Bello is already a super-admin."); open invitation ("tunde@ventoerp.com already has an invitation that expires 29 Nov 2026, 14:30." with **Resend**). A closed (former) staff account can be invited again.

**Lifecycle and limits**
- `pending → accepted / expired / withdrawn`. Expires **48 hours** after it's sent. **Resend** (once a minute) replaces the link with a fresh 48 hours; an expired invitation can be resent or withdrawn. **Withdraw** (confirm with reason) stops the link at once.
- At most **5 open staff invitations**. The staff sign-up page allows 20 link checks a minute per network and 10 code attempts a minute (no lock: there's no usable account yet).

**Staff sign-up** (public route, e.g. `/staff-invitation/{token}`, outside `/console` so it isn't a 404; separate from customer sign-up)
1. **Join the Vento Real Estate console** · "Ada Okafor invited you as a super-admin." Email shown, not editable. **Name** (prefilled), **Password** (show/hide, Caps Lock hint, rule checklist; the usual password rules) → **Continue**. No organization, company or onboarding steps; no email verification (the invitation proves the email).
2. **Set up two-step sign-in** · "Staff accounts need it every time you sign in." QR and "Can't scan? Enter this key", code → **Verify code** → **Save your backup codes** → **I've saved them**. Verifying the code makes them a super-admin and accepts the invitation.
3. **Add a passkey?** · **Add passkey** · **Skip for now**.
4. **Dashboard**, console window open. Toast "Welcome, Tunde. You're a Vento Real Estate super-admin."
- **Leaving half-way:** not a super-admin until two-step is verified. Reopening a valid link asks for the password they set and resumes at step 2. If it expires first, the unfinished account is discarded.
- **Signed in as someone else:** "You're signed in as olumide@ventohomes.ng. Sign out to accept this staff invitation." · **Sign out and continue**.
- **Bad links:** expired (and unknown tokens) "This invitation has expired. Ask Ada Okafor to send a new one." · withdrawn "This invitation was withdrawn. Ask a Vento Real Estate super-admin if you still need access." · used "This invitation has already been used." **Sign in**.
- **Email got a customer account meanwhile:** "tunde@gmail.com now has a Vento Real Estate customer account, so it can't be a staff account. Ask Ada Okafor to invite a different email."

#### Super-admins page (1b)
- The slice 1 list stays (person, since, granted by, last console use; **Remove** not on your own row), with **Invited by** wording and a row ⋯ holding **Reset two-step** and **Remove**.
- **Invitations** section (hidden when none): email and name, invited by, "Expires 29 Nov 2026, 14:30" or **Expired** (rose); **Resend** · **Withdraw**.
- Primary action **Invite super-admin** replaces **Add super-admin**.

#### My account in the console
`/console/account`, *settings page* archetype, reusing the My security cards and dialogs with their rules (decision 0019; new backup codes and passkeys need a code or passkey from the last 5 minutes):
- **Profile:** name, edited in place; email shown.
- **Sign-in:** **Change password**; two-step "On · Required for Vento Real Estate staff", no **Turn off**; backup codes left and **New backup codes**.
- **Passkeys:** add, rename, remove; up to 10.
- **Where you're signed in:** device, approximate place, masked IP, last active; sign out one or all others.
- In the user menu (**My account**) and the phone More sheet. This replaces 0021's follow-up "a super-admin with no organization can't manage passkeys".

#### Bootstrap and break-glass
- **First super-admin:** `pnpm superadmin invite --bootstrap --email … --name …` works only when there's no active super-admin; it **prints a one-time link** (48 hours) and also emails it if email is set up. Actor "Vento Real Estate (setup)", channel `command`. Running it again replaces the open bootstrap invitation. With a super-admin present: "There's already a super-admin. Ask them to invite you from the console."
- **Break-glass:** `pnpm superadmin invite --email … --name … --reason … --by … --break-glass` **emails** the invitation (never prints it, so whoever holds the host can't use the link) and emails the other super-admins. `superadmin revoke` stays as it is.
- **`superadmin grant` refuses:** "Super-admins join by invitation. Use superadmin invite." The parity registry maps `superadmin invite` to the console's invite procedure.

#### Audit and emails
| Platform event | Activity reads | Emails |
|---|---|---|
| `super_admin.invited` | "Invited Tunde Bello (tunde@ventoerp.com)" | Invitee: invitation. Other super-admins: notice. |
| `super_admin.invitation_resent` | "Resent Tunde Bello's invitation" | Invitee: invitation with a new link. |
| `super_admin.invitation_withdrawn` | "Withdrew Tunde Bello's invitation" | – |
| `super_admin.joined` (actor: the new person) | "Tunde Bello joined as a super-admin" | Other super-admins: notice. |
| `super_admin.two_step_reset` | "Reset Tunde Bello's two-step" | The person: password link. Other super-admins: notice. |
| existing revoke | "Removed Tunde Bello" | The person and the others (slice 1). |
Expiry writes no event. The new person's own account trail records sign-up, two-step set up and passkey added, as for customers.

#### Customer side
- *Invite people*: a staff email is a row problem: "tunde@ventoerp.com is a Vento Real Estate staff account and can't join an organization. Use a different email." Accepting an older invitation with a staff email: "This email belongs to a Vento Real Estate staff account, so it can't join Vento Homes Ltd. Ask Olumide Bankole to invite a different email."
- Removed: the **Vento console** entries in the user menu, More and ⌘K, and My security's super-admin line (marked in slice 1 above).

### 2. Dashboard with customer activity
**Problem (one sentence):** staff can see what Vento Real Estate changed but not how customers are doing, so trials lapse, limits bite and quiet accounts drift without anyone noticing.

The console home, `/console`, in the DESIGN-NOTES *Role homes* anatomy: **four numbers, a work queue, two panels**. Account-level metadata only: counts, dates, organization names and owner facts (as already shown on organization detail). Never members' names or emails, buyers, money, documents or KYC (NDPA; a deeper look is the consented support view). Internal organizations are left out of every number and feed, and shown only as "Internal" under *Organizations by plan*.

**Header:** "Dashboard" · "214 organizations · 3,912 people" · search "Find an organization" (Enter opens *Organizations* with that search, keeping "why doesn't X have Y" at 2 clicks).

**Four numbers** (each opens the filtered list)
| Number | Shows | Opens |
|---|---|---|
| **Organizations** | 214 · "+6 in the last 7 days" | *Organizations* |
| **Active this week** | "1,204 people" · "in 61 organizations" | *Organizations* (sorted by last active) |
| **Trials ending soon** | 4 · "in the next 7 days" | *Organizations*, On trial |
| **Over a limit** | 3 · "5 more at a limit" | *Organizations*, Over a limit |

**Needs attention** (queue; at most 8 rows, then "and 6 more" linking to the filtered list; each row has the one action that resolves it)
| Order | Item | Row reads | Action |
|---|---|---|---|
| 1 | Command-line change in the last 7 days, newest first | "Ada Okafor moved Sales to off from the command line · 2 days ago" (rose) | **Review** → *Activity* |
| 2 | Trial ending in 7 days, soonest first | "Lekki Partners Ltd · Enterprise trial ends in 2 days" (amber) | **Review** → organization |
| 3 | Over a limit, largest first | "Parkview Homes · People 17 of 15" (rose) | **Review** → organization |
| 4 | No plan | "Abuja Heights Ltd · No plan" (amber) | **Choose a plan** |
| 5 | Gone quiet: nobody active for 14 days, organization older than 14 days | "Lekki Pearl Estates · nobody active for 18 days" (slate) | **Review** → organization |
Items leave when resolved; no tick-off in 1b (nothing to store). Empty: "Nothing needs attention. Command-line changes, trials ending, limits and quiet organizations appear here."

**Panel 1 · Customer activity · last 7 days**
- Summary: "6 new organizations · 41 invitations sent, 28 accepted · 2 trials started · 3 sign-ups not finished".
- Feed: the latest 15 notable account events, grouped per organization, kind and day, newest first, each linking to the organization ("Lekki Partners Ltd · 3 people joined · today"; "Vento Homes Ltd · sign-in locked after wrong codes · 2 h ago" amber; "Parkview Homes · possible copied passkey · yesterday" rose). Footer "Older activity is on each organization's page." Empty "No customer activity in the last 7 days."

**Panel 2 · Plans and releases**
- *Organizations by plan:* one row per plan with share bar and count, versions underneath ("47 on v2 · 3 on v1"), plus "Internal" and "No plan" (amber); rows open the plan.
- *At pilot:* "2 features: Sales, Documents" (links).
- *Recent changes:* the last 5 platform changes with Console or rose Command line tag · **See all activity**.

**Account activity card on organization detail:** "9 of 11 people active in the last 7 days · last active today", then this organization's feed rows for 30 days. Empty "No account activity in the last 30 days."

**Where every number comes from** (all exist today; the architect confirms each)
| Number or row | Source |
|---|---|
| Organizations, +N in 7 days | `organizations.created_at`; internal excluded via `organization_plans.release_group` |
| People | active `members`, distinct users |
| Active this week | `members.last_active_at ≥ now − 7 days` (status active), distinct `user_id` / `organization_id`; written at most hourly |
| Trials ending / started | `organization_trials`: open (`cancelled_at`, `ended_recorded_at` null), `ends_on` within 7 Lagos days / `starts_at ≥ now − 7 days` |
| Over / at a limit | the existing over-limit computation (members incl. pending invitations, entities, vs limits); "at" = equal |
| No plan | `organization_plans.plan_version_id` null |
| Gone quiet | `max(members.last_active_at)` per organization < now − 14 days, organization created > 14 days ago |
| Invitations sent / accepted | `invitations.created_at` in 7 days (resends not counted) / `status = accepted`, `responded_at` in 7 days |
| Sign-ups not finished | `users` created in 30 days, `email_verified`, no `members` row in any state, not in `platform_admins`; count only |
| Command-line changes | `platform_audit_events.channel = 'command'` (or null and not the scheduled actor), 7 days |
| By plan, at pilot, recent changes | `organization_plans` ⋈ `plan_versions` ⋈ `plans`; `feature_releases.stage = 'pilot'`; `platform_audit_events` |
| Feed and Account activity | `audit_events` with only: `organization.created` (signed up), `entity.created` (added a company), `invitation.accepted` (people joined), `member.removed` (people removed), `member.access_changed` to the owner role (new owner), `two_step.reset`, `auth.locked_out`, `passkey.suspected_clone`. Read `organization_id`, `action`, `created_at` (and the role in `after` for owner changes); never `actor_name`, `target_label`, IP or device. Needs a cross-organization index on `(action, created_at)` (an index, not new tracking). `member.access_changed` stores role names: if a new owner can't be told apart reliably, that row goes to the backlog. |

**Behaviour:** one read (`dashboard.get`), p95 ≤ 300 ms on 2,000 seeded organizations, refetched on focus. Phones: numbers 2 × 2, then queue, then panels; **Dashboard** is the first tab. Skeleton in the final layout; error "Couldn't load the Dashboard." with **Try again**.

### 3. Moving a feature between plans and stages
**How to move a feature (for the owner):**
> A feature has two separate dials; a customer gets it only when both say yes.
> - **Stage** (on *Releases*) says whether it's ready and who sees it while you release it: Off, Internal (only us), Pilot (us and pilot customers), On (everyone whose plan includes it). **To move it between stages:** *Releases* → the feature → tap the stage → reason → confirm. It takes effect within 30 seconds. **Turn off for everyone** is the emergency stop.
> - **Plan** (on *Plans*) says who pays for it. Plans are versioned so a customer's package never changes unless you decide. **To move it from one plan to another** (say Commissions from Enterprise to Growth): *Plans* → **Growth** → **Publish v3** → tick Commissions → review → publish. If it should leave Enterprise, do the same there with it unticked. New organizations get the new versions straight away. Existing customers stay on their version until you move them: open the organization → "Growth v3 is available" → **Move to v3**, one organization at a time for now.
> - "Release 1, Release 2" in the release plan is a recommendation document, not a setting. A feature moves to a later release simply by staying at Internal until you move it on.

**Check of the built UI:** stages are clear (four-way stage control, fixed kill switch). Plans aren't: the feature's page lists plans as plain text with no way to act and no hint that a change means publishing versions.

**1b fix (small):** on the feature's page, *Included in* shows each plan as a link with its latest version ("Growth v2, Enterprise v1"), *Not in* lists the others, and the line "To change this, publish a new version of a plan. Customers stay on their version until you move them." Recommended later: backlog items 4 and 5.

### 4. Naming: always "Vento Real Estate"
**The rule:** every user-visible word says **Vento Real Estate**, never "Vento" alone: product name, page and tab titles, "Vento Real Estate console", the staff label, emails (sender name, subjects, bodies, footers), ⌘K, **Talk to Vento Real Estate**, "Vento Real Estate support", customer audit entries ("Vento Real Estate moved your organization to Growth"; actor "Vento Real Estate"), errors ("Couldn't reach Vento Real Estate"), help articles, PDFs and the logo's accessible name. Possessive: "Vento Real Estate's". Buyer messages still start with the developer's name ("Vento Homes: …").

**Not covered:** code and config names (`VentoMark`, `talkToVento`, `@vento/*`, `vento_app`, `VENTO_CRON`, `VENTO_OPERATOR`), and customer data that contains the word (the demo customer "Vento Homes Ltd").

**Short forms proposed (need the owner's OK; until then, the full name):** (a) the logo lockup "Vento | REAL ESTATE" counts as the full name; the wordmark never appears without its descriptor, and the mark alone is labelled "Vento Real Estate"; (b) on phones the console top bar may read "Staff · all customers" beside the lockup (the full label doesn't fit at 375 px); the sidebar always has the full label; (c) the AI feature "Ask Vento" becomes **"Ask"** with the AI marker, since "Ask Vento Real Estate" is too long for ⌘K and buttons.

**Places that change** (examples; the copy test finds the rest)
| Where | Today | After |
|---|---|---|
| Console label and titles | "Vento staff · all customers"; "Organizations · Vento console" | "Vento Real Estate staff · all customers"; "Organizations · Vento Real Estate console" |
| Customer titles, error, offline and not-found pages | "… Vento", "Couldn't reach Vento" | "… Vento Real Estate", "Couldn't reach Vento Real Estate" |
| Email subjects | "Vento: sign-in locked for 15 minutes", "Reset your Vento password", "Verify your email for Vento", "… invited you to Vento Homes Ltd on Vento" | "Vento Real Estate: sign-in locked for 15 minutes", "Reset your Vento Real Estate password", "Verify your email for Vento Real Estate", "… on Vento Real Estate" |
| Email bodies and senders | "your Vento account", "Welcome to Vento", "Vento Homes Ltd via Vento" | "your Vento Real Estate account", "Welcome to Vento Real Estate", "Vento Homes Ltd via Vento Real Estate"; default sender "Vento Real Estate" (already) |
| Plan and trial copy | **Talk to Vento**, "Contact Vento" | **Talk to Vento Real Estate**, "Contact Vento Real Estate" |
| Customer audit trail | "Vento moved your organization to Growth", "Vento's exception for Sales ended", actor "Vento" | "Vento Real Estate moved…", "Vento Real Estate's exception…", actor "Vento Real Estate" |
| Operation messages and staff emails | "is now a Vento super-admin", "No Vento account uses …" | "is now a Vento Real Estate super-admin", "No Vento Real Estate account uses …" |
| Help centre, ⌘K, module placeholder | bare "Vento" | "Vento Real Estate" |
| Domain in docs | `app.ventoerp.com` | `realestate.ventoerp.com` (console `realestate.ventoerp.com/console`) |

**Enforcement:** a test scans web copy and rendered email templates for "Vento" not followed by " Real Estate", with an allow-list for customer data in fixtures.

**Domain notes for the architect:** passkeys are bound to the host (decision 0019); moving to `realestate.ventoerp.com` before launch is free, but passkeys already made on `app.ventoerp.com` would stop working. Production's sending domain and the **Talk to Vento Real Estate** address (tests use `support@vento.ng`) should be Vento Real Estate addresses.

### Acceptance criteria (1b)
**Staff accounts**
- **Given** a staff account, **then** it has no membership, `organizations.create` and customer invitation acceptance refuse it, and customer procedures answer *not found*.
- **Given** a customer owner inviting a staff email, **then** that row shows the staff-account problem and no invitation is made.
- **Given** a super-admin removed, **then** every session ends, passkeys and authenticator are removed, sign-in fails like a wrong password, their name stays on Activity, and the person and the other super-admins are emailed.
- **Given** **Reset two-step** on another super-admin with a reason, **then** their sessions end, passkeys are removed, a password link is emailed, and at their next sign-in they set up two-step before the console opens; on your own row there's no such action and the API refuses ("You can't reset your own two-step. Ask another super-admin.").
- **Given** the 1b deploy, **then** a super-admin who belongs to any organization stops being one (platform event with the reason), keeps their customer access, and the bootstrap invitation works if none remains.

**Staff invitations and sign-up**
- **Given** an invite with email, name and reason, **when** sent, **then** the invitee gets "Ada Okafor invited you to the Vento Real Estate console", the other super-admins get a notice, and the Invitations section shows it with its expiry.
- **Given** an email with a customer account, an active super-admin, or an open invitation, **then** the invite is refused with its message and nothing is sent; a sixth open invitation is refused ("There are 5 open invitations. Withdraw one or wait for it to be accepted.").
- **Given** an invitation older than 48 hours, **then** its link shows the expired message and its row **Expired**; **Resend** gives a new 48-hour link and kills the old one; a second resend within a minute says "Wait a minute before resending."
- **Given** **Withdraw**, **then** the link shows the withdrawn message at once.
- **Given** the staff sign-up, **when** the person sets a password and verifies a code, **then** they become a super-admin (`super_admin.joined`), see backup codes, are offered a passkey, and land on the Dashboard with the console window open; until the code is verified they're not a super-admin, and reopening the link resumes at two-step after their password.
- **Given** the email gained a customer account, or the browser is signed in as someone else, **then** the page shows the matching message and nothing is created.
- **Given** `superadmin invite --bootstrap` with no super-admin, **then** it prints a one-time 48-hour link; with one, it refuses. **Given** `--break-glass`, **then** the link is emailed, never printed. **Given** `superadmin grant`, **then** it refuses with "Super-admins join by invitation. Use superadmin invite."

**My account**
- **Given** My account, **then** a super-admin can change their name and password, make new backup codes, add, rename and remove passkeys, and see and end sessions, with My security's rules; two-step reads "Required for Vento Real Estate staff" with no **Turn off**.

**Dashboard**
- **Given** seeded data, **then** each number, queue row and summary count equals its source query above, internal organizations excluded (a service test per row).
- **Given** the feed or Account activity card, **then** the response holds only organization id and name, kind, count and time (a JSON scan for member names, emails, IPs and devices fails the test).
- **Given** nothing to show or a failed load, **then** the empty sentences or "Couldn't load the Dashboard." with **Try again** appear.
- **Given** 375 px, **then** numbers are 2 × 2, nothing scrolls sideways, and **Dashboard** is the first tab.

**Releases**
- **Given** a feature's page, **then** *Included in* links each plan, *Not in* lists the others, and the "publish a new version" line links to Plans.

**Naming**
- **Given** web copy and rendered emails, **then** the copy test finds no bare "Vento" outside the allow-list.

### UI copy (1b)
| Where | Copy |
|---|---|
| Console user menu | **My account** · **Sign out** |
| Dashboard | "Dashboard" · "214 organizations · 3,912 people" · "Find an organization" · numbers "Organizations" "+6 in the last 7 days" · "Active this week" "1,204 people" "in 61 organizations" · "Trials ending soon" "in the next 7 days" · "Over a limit" "5 more at a limit" |
| Needs attention | "Needs attention" · rows as in §2 · **Review** · **Choose a plan** · "and 6 more" · empty "Nothing needs attention. Command-line changes, trials ending, limits and quiet organizations appear here." |
| Customer activity | "Customer activity · last 7 days" · "6 new organizations · 41 invitations sent, 28 accepted · 2 trials started · 3 sign-ups not finished" · "signed up" · "added a company" · "3 people joined" · "1 person removed" · "new owner" · "two-step reset for 1 person" · "sign-in locked after wrong codes" · "possible copied passkey" · "Older activity is on each organization's page." · empty "No customer activity in the last 7 days." |
| Plans and releases | "Plans and releases" · "Organizations by plan" · "47 on v2 · 3 on v1" · "Internal" · "No plan" · "At pilot" · "2 features: Sales, Documents" · "Recent changes" · **See all activity** |
| Dashboard error | "Couldn't load the Dashboard." · **Try again** |
| Account activity | "Account activity" · "9 of 11 people active in the last 7 days · last active today" · empty "No account activity in the last 30 days." |
| Feature page plans | "Included in" · "Not in" · "To change this, publish a new version of a plan. Customers stay on their version until you move them." |
| Super-admins | **Invite super-admin** · "Invitations" · "Expires 29 Nov 2026, 14:30" · "Expired" · **Resend** · **Withdraw** · ⋯ **Reset two-step** · **Remove** |
| Invite sheet | "Invite super-admin" · "They'll be able to change every organization's plan and features." · "Email" · "Name" · "Reason" · "Invite Tunde Bello to be a super-admin?" · **Send invitation** |
| Invite refusals | "tunde@gmail.com already has a Vento Real Estate customer account. Invite a different email, such as their @ventoerp.com address." · "Tunde Bello is already a super-admin." · "tunde@ventoerp.com already has an invitation that expires 29 Nov 2026, 14:30." · "There are 5 open invitations. Withdraw one or wait for it to be accepted." · "Wait a minute before resending." |
| Withdraw confirm | "Withdraw Tunde Bello's invitation?" · "The link stops working at once." · **Withdraw invitation** |
| Reset two-step confirm | "Reset Tunde Bello's two-step?" · "They're signed out everywhere, their passkeys are removed, and they get an email to set a new password. They set up two-step again at their next sign-in." · **Reset two-step** |
| Remove confirm (1b) | "Remove Tunde Bello as a super-admin?" · "Their staff account closes: they're signed out everywhere and can't sign in. Their name stays on past activity." · **Remove Tunde** |
| Toasts | "Invitation sent to Tunde Bello" · "Invitation resent" · "Invitation withdrawn" · "Tunde Bello's two-step was reset" · "Welcome, Tunde. You're a Vento Real Estate super-admin." |
| Staff sign-up | "Join the Vento Real Estate console" · "Ada Okafor invited you as a super-admin." · **Continue** · "Set up two-step sign-in" · "Staff accounts need it every time you sign in." · "Can't scan? Enter this key" · **Verify code** · "Save your backup codes" · **I've saved them** · "Add a passkey?" · "Sign in with your fingerprint, face or screen lock." · **Add passkey** · **Skip for now** |
| Staff sign-up errors | as in §1, plus wrong code "That code didn't work. Check the time on your phone and try again." |
| My account | "My account" · "Required for Vento Real Estate staff" · **Change password** · **New backup codes** · **Add passkey** |
| Customer side | "tunde@ventoerp.com is a Vento Real Estate staff account and can't join an organization. Use a different email." · "This email belongs to a Vento Real Estate staff account, so it can't join Vento Homes Ltd. Ask Olumide Bankole to invite a different email." |
| Commands | "Super-admins join by invitation. Use superadmin invite." · "There's already a super-admin. Ask them to invite you from the console." |
| Staff invitation email | From "Vento Real Estate" · Subject "Ada Okafor invited you to the Vento Real Estate console" · "Ada Okafor invited you to join Vento Real Estate as a super-admin. Super-admins manage every customer's plan, features and releases. You'll set a password and two-step sign-in. This link works until 29 Nov 2026, 14:30." · **Accept invitation** · "Not expecting this? Ignore this email. Nothing happens unless you accept." |
| Notices to other super-admins | "Ada Okafor invited Tunde Bello (tunde@ventoerp.com) to be a super-admin" · "Tunde Bello joined as a Vento Real Estate super-admin" · "Ada Okafor reset Tunde Bello's two-step" · "Ada Okafor removed Tunde Bello as a super-admin" (each with time, reason and **Open Activity**) |
| Removed email | "You're no longer a Vento Real Estate super-admin" · "Ada Okafor removed you as a super-admin at 14:30 on 27 Nov 2026. Your staff account is closed." |

### Changes to DOMAIN.md (1b)
*Applied to `docs/DOMAIN.md` on 27 Nov 2026 (short form (c) approved, so "Ask" in `docs/PRODUCT.md`).*

Platform table:
- **"Vento super-admin" → "Super-admin"**: "A Vento Real Estate staff member who manages releases, plans, trials, add-ons, overrides and other super-admins in the console. | Has a **staff account**, never a customer account or an organization role. Joins only by a staff invitation. Two-step required and can't be turned off. Every change is attributed to the signed-in person and is in the platform audit trail; changes affecting one organization also appear in its audit trail with actor "Vento Real Estate"."
- **"Vento console" → "Console"**: "The staff-only area of Vento Real Estate where super-admins work. | At `realestate.ventoerp.com/console`, its own shell, home is the Dashboard. Fresh two-step proof; closes after 15 minutes idle or 8 hours. Doesn't exist (404) for anyone who isn't an active super-admin."
- **Add "Staff account":** "An account used only for the console. | Created by accepting a staff invitation; never a member of any organization; one email is either a staff or a customer account. Its sign-in is managed on My account in the console. Removing the super-admin closes it."
- **Add "Staff invitation":** "An emailed invitation to become a super-admin. | `pending → accepted / expired / withdrawn`. 48 hours; resend replaces the link. Accepted only through the staff sign-up (name, password, two-step). At most 5 open."
- **Add "Dashboard (console)":** "The console's home: customer and platform numbers, a work queue and customer account activity. | Account-level facts only (counts, dates, organization names, owner facts); never members' names, buyers, money, documents or KYC. Internal organizations excluded."
- **"Platform audit event":** add "…and staff invitations (invited, resent, withdrawn, joined, two-step reset)"; actor "Vento Real Estate".
- **"Release stage", "Release group", "Plan version", "Override":** "Vento" → "Vento Real Estate".
Access rules:
- **Add:** "**Staff invitations** expire 48 hours after they're sent; resending (once a minute) replaces the link with a fresh 48 hours; at most 5 open."
- **"Two-step is required"** add "and always for staff accounts"; **two-step resets** add "A super-admin's two-step is reset by another super-admin in the console."
- **"Console window"**: drop "customer pages in the same session keep the normal session rules" (staff sessions have none).
New section **Naming:** "The product is **Vento Real Estate** in every user-visible word, never "Vento" alone (decision 0022). Code names are unaffected."
AI table and `docs/PRODUCT.md`: "Ask Vento" → "Ask" only if short form (c) is approved; otherwise "Ask Vento Real Estate".

### Decision records needed (for the architect)
- **0022 · The product is always called Vento Real Estate:** the rule, exceptions and copy test; domain `realestate.ventoerp.com`; 0019's host becomes `realestate.ventoerp.com`.
- **0023 · Staff accounts are separate from customer accounts and join by invitation:** amends 0021 (the no-organization passkey consequence is replaced by My account; the user-menu entry and **Back to {organization}** go) and 0015 (a super-admin is a staff account, not a role on any account). Covers the staff sign-up, 48-hour invitations, `superadmin invite` (bootstrap prints, break-glass emails), removal closing the account, and the deploy rule.
- ~~Still saying `app.ventoerp.com`~~ Done (27 Nov 2026): `docs/ARCHITECTURE.md`, `docs/plans/admin-console.md` and `docs/RUNBOOK.md` say `realestate.ventoerp.com`; decisions 0019 and 0021 carry dated amendment lines. Both records are written: [0022](../decisions/0022-the-product-is-always-called-vento-real-estate.md) and [0023](../decisions/0023-staff-accounts-are-separate-from-customer-accounts.md).

### Owner's decisions (1b, 27 Nov 2026)
The owner approved every recommended default below (questions 1–4 answered directly; 5 follows the same rule as 1).
1. **Internal organizations:** keep staff accounts out of Vento Real Estate's own internal organizations too? *Recommended: yes, out of every organization.* Staff use a separate customer account (different email) to try the product as a customer.
2. **Existing super-admins at deploy:** anyone who is a super-admin and a member of an organization (possibly your own account) stops being a super-admin and re-joins by invitation with a staff email. *Recommended: yes.*
3. **Staff invitation lifetime:** *Recommended: 48 hours* (customers get 7 days).
4. **Short forms of the name:** (a) the logo lockup counts as the full name, (b) "Staff · all customers" in the console's phone top bar, (c) "Ask Vento" → "Ask" with the AI marker. *Recommended: approve all three.*
5. **Internal organizations on the Dashboard:** *Recommended: left out of the numbers and the feed*, shown only as "Internal" under Organizations by plan.

## Console backlog (later)
Only things not built. Each says why it matters and what triggers it.
1. **Support view (slice 2)**, specified [above](#support-view-slice-2). Support can't see what a customer sees without it. *Trigger:* before brick 4, or the first support case that needs it.
2. **Failed jobs (slice 3)**, the [AdminJobs](../design/claude-design/AdminJobs.dc.html) screen and a health line per organization. *Trigger:* the first queued work, which defines the jobs table.
3. **AI usage (slice 4)**, usage and cost by organization and feature. *Trigger:* the first AI feature writing `ai_usage` records.
4. **Change plans from a feature's page:** one confirm publishes the affected plans' next versions. Moving a feature between plans now takes two publishes on two pages. *Trigger:* the first real repackaging, or doing it more than monthly.
5. **Move everyone on a version at once** ("Move all 47 on Growth v2 to v3", one preview), with a plan filter on Organizations. *Trigger:* the first new version that should reach more than about 10 organizations.
6. **Second approver** for platform changes. *Trigger:* a fourth super-admin.
7. **Staff emails only on `@ventoerp.com`** (per-environment allowed domain, checked on invite and break-glass). *Trigger:* domain mailboxes exist.
8. **Lesser staff roles** (support-only, read-only). *Trigger:* the first staff hire who shouldn't change plans or releases.
9. **Customer activity page** with filters, longer history and export, and **daily active trends** (needs daily activity history). *Trigger:* about 50 paying organizations, or customer success asking for trends.
10. **Limit refusals** on the Dashboard ("Lekki tried to add a 6th project"; needs a new event). *Trigger:* upsell conversations driven by limits.
11. **Feature usage per organization** (needs tracking). *Trigger:* the first renewal or churn review.
12. **"New owner" in the feed**, if today's `member.access_changed` can't tell it apart without new metadata.
13. **Tick off queue items** (mark a command-line change reviewed, with Undo; needs storage). *Trigger:* more than a couple of break-glass changes a month.
14. **Console ⌘K** (find an organization or feature, jump anywhere). *Trigger:* about 500 organizations or 3 daily console users.
15. ~~**Break-glass `superadmin reset-two-step`**~~ *Built in 1b (owner, 27 Nov 2026)*, including your own from the host: `--by` may be the target, so a **lone** super-admin who lost phone and backup codes can reset their own two-step (the security inbox is always told; the console still never resets your own).
16. **A former staff email becoming a customer account.** *Trigger:* the first person who needs it.
17. **Billing facts** on organization detail. *Trigger:* the *Billing and plan* screen.
18. **Statutory defaults** page. *Trigger:* the first statutory rules.
19. **Scheduled stage changes and percentage rollouts.** *Trigger:* a release that must go out at a set time, or a risky one at scale.
20. **Exporting the platform trail.** *Trigger:* an auditor or investor asks (RUNBOOK §2 covers streaming meanwhile).
21. **UI audit minors deferred from slice 1:** console toast position (match the customer app), Start trial's plan preselect (what to preselect when the organization is already on the top plan), and on phones *Confirm it's you* re-prompting after Escape. *Trigger:* the next console clean-up pass.
22. **Customer bundle headroom:** Home's first load is about 190 of 200 KB gzip. *Trigger:* before the first customer module adds to the main chunk.
23. **Renaming the demo customer "Vento Homes Ltd"** in seed and designs, so screenshots don't blur customer and product. *Trigger:* the next design pass (owner's call).
