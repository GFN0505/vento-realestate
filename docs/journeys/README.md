# User journeys

Step-by-step walkthroughs of what real people do in Vento Real Estate, from the first click to "done". They are the bridge between the product (`docs/PRODUCT.md`), the screens (`docs/design/SCREENS.md`) and the tests: **every journey becomes a Playwright end-to-end test** and, once shipped, a help-centre article.

Start with [the golden thread](00-golden-thread.md): one fictional developer taken from buying land to managing the finished estate. It touches every module and doubles as the demo script and the seed data for local development.

## How a journey is written
Each journey has an ID (`J-<AREA>-<NN>`), and these parts:
- **Who / how often.** Persona from `docs/PRODUCT.md` and how often they do it.
- **Starts from.** Where the user is when the need arises (a home card, a WhatsApp alert, ⌘K).
- **Steps.** Numbered, each naming the screen from `SCREENS.md` in *italics*. The main path is counted in clicks.
- **Behind the scenes.** What the system does that the user doesn't see: ledger postings, approvals, audit events, messages sent.
- **Done when.** The observable end state.
- **Watch for.** Edge cases and failure paths the build and tests must handle.
- **Target.** Clicks and time for the main path.
- **Test.** The e2e spec file that walks it.
- **Status.** `draft` (written, not built) · `built` (shipped and its e2e test passes) · `changed` (the build differs; the journey was updated to match).

## Rules
- A feature isn't done until its journey here matches what was built and its e2e test passes.
- If a spec (`docs/specs/`) adds or changes a flow, it updates the journey in the same change.
- Names, companies and amounts are fictional. Never use a real customer's data.
- Use the terms in `docs/DOMAIN.md` exactly.

