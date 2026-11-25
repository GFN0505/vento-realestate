# Accounts and access (brick 2a)

- **Status:** approved (25 Nov 2026), built on branch `brick/02-accounts-and-access`, waiting for the owner's per-feature review
- **Module:** Platform
- **Journeys:** J-ONB-01, J-ONB-02, J-ONB-04 (changed)
- **Screens:** see [Screens this slice touches](#screens-this-slice-touches)
- **Decisions:** 0003 (organization contains entities), 0006 (maker-checker and audit), 0009 (same origin)

## How brick 2 is sliced (recommendation)
**Ship the sign-in and onboarding screens in 2a, not API-only.** These screens stand alone (a brand panel and a form card); they need the colours, fonts and a few form parts, but not the sidebar, top bar or ⌘K. So 2a starts by putting in the design tokens, the two fonts and the handful of form components the boards use, then builds the screens from the boards once. An API-only 2a would leave you nothing to try, and the sign-in rules (lockout, resume onboarding, forced two-step) are best proven through the real screens.

| Slice | What you can do at the end | What waits |
|---|---|---|
| **2a Accounts and access** (this spec) | Sign up, verify, set up the organization and first entity, sign in with two-step, reset a password, accept an invitation. Team, roles, entities and sessions work fully behind the scenes and are tested; every access change is written to the audit trail. | The in-app screens to manage team, roles, entities and sessions |
| **3 Design system and app shell** | Sidebar per role, top bar, entity switcher, ⌘K, error pages, settings with left navigation, and the access screens: Team members and invitations, Permissions, Organization and entities, My security | |
| **4 Approvals and audit log** | Approval rules, the Approvals inbox, the audit log page and record timelines, "Request access" from the 403 page | Built just before the first feature that needs a checker (price lists or receipt reversal) |

Change from the starting idea: **audit recording moves into 2a** (access changes must be traceable from day one, and every later brick writes to it), while the **approvals engine moves after the shell**. Today nothing in Vento needs a second approver and there is nowhere to approve from, so building it now means building it blind.

## Problem
A developer group can't put land, buyers or money into Vento until the right people can get in safely and only see what their job needs. The MD wants finance staff on two-step sign-in, the sales team kept out of payroll, and a site team on one SPV kept away from the others. When someone leaves, their access must end at once while their history stays.

## Persona and job
| Who | Job | How often |
|---|---|---|
| **MD / owner** (Olumide Bankole) | Create the organization and first entity, bring in the team, stay in control of who can do what | Once, then monthly |
| **Admin** | Invite people, set roles and entity limits, remove leavers, reset a lost two-step | Weekly |
| **Every member** (Aisha Bello, finance) | Sign in quickly and securely, recover access | Daily |

## Success looks like
- A new developer goes from "Create account" to a saved organization and first entity in **under 3 minutes and 4 clicks** (after typing).
- A daily sign-in with two-step takes **under 20 seconds**.
- An invited finance officer is in, with two-step on, in **under 3 minutes**.
- **No request can read or change another organization's data.** Automated tests try every endpoint with another organization's IDs.
- **Every access change is in the audit trail** (who, what, before → after, when).

## User flow
**Sign up and set up (J-ONB-01): 4 clicks**
1. *Sign up:* name, company, work email, password (rules tick as you type), agree to the terms and privacy notice → **Create account**.
2. *Verify email:* open the link in the email, or type the 6-digit code → **Verify email**.
3. *Onboarding step 1, organization:* name (pre-filled from Company), head office state, financial year start (January). Base currency shows NGN → **Continue**.
4. *Onboarding step 2, first entity:* entity name (pre-filled with the organization name), type (holding company or SPV), RC number, TIN, VAT registered? RC and TIN can be left for later → **Finish setup**.
5. Lands on the temporary signed-in page. Owners must set up two-step before they reach it (see step 3 of the next flow).

**Sign in (J-ONB-04): 2 clicks**
1. *Sign in:* work email, password ("Forgot password?" beside the label), optional "Keep me signed in for 30 days" → **Sign in**.
2. *Two-step check:* 6-digit code from the authenticator app, or "Use a backup code" → **Verify**.
3. If the member's role requires two-step and it isn't set up: *Set up two-step* (scan the QR code or type the key, enter a code, save 10 backup codes) before going any further.

**Accept an invitation (J-ONB-02): 2 clicks plus two-step setup**
1. *Invitation email* → **Accept invitation**.
2. *Accept invitation:* shows Vento Homes Ltd, who invited them, the role, which entities they can access, what the role can approve, and whether two-step is required. New people enter their name and a password; people who already use Vento sign in instead → **Accept and set up two-step** (or **Accept invitation** where two-step isn't required).
3. Two-step setup if required, then the signed-in page.

Sending invitations, changing roles and removing members work in 2a but have their screens in brick 3. Until then the team is tried out with the seeded Vento Homes Ltd demo and the development email log.

## Roles and what they can do by default
Nine roles ship. Each gives a level per module. Permissions are stored as data, so brick 3 can let owners make their own roles (e.g. "Site engineer") without rework.

**Full** = view, create, edit, delete, export and approve · **Edit** = view, create, edit, export · **View** = view only · **+ approve** = can be a checker in that module · **–** = no access

| Module | Owner | Admin | Land & legal | Project manager | Sales | Finance | HR | Facility | Viewer |
|---|---|---|---|---|---|---|---|---|---|
| Land & title | Full | Full | Full | View | View | View | – | – | View |
| Projects & construction | Full | Full | View | Full | View | View | – | View | View |
| Sales & CRM | Full | Full | View | View | Edit | View + approve | – | View | View |
| Finance | Full | Full | – | – | – | Full | – | – | View |
| Facility & estate | Full | Full | – | View | – | View | – | Full | View |
| HR & payroll | Full | Full | – | – | – | View + approve | Full | – | – |
| Compliance | Full | Full | Edit | View | Edit | View | – | – | View |
| Documents & contracts | Full | Full | Full | View | Edit | View | View | View | View |
| Executive analytics | Full | Full | – | – | – | View | – | – | View |
| Settings (organization, entities, team) | Full | Full* | – | – | – | – | – | – | – |

\* Only owners can make someone an owner, or change or remove an owner. Only owners will manage billing and AI.

**Two-step is required** for owner, admin and finance (and HR, if you agree: see open question 4). Anyone can turn it on for themselves.

**Entity limits.** A member has access to all entities, or only the ones listed ("Kunle Ojo: Parkview Residences SPV Ltd only"). Records of other entities behave as if they don't exist. Project limits use the same rule and arrive with the Projects brick, when there are projects to pick.

Only the Settings row has anything to protect in 2a. The other rows are agreed now and enforced as each module is built.

## Acceptance criteria

### Sign up and verify
- **Given** someone on *Sign up*, **when** the password is under 12 characters or has no number, **then** the matching rule stays unticked and **Create account** explains what's missing.
- **Given** an email that already has an account, **when** they sign up, **then** they see the usual "Check your email" step, and the existing account is emailed "Someone tried to create a Vento account with your email. Sign in or reset your password." Nobody can find out who has an account.
- **Given** a new account, **when** it's created, **then** the time and version of the terms and privacy notice they accepted is recorded, a verification email is sent (link and 6-digit code, valid 30 minutes), and nothing else in Vento opens until the email is verified.
- **Given** an expired or used link, **when** it's opened, **then** they see "This link has expired" with **Send a new link**. Resend is allowed once a minute, 5 times an hour.

### Onboarding steps 1–2
- **Given** a verified person with no organization, **when** they sign in, **then** they go to onboarding step 1. A person who leaves after step 1 resumes at step 2 next time.
- **Given** step 1 is completed, **then** the organization and the person as its **owner** are created together, or neither is.
- **Given** step 2, **when** RC number or TIN don't look right, **then** a warning shows ("RC numbers are digits, like RC 1789234") but **Finish setup** still works. Both can be left blank and added later.
- **Given** an RC number already used by another entity in this organization, **then** it is refused: "Parkview Residences SPV Ltd already uses RC 1789234." (Enforced by the API now; it can only arise when adding or editing entities, whose screens come in brick 3. The first entity at onboarding has nothing to clash with.)

### Sign in and two-step
- **Given** a wrong email or password, **then** the message is the same for both: "That email and password don't match. Check them or reset your password."
- **Given** a member with two-step on, **when** the password is right, **then** the two-step check always follows on a new sign-in, including straight after a password reset.
- **Given** a member whose role requires two-step and who hasn't set it up, **when** they sign in, accept an invitation or have their role changed, **then** they can do nothing else until two-step is set up.
- **Given** two-step setup, **when** the code is verified, **then** 10 single-use backup codes are shown once, with **Download** and **Copy**, and the member must tick "I've saved my backup codes" to continue.
- **Given** a backup code is used, **then** it can't be used again and the member gets an email saying how many are left.
- **Given** a member who requires two-step, **then** they can't turn it off. Others can, after entering a current code.

### Lockout
- **Given** five wrong two-step or backup codes in a row, **then** sign-in for that account is locked for 15 minutes, the boxes turn rose with "Too many wrong codes. Try again in 14:32, or reset your password." (a live countdown; inputs and buttons stay disabled until it ends), and a security alert email is sent.
- **Given** 10 wrong passwords for one account within 15 minutes, **then** the same 15-minute lock and email apply.
- **Given** a locked account, **then** a correct password and code are still refused until the lock ends. A successful sign-in resets the count.

### Forgot and reset password
- **Given** *Forgot password*, **when** any email is entered, **then** the reply is always "If an account exists for grace@ventohomes.ng, a link is on its way" (nobody can find out who has an account). The link is valid for 30 minutes and works once.
- **Given** a new password, **then** it follows the sign-up rules and can't be one of the last 5.
- **Given** a successful reset, **then** every other session of that person ends, a "password changed" security alert is sent, and two-step is still asked at the next sign-in.

### Sessions
- **Given** a sign-in without "Keep me signed in", **then** the session ends after 30 minutes without activity or 12 hours at most. With it ticked, the session lasts 30 days on that device.
- **Given** a session has ended, **then** the next action shows *Session expired*; signing in again (password and two-step) returns to the same page, and unsaved form input stays on the device.
- **Given** a member, **then** they can list their sessions (device and browser, masked IP address, last active, "This device"), end any one, or **Sign out everywhere else**.
- **Given** a session has been ended, **then** its very next request is refused, on any device.

### Invitations
- **Given** an owner or admin, **when** they invite up to 20 emails with a role and optional entity limits, **then** each gets an invitation email naming the organization, who invited them, the role, the entities and the expiry date.
- **Given** an invitation older than 7 days, **when** it's opened, **then** it shows "This invitation expired on 30 Nov 2026. Ask Olumide Bankole to send a new one." and can't be accepted.
- **Given** a pending invitation, **when** it's resent, **then** the old link stops working and the new one gets a fresh 7 days. **When** it's withdrawn, **then** its link shows "This invitation was withdrawn."
- **Given** an email that's already a member, **then** the invite is refused: "aisha@ventohomes.ng is already a member of Vento Homes Ltd."
- **Given** a person who already uses Vento in another organization, **when** they accept, **then** they sign in with their existing account and now belong to both. Brick 3 adds switching between organizations; until then they land in the one they last used.
- **Given** someone signed in as a different email, **when** they open the invitation, **then** they see "This invitation is for aisha@ventohomes.ng" with **Sign out and continue**.
- **Given** an admin, **then** they can't invite anyone as an owner; only owners can.
- **Given** an invitation for a role that can approve, **then** *Accept invitation* lists the modules it can approve in ("Can approve: Sales & CRM, Finance, HR & payroll"). Amount limits appear once approval rules exist (brick 4).

### Members and roles
- **Given** an owner or admin, **when** they change a member's role or entity limits, **then** it takes effect on that member's next request, without them signing in again.
- **Given** any member, **then** they can't change their own role or limits: "You can't change your own access. Ask another owner or admin."
- **Given** the only owner, **when** anyone tries to remove them, demote them or have them leave, **then** it's refused: "Vento Homes Ltd needs at least one owner. Make someone else an owner first."
- **Given** a member is removed, **then** all their sessions in this organization end at once, their status becomes `removed`, everything they did stays in the audit trail under their name, and they can be invited again later.
- **Given** a member who lost their phone and backup codes, **when** an owner (for anyone) or admin (for non-owners) resets their two-step, **then** all their sessions end, they get a security alert and a password-reset link, and they can't sign in until they set a new password from that link; then they set up two-step again. Nobody can reset their own. (Changed after review: a two-step reset in one organization must not let someone who knows the old password into the person's other organizations.)
- **Given** an owner or admin limited to some entities, **when** they invite someone or change a member's limits, **then** they can only give access to entities they can see themselves, never "all entities".

### Permissions and limits
- **Given** each of the nine roles, **when** it calls each Settings action, **then** the result matches the default table above. The table is the test's expected result.
- **Given** a member without permission, **when** they try the action, **then** it's refused by the server (hiding a button is never the protection) with a message naming who can grant it: "Only owners and admins can invite people. Ask Olumide Bankole (owner)."
- **Given** Kunle is limited to Parkview Residences SPV Ltd, **when** he lists entities, **then** he sees only that entity; **when** he asks for Victoria Gardens Dev. Ltd by its ID, **then** the answer is "not found", the same as for an ID that doesn't exist.
- **Given** an entity is archived, **then** members limited only to that entity are warned about beforehand ("2 members can only see this entity"), and the last active entity can't be archived.

### Organization isolation
- **Given** a member of Vento Homes Ltd, **when** any request uses an ID belonging to another organization (an entity, member, invitation or session), **then** the answer is "not found", and nothing about the other organization is revealed or changed.
- **Given** any request, **then** the organization comes only from the signed-in session, never from what the browser sends.

### Audit trail
- **Given** any of these, **then** an audit event records who, what, before → after (where something changed) and when: organization created or edited; entity created, edited or archived; invitation sent, resent, withdrawn, accepted or declined; role or entity limits changed; member removed; two-step turned on, off or reset (and by whom); backup codes regenerated or used; password changed or reset; sign-in succeeded, failed or locked out; sessions ended (one, all others, or by removal).
- **Given** an audit event, **then** nobody, including owners, can change or delete it.
- **Given** an audit event, **then** it never contains a password, code, secret key or full IP address.
- **Given** events about a person's account (sign-ins, lockouts, password and two-step changes), **then** the owners of every organization that person belongs to can see them.

## Behind the scenes
- **Emails** sent in 2a: verify email, reset password, invitation, and security alerts. Until a provider is chosen, development writes each email to the API console; no email leaves the machine.
- **Security alerts are always sent and can't be muted:** sign-in locked, password changed or reset, two-step turned off or reset by someone else, backup code used.
- **Password rules are checked in Vento only:** at least 12 characters and a number (plus not one of the last 5 on reset and change). No outside breached-password service is called, and passwords never leave Vento.
- **Seed data:** Vento Homes Ltd with its three entities and the eight team members from the designs, one per role, for local development and demos.

## UI copy
| Where | Copy |
|---|---|
| Sign-up rules | "At least 12 characters" · "Includes a number" · (reset only) "Different from your last 5 passwords" |
| Verify email | "We sent a link to olumide@ventohomes.ng. It expires in 30 minutes." · "Or enter the code from the email" · **Verify email** · "Resend in 0:42" · **Change email** |
| Onboarding step 1 | Title "Your organization" · "The developer group as a whole. Project companies come next." · **Continue** |
| Onboarding step 2 | Title "First entity" · "Most projects sit in their own company (SPV). Books, bank accounts and tax are kept per entity." · "You can add this later" (under RC and TIN) · **Finish setup** |
| Wrong code | "That code didn't match. Codes change every 30 seconds, so use the newest one." |
| Lockout | "Too many wrong codes. Try again in 14:32, or reset your password." (password lockout: "Too many wrong passwords…") |
| Wrong password | "That email and password don't match. Check them or reset your password." |
| Two-step reset by someone else | "Your two-step sign-in was reset. Set a new password with the link we emailed you, then sign in." |
| Lost phone | "Lost your phone and your codes? Ask an owner or admin to reset two-step." |
| Backup codes | "Save these 10 codes somewhere safe. Each works once." · **Download** · **Copy** · "I've saved my backup codes" |
| Sign in | Title "Sign in" (no subtitle) · "Keep me signed in for 30 days" · "New to Vento? Create an account" |
| Session expired | "Your session has ended. For security, Vento signs you out after 30 minutes without activity." · **Sign in again** |
| Temporary signed-in page | "You're signed in to Vento Homes Ltd as Finance." · "Your workspace arrives in the next release." · **Sign out** · **Sign out everywhere** |
| Invitation expired | "This invitation expired on 30 Nov 2026. Ask Olumide Bankole to send a new one." |
| Permission denied | "Only owners and admins can invite people. Ask Olumide Bankole (owner)." |
| Last owner | "Vento Homes Ltd needs at least one owner. Make someone else an owner first." |
| Own access | "You can't change your own access. Ask another owner or admin." |
| Toasts (brick 3 screens, returned by the API now) | "Invitations sent to 3 people" · "Invitation withdrawn" · "Aisha Bello is now Finance" · "Aisha Bello removed. History kept." · "Signed out of 3 other devices" · "Two-step is on" |
| Security alert subjects | "Vento: sign-in locked for 15 minutes" · "Vento: your password was changed" · "Vento: your two-step sign-in was reset by Olumide Bankole" · "Vento: a backup code was used (9 left)" |
| Lockout email body | "Someone entered 5 wrong codes for your Vento account at 10:30 on 25 Nov 2026. Sign-in is locked until 10:45. If this wasn't you, reset your password now: {link}" |

## Out of scope
- Screens for team members, invitations, permissions, entities and My security (brick 3, with the app shell and settings navigation).
- Owners creating or editing their own roles and the role-template bundles on the Security board ("Site engineer", "Auditor (read-only)"): brick 3.
- Approval rules, approval requests and the Approvals inbox; the audit log page and record timelines (brick 4).
- Onboarding step 3 (first project and units) and the setup checklist: with Projects and Sales.
- Project limits (need projects), organization switching (brick 3), a person creating a second organization.
- Buyer and realtor portal sign-in (with the portals: one-time codes, no passwords).
- Sign-in with Google or Microsoft, two-step codes by SMS, "Trust this device" (see the departures below).
- Entity details beyond registration: bank accounts, UBOs, directors, documents, parent company (Finance and Compliance bricks). Organization logo and branding (brick 3).
- Billing, trials and plans; Vento super-admin and support access.

## Departures from the approved designs
To be logged in `docs/design/CHANGES.md` when the screens are built.

| Board | Change | Why |
|---|---|---|
| Onboarding step 1 | No RC number and no logo; base currency shown as NGN, not chosen | RC and TIN belong to each entity, so they're entered once in step 2. Logo needs file storage (brick 3 branding). NGN is the base for every entity. |
| Onboarding step 2 | No collections bank account | Bank accounts belong to Finance and need a bank name check; it goes on the setup checklist |
| Sign in | No Google or Microsoft buttons | Adds two outside sign-in services before any customer has asked; easy to add later |
| Two-step | No "Send code by SMS"; no "Trust this device for 30 days" | SIM-swap fraud makes SMS codes weak, and there's no SMS provider yet. "Keep me signed in" already gives 30 days, so a second tickbox adds little |
| Reset password | Other sessions always end (no tickbox) | A reset usually means the password may be known to someone else |
| Session expired | Also asks for the two-step code | A new sign-in always asks for two-step |
| Sign up | "30-day trial. No card needed." hidden | No billing or trials yet |

## Screens this slice touches
Rows in `docs/design/SCREENS.md`: Sign in and two-factor challenge · Sign up and verify email · Forgot / reset password · Accept invitation · Onboarding (steps 1–2 only) · Set up two-step and backup codes (new row) · Session expired · Emails: invite, verify, reset · Email: security alert (new row) · Design system (tokens, fonts and form components only). A temporary signed-in page is built and removed in brick 3; it isn't listed.

## Domain changes
Added to `docs/DOMAIN.md` (terms): **Role**, **Permission**, **Access limit**, **Invitation** (statuses `pending → accepted / declined / expired / withdrawn`), **Two-step sign-in**, **Session**, **Security alert**; member status `active → removed`; entity type `holding` / `spv` and status `active → archived`; organization fields. The rules (7-day invitation expiry, lockouts, session lengths, roles requiring two-step) are added once you approve this spec.

## Owner's decisions (25 Nov 2026)
All recommendations below and in the plan were approved:
1. Email: print to the console in development; choose Postmark or Resend by brick 3.
2. Invitations expire after 7 days and can be resent.
3. Sessions end after 30 minutes idle or 12 hours at most; "Keep me signed in" lasts 30 days from sign-in (not extended by use).
4. Two-step is required for owner, admin, finance and HR.
5. The nine built-in roles ship with the default table above; custom roles come in brick 3.
6. The design departures above are accepted.
7. Buyer and realtor portal sign-in come with the portals.
8. 10 wrong passwords in 15 minutes lock sign-in for 15 minutes.
9. Signing up with an email that already has an account replies "Check your email" as usual and emails that account a notice, so nobody can find out who has an account (this replaces the "An account already uses this email" criterion).
10. Vento owns organizations, roles and access in its own tables (decision 0010).
11. In 2a, turning two-step off asks for the password; brick 3 adds the current code.
12. Seed: Tunde Ola (accountant) is a viewer; no seeded admin.
13. (After review) The common/leaked password rule is removed; passwords need 12+ characters and a number.

## Open questions (answered above)
1. **Email provider.** *Recommended:* log emails to the console in development now; pick a provider (Postmark or Resend are simple and reliable) before the first real customer, at the latest in brick 3.
2. **Invitation expiry.** *Recommended:* 7 days, resendable.
3. **Session length.** *Recommended:* 30 minutes without activity or 12 hours at most; 30 days on a device where "Keep me signed in" is ticked (site phones). Two-step is asked at every new sign-in.
4. **Who must use two-step.** The designs say finance and MD, and "anyone who can approve money or see bank details". *Recommended:* owner, admin (they control access) and finance, plus HR (they see salaries and staff bank details).
5. **Your own roles.** *Recommended:* 2a ships the nine roles with the defaults above; you review the table now, and owners can copy and edit roles in brick 3.
6. **Design departures.** *Recommended:* accept the table above (no Google/Microsoft sign-in, no SMS codes, no "trust this device" for now).
7. **Portal sign-in.** *Recommended:* buyer and realtor sign-in come with the portals, not here.

## Later slices
**Brick 3, design system and app shell:** the remaining design-system components, the app shell (navy sidebar showing only the role's modules, top bar, entity switcher, organization switching, mobile bottom tabs, ⌘K), 403/404/500 and offline pages, the settings layout with left navigation, and the access screens on top of 2a's API: Team members and invitations, Permissions (view the matrix, copy and edit roles), Organization and entities, My security (two-step, backup codes, sessions, which roles require two-step), plus the setup checklist. **Brick 4, approvals and audit log:** approval rules per action with amount limits, approval requests (`pending → approved / rejected / expired`, a maker never approves their own, conflicts skipped), the Approvals inbox, the organization-wide audit log and record timelines, and "Request access" from the 403 page. It is built immediately before the first feature that needs a checker, so it is shaped by a real case.