## Index
| ID | Journey | Persona | File | Status |
|---|---|---|---|---|
| J-ALL-00 | Golden thread: land to estate | Everyone | [00-golden-thread](00-golden-thread.md) | draft |
| J-ONB-01 | Set up a new organization | MD / admin | [01-onboarding-and-access](01-onboarding-and-access.md) | built (steps 1–2) |
| J-ONB-02 | Invite the team and set roles | Owner / admin | [01-onboarding-and-access](01-onboarding-and-access.md) | built for accepting; screens and delivery in brick 3b (draft) |
| J-ONB-03 | Import existing buyers and payments from Excel | Finance / admin | [01-onboarding-and-access](01-onboarding-and-access.md) | draft |
| J-ONB-04 | Sign in with two-factor, recover access | Everyone | [01-onboarding-and-access](01-onboarding-and-access.md) | built (passkey sign-in and new-device email: draft, brick 3d) |
| J-ONB-05 | Find your way around the workspace | Everyone | [01-onboarding-and-access](01-onboarding-and-access.md) | built |
| J-ONB-06 | Change someone's access, reset their two-step, remove a leaver | Owner / admin | [01-onboarding-and-access](01-onboarding-and-access.md) | draft (make owner through approval: brick 4) |
| J-ONB-07 | Set up the organization and its companies | Owner / admin | [01-onboarding-and-access](01-onboarding-and-access.md) | built |
| J-ONB-08 | Make a role that fits the job | Owner / admin | [01-onboarding-and-access](01-onboarding-and-access.md) | built (send for approval: draft, brick 4) |
| J-ONB-09 | Secure your own account (My security, passkeys, sessions) | Every member | [01-onboarding-and-access](01-onboarding-and-access.md) | built |
| J-ONB-10 | Require two-step for everyone | Owner | [01-onboarding-and-access](01-onboarding-and-access.md) | built |
| J-ONB-11 | Set approval rules | Owner | [01-onboarding-and-access](01-onboarding-and-access.md) | draft (brick 4) |
| J-ONB-12 | Find out who changed something (audit log) | Owner / admin | [01-onboarding-and-access](01-onboarding-and-access.md) | draft (brick 4) |
| J-LND-01 | Register a parcel and start title perfection | Land & legal | [02-land-and-title](02-land-and-title.md) | draft |
| J-LND-02 | Move a title stage forward with evidence | Land & legal | [02-land-and-title](02-land-and-title.md) | draft |
| J-LND-03 | Record and clear an encumbrance | Land & legal | [02-land-and-title](02-land-and-title.md) | draft |
| J-PRJ-01 | Create a project with phases, budget and BoQ | Project manager | [03-projects-and-site](03-projects-and-site.md) | draft |
| J-PRJ-02 | Log a site diary entry from site | Site engineer | [03-projects-and-site](03-projects-and-site.md) | draft |
| J-PRJ-03 | Request materials, raise and receive a PO | Site engineer, PM | [03-projects-and-site](03-projects-and-site.md) | draft |
| J-PRJ-04 | Complete a milestone that bills buyers | Project manager | [03-projects-and-site](03-projects-and-site.md) | draft |
| J-SAL-01 | Add units and a price list | Sales manager | [04-sales](04-sales.md) | draft |
| J-SAL-02 | Lead to site inspection to sale | Sales agent | [04-sales](04-sales.md) | draft |
| J-SAL-03 | New subscription with a payment plan | Sales agent | [04-sales](04-sales.md) | draft |
| J-SAL-04 | Chase overdue instalments | Sales manager | [04-sales](04-sales.md) | draft |
| J-SAL-05 | Reschedule a payment plan | Sales manager + approver | [04-sales](04-sales.md) | draft |
| J-SAL-06 | Default, cancel and refund | Sales manager + finance | [04-sales](04-sales.md) | draft |
| J-SAL-07 | Allocate and hand over a unit | Sales, PM, facility | [04-sales](04-sales.md) | draft |
| J-SAL-08 | Pay a realtor's commission | Sales manager + finance | [04-sales](04-sales.md) | draft |
| J-FIN-01 | Record a bank-transfer receipt | Finance officer | [05-finance](05-finance.md) | draft |
| J-FIN-02 | Paystack payment lands automatically | (System) + finance | [05-finance](05-finance.md) | draft |
| J-FIN-03 | Import a bank statement and match | Finance officer | [05-finance](05-finance.md) | draft |
| J-FIN-04 | Receive a diaspora payment in GBP | Finance officer | [05-finance](05-finance.md) | draft |
| J-FIN-05 | Reverse a wrong receipt | Finance officer + approver | [05-finance](05-finance.md) | draft |
| J-FIN-06 | Pay a contractor bill with WHT | Finance officer | [05-finance](05-finance.md) | draft |
| J-FIN-07 | Draw down construction finance | Finance manager | [05-finance](05-finance.md) | draft |
| J-FIN-08 | Close the month and produce statements | Finance manager | [05-finance](05-finance.md) | draft |
| J-HR-01 | Run monthly payroll | HR + finance approver | [06-hr-and-payroll](06-hr-and-payroll.md) | draft |
| J-HR-02 | Record site worker attendance and pay | Site engineer, HR | [06-hr-and-payroll](06-hr-and-payroll.md) | draft |
| J-HR-03 | Request and approve leave | Employee, manager | [06-hr-and-payroll](06-hr-and-payroll.md) | draft |
| J-FAC-01 | Bill service charge for a quarter | Facility manager | [07-facility](07-facility.md) | draft |
| J-FAC-02 | Resolve a resident's maintenance request | Facility manager | [07-facility](07-facility.md) | draft |
| J-CMP-01 | Verify a buyer's KYC | Sales / compliance | [08-compliance-and-documents](08-compliance-and-documents.md) | draft |
| J-CMP-02 | Review an AML flag | Compliance officer | [08-compliance-and-documents](08-compliance-and-documents.md) | draft |
| J-CMP-03 | Renew an expiring permit | Land & legal | [08-compliance-and-documents](08-compliance-and-documents.md) | draft |
| J-DOC-01 | Generate, approve and e-sign a contract of sale | Sales + legal | [08-compliance-and-documents](08-compliance-and-documents.md) | draft |
| J-EXE-01 | Morning check-in | MD / CEO | [09-executive](09-executive.md) | draft |
| J-EXE-02 | Approve sensitive actions from the inbox | MD / any approver | [09-executive](09-executive.md) | draft (brick 4) |
| J-EXE-03 | Build a board pack | MD / finance manager | [09-executive](09-executive.md) | draft |
| J-BUY-01 | Buyer joins the portal and pays an instalment | Buyer | [10-buyer-and-realtor-portals](10-buyer-and-realtor-portals.md) | draft |
| J-BUY-02 | Buyer checks progress and downloads documents | Buyer | [10-buyer-and-realtor-portals](10-buyer-and-realtor-portals.md) | draft |
| J-RLT-01 | Realtor registers a lead and tracks commission | Realtor | [10-buyer-and-realtor-portals](10-buyer-and-realtor-portals.md) | draft |
| J-AI-01 | Read a scanned C of O with AI | Land & legal | [11-ai-add-on](11-ai-add-on.md) | draft |
| J-AI-02 | Match a bank statement with AI | Finance officer | [11-ai-add-on](11-ai-add-on.md) | draft |
| J-AI-03 | Ask a question (Ask) | Any member | [11-ai-add-on](11-ai-add-on.md) | draft |
| J-AI-04 | Turn on AI and set a budget | Owner | [11-ai-add-on](11-ai-add-on.md) | draft |
| J-ADM-01 | Release a feature, stage by stage | Super-admin | [12-vento-admin](12-vento-admin.md) | built (console, slice 1, on `feat/admin-console`; commands are break-glass; e2e being written) |
| J-ADM-02 | Put an organization on a plan, start a trial, record a deal | Super-admin | [12-vento-admin](12-vento-admin.md) | built (console, slice 1, on `feat/admin-console`; commands are break-glass; e2e being written) |
| J-ADM-03 | Invite and manage super-admins, review platform activity | Super-admin | [12-vento-admin](12-vento-admin.md) | built (1b on `feat/admin-console`, PR #9, awaiting review; e2e being written) |
| J-ADM-05 | Join as a super-admin (staff sign-up) | Invited staff member | [12-vento-admin](12-vento-admin.md) | built (1b on `feat/admin-console`, PR #9, awaiting review; e2e being written) |
| J-ADM-06 | Start the day on the Dashboard | Super-admin | [12-vento-admin](12-vento-admin.md) | built (1b on `feat/admin-console`, PR #9, awaiting review; e2e being written) |
| J-ADM-07 | Manage my staff sign-in (My account) | Super-admin | [12-vento-admin](12-vento-admin.md) | built (1b on `feat/admin-console`, PR #9, awaiting review; e2e being written) |

## Assumptions to confirm
Writing these journeys meant picking defaults the product docs don't settle. The approved designs settled some of them (now written into the journeys and `docs/design/DESIGN-NOTES.md`). Each is a setting or rule, not hard-coded.

**Settled by the designs**
- An active encumbrance **blocks** its units in Sales; clearing it needs two approvals.
- Realtor duplicates aren't blocked; **a person decides ownership** (no automatic protection period).
- Two-step is required for **finance and MD** roles; five wrong codes lock sign-in for 15 minutes.
- Buyers sign in to the portal with a **one-time code**, no password.
- Excel import **undo lasts 7 days**.
- Cash above **₦5m** is held for AML review; material requests under the PM's **₦5m** limit skip approval.

**Settled by the owner (25 Nov 2026, brick 2a spec)**
- Invitations expire after **7 days** and can be resent.
- Sessions end after **30 minutes without activity or 12 hours**, or last **30 days** from sign-in with "Keep me signed in".
- **10 wrong passwords** in 15 minutes lock sign-in for 15 minutes, like five wrong two-step codes.
- Two-step is required for **owner, admin, finance and HR**.

**Still need the owner's yes**
- Allocation letter is offered once a subscription is **50% paid**.
- Overpayments are held as **credit** on the subscription and applied to the next instalment.
- Handover before full payment is **blocked unless approved**.
- Automatic reminders: **3 days before, on the day, 7 and 30 days after** the due date.
- Resolved maintenance requests auto-close after **7 days**.
- Permit expiry alerts at **60, 30 and 7 days**.
- The two ₦5m thresholds above are design defaults; the AML one must match current SCUML/NFIU rules.
- (Brick 3a) The sidebar and mobile tabs are **derived from the role's view permissions**, with a fixed tab priority per role.
- (Brick 3a) Modules not built yet show a **"Soon" tag and a Coming soon page** until each ships. *(Superseded by the approved feature-flags spec: "Soon" only in Vento Real Estate's internal organizations; customers see only features released to them and in their plan.)*

**Settled by the owner (26 Nov 2026, release plan and feature-flags spec)**
- Features not available to an organization answer **"not found"** and appear nowhere; owners alone see **"Available on Growth"** at the point of need (⌘K, limit messages).
- Early users see an **"Early access"** tag; changes take effect **within 30 seconds**; trial-ending emails to owners **7 days and 1 day** before.
- Automatic reminders stay **off per organization until finance confirms imported balances**; imported subscriptions without KYC come in **active** with KYC "not collected".
- Features are released **one by one when the owner chooses**, once releasable; there are no pilot thresholds.
- (Brick 3a) Theme, sidebar state, last entity and recently opened pages are remembered **per device**, not per account.
- (Brick 3a) **Preview as role** changes navigation only and lasts until stopped or the tab is closed.

**Still need the owner's yes (brick 3b, [team](../specs/team.md) open questions)**
- Members and open invitations in **one list** with *Invited* and *Removed* chips; the settings sub-navigation is **hidden while there's only one section**.
- Role changes **save at once with Undo**; only "make owner" confirms (and **emails every owner**); removal and two-step reset always confirm.
- An admin **limited to some entities can't change, reset or remove** someone with wider access, and sees only the entity names within their own limit.
- Invitations can be **resent once a minute**; **last active** is shown by day to owners and admins.
- The setup checklist is **hidden per person**, back from ⌘K, and stays hidden once hidden.
- Email: Postmark sends from **`no-reply@realestate.ventoerp.com`**, invitations as "{Organization} via Vento Real Estate" with the inviter as Reply-To; **staging emails only allowed addresses**; only **invitations** are marked when an email bounces.

**Still need the owner's yes (brick 3c, [roles-and-organization](../specs/roles-and-organization.md) open questions)**
- Entities are called **companies** on every screen ("Company: All companies", *Settings → Companies*, "Company access"); code and DOMAIN keep "entity".
- Only people with **access to every company** edit the organization profile, add, archive or restore companies, and make, edit or delete roles.
- Nobody can make, edit or give a role **beyond their own permissions**, or edit the role they hold.
- A custom role's **two-step is locked on** when it can change settings or do more than view in Finance or HR.
- Roles are edited as **a tick per action**; saving applies at once with **Undo**; a custom role can be deleted only when **nobody holds it**; at most **50 custom roles**.
- Archiving a company runs at once with **Undo** (a confirm when people would lose all access); archived companies can be **restored** within the plan limit and are read-only meanwhile.
- An owner at the company limit gets the **plan message instead of the form**.
- The checklist item "Add your other companies (SPVs)" can be closed with **We only have one company**.
- Organization profile is **name, head office state and financial year** only.

**Still need the owner's yes (brick 3d, [my-security](../specs/my-security.md) open questions)**
- A **passkey counts as two-step** at sign-in (Face ID, fingerprint or device PIN always checked); where two-step is required, the **authenticator app stays as the fallback**.
- *My security* is at **`/settings/security` for every member**, in the user menu, More and ⌘K; `/settings` opens it for people without settings access.
- **Require two-step for everyone** sits on *Settings → Organization*, **owners only**, no maker-checker; turning it off **emails every owner**. People without two-step get a banner and set it up at their **next sign-in, or within 7 days** at the latest.
- Adding a passkey, new backup codes and turning two-step on ask for the **password, remembered for 5 minutes**.
- An admin's **two-step reset also removes the person's passkeys**.
- **Passkeys work during a sign-in lock**, never while a password reset is required.
- **New sign-in emails** only for a browser not seen on the account in **90 days**.
- Sessions show a **city and country from an offline lookup** (no outside service, full IP never stored); no "unusual location" warning.
- **My profile is the name only**; phone with the WhatsApp digest, no photos, email change later.
- A **passkey offer once per device** after a password sign-in; up to **10 passkeys** each.

**Settled by the owner (26 Nov 2026, [admin-console](../specs/admin-console.md) spec and plan)**
- The Vento Real Estate console is at **`/console`** on the web app's origin; entering needs a passkey or code from the last **5 minutes**; the console window closes after **15 minutes** without console activity or **8 hours**.
- Console defaults: trial **30 days** (at most **90**), AI **₦150,000 a month**, a reason of at least **3 characters** on every change.
- Change commands are **break-glass** (`--break-glass`), and every break-glass change emails all other super-admins.

**Still need the owner's yes (admin-console build)**
- Every console change sheet has a **Review** step between its fields and the confirm, so a plan change is 5 clicks from *Organizations* instead of the spec's 4.
- *Activity* filters by organization only from an organization's **See all** link, not from a drop-down.

**Settled by the owner (27 Nov 2026, admin-console slice 1b)**
- Super-admins are **staff-only accounts** added by invitation; sign-in lands on the console **Dashboard**; the product is always **Vento Real Estate** at `realestate.ventoerp.com` (decisions 0022 and 0023).
- Staff accounts stay out of **every** organization, internal ones included; existing super-admins who are members **stop being super-admins at deploy** and re-join by invitation.
- Staff invitations last **48 hours**, at most **5 open**.
- The Dashboard leaves **internal organizations** out of its numbers and feed.
- Short forms of the name: the logo lockup counts as the full name; "Staff · all customers" on the console's phone top bar; "Ask Vento" becomes **"Ask"**.
- A break-glass `superadmin reset-two-step` for a super-admin locked out while the console is down, **your own included** from the host, so a lone super-admin who lost phone and backup codes isn't locked out (the security inbox is always told; the console never resets your own).

**Still need the owner's yes (admin-console slice 1b)**
- "Gone quiet" is **14 days** without member activity; the queue shows at most 8 rows.
