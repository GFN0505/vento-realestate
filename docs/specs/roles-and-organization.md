# Roles and organization (brick 3c)

- **Status:** shipped (PR #7, 26 Nov 2026)
- **Module:** Platform
- **Journeys:** J-ONB-07 (new: organization profile and companies), J-ONB-08 (new: make a custom role), J-ONB-01 (step 7: a new checklist item), J-ONB-05 (step 3: the switcher is labelled "Company" and gains **+ Add company**), J-ONB-02 and J-ONB-06 (copy only: "Company access")
- **Screens:** see [Screens this slice touches](#screens-this-slice-touches)
- **Decisions:** builds on 0003 (organization contains entities), 0010 (Vento owns roles and access: custom roles need no schema change beyond an archive date), 0011 (append-only audit), 0012 (same-organization keys), 0013 (tab guard), 0014 (entity is a view filter; organization-wide pages hide it), 0016 (availability in the contract); app-shell owner's decisions 6 (branding later) and 12 (never show what a role can't view); team owner's decisions 4 (limited granters) and 6 (save at once with Undo); release plan §8 "Entities vs estates". If question 1 is approved, the architect writes a short record: "Entities are called companies on screen".
- **Branch:** `brick/03c-roles-org`, cut from `brick/03b-team`

## Problem
Olumide set up Vento Homes Ltd with one company during onboarding. He runs Parkview Residences through its own SPV and is about to start Lekki Pearl in a third, and today he can't add either, fix the TIN he left blank, or correct the financial year he guessed. His site engineer, Bayo, needs Projects and Documents but none of Sales, and none of the nine built-in roles fits, so Bayo is either over-powered as a Project manager or useless as a Viewer. Olumide needs to see in plain words what each role can do, make a role that fits the job, and know that adding "another estate" doesn't mean adding a company.

## Persona and job
| Who | Job | How often |
|---|---|---|
| **MD / owner** (Olumide Bankole) | Add each SPV as it's incorporated; check what each role can do before giving it out; correct the organization's name, state or financial year | At setup, then a few times a year |
| **Admin** | Make a role for a job the built-ins don't fit ("Site engineer", "Sales lead"), give it to people, tidy roles nobody uses | At setup, then monthly |
| **Admin limited to one SPV** (project director for Parkview) | Fix Parkview's own TIN or VAT status; see roles read-only | Rarely |
| **Finance** (Aisha Bello) | Nothing new on screen; her company list in the switcher is now correct and complete | – |
| **Every other member** | Nothing new. Their sidebar follows their role as before; a changed role applies on their next click. | – |

## Success looks like
- **Adding a company takes 3 clicks and under 30 seconds** (Companies → **Add company** → **Add company**), or the same from the company switcher.
- **Making "Site engineer" from Project manager takes under 60 seconds**: 4 clicks to the new role, then the ticks, then **Save changes**.
- **What each built-in role can do on screen equals the shared default table exactly.** The test reads `DEFAULT_ROLES` and compares every cell.
- **A changed role applies on its holders' next request** (no sign-out), proven by an API test, and their sidebar follows (3a).
- **Zero duplicate RC numbers** in an organization, archived companies included (the unique index already guarantees it; the screen names the other company).
- **No access can be raised through a role:** nobody can make, change or give a role with more than they have themselves (test across every action).
- **Every new or changed procedure refuses other organizations' IDs** (2a isolation test extended) and is audited.
- Every 3c page works at **375 px** with no sideways scroll and is usable **within 1 second** on a repeat visit over slow 3G.

## Words: "Company", not "Entity" (open question 1)
On every screen a user sees, an entity is a **company**: the top-bar filter reads **Company: All companies**, Settings has **Companies**, Team shows **Company access**, the checklist says **Add your other companies (SPVs)**. Code, the API and `DOMAIN.md` keep the term `entity`.

Why: the people using Vento say "company" (CAC registers companies, banks open accounts for companies, the MD says "our SPV company"); "entity" is accountants' shorthand that the design rules ask us to keep off screens. It also settles the owner's entity-versus-estate worry: nobody mistakes "Company" for an estate, and the Add form says so in one line. The cost is a small copy change in 3a and 3b (switcher, Team, invite and member sheets, help articles, e2e selectors), done in this brick.

## User flow
**Edit the organization profile: 2 clicks**
1. *Settings* (sidebar footer, user menu or ⌘K "Organization") opens *Organization* (1). Change the name, head office state or the month the financial year starts.
2. **Save changes** (2). Toast "Organization details saved".

**Add a company (J-ONB-07): 3 clicks**
1. *Settings → Companies* (1) → **Add company** (2). Or the company switcher in the top bar → **+ Add company** at the foot of the menu, or **Add company** on the Home checklist.
2. *Add company sheet:* one line at the top, "A separate registered company, like an SPV for one estate. To add another estate, create a project instead." Then name, type (**Project company (SPV)** preselected), RC number, TIN, VAT registered. RC and TIN can be left for later.
3. **Add company** (3). Toast "Lekki Pearl Estates Ltd added" with **Switch to it**. It appears in the list and in everyone's switcher who has all-companies access.

**Archive a company: 2 clicks (3 when people would lose access)**
1. Row ⋯ (1) → **Archive** (2). Toast "Lekki Pearl Estates Ltd archived · Undo".
2. If anyone can see only this company, a confirm comes first and names them → **Archive company** (3).

**Restore a company: 2 clicks**
1. **Archived** chip (1) → **Restore** on the row (2). Toast "Lekki Pearl Estates Ltd restored".

**See what a role can do: 2 clicks**
1. *Settings → Roles & permissions* (1) → click **Sales** (2). *Role page:* the ten modules down the side, the six actions across, a tick where the role may act. Read-only, with **Duplicate role** and **Preview this role**.

**Make a custom role (J-ONB-08): 4 clicks to the new role, then the ticks, then 1 to save**
1. *Roles & permissions* (1) → **Project manager** (2) → **Duplicate role** (3).
2. *New role dialog:* Name "Site engineer" (the field holds "Copy of Project manager", selected, so typing replaces it); **Start from** is preset to Project manager → **Create role** (4).
3. The new role's page opens, editable: untick **Sales: View**, **Land & title: View**; tick **Documents: Create**. A bar slides up: "3 changes · applies to nobody yet" → **Save changes**. Toast "Site engineer saved".
4. Give it to Bayo on *Team* (role menu on his row: 2 clicks, unchanged from 3b). Custom roles sit under the built-ins in every role menu.

**Preview a role: 1 click**
1. On any role page, **Preview this role**. Home opens as that role under the 3a banner "Previewing as Site engineer" → **Stop preview**.

**Delete a custom role: 3 clicks**
1. Role page ⋯ (1) → **Delete role** (2) → confirm **Delete Site engineer** (3). Offered only when nobody holds it and no open invitation uses it; otherwise the menu says who to move first.

## Settings layout in 3c
- **Sub-navigation now appears** (SettingsNav; SettingsMobile list on phones), in this order: **Organization** · **Companies** · **Team** · **Roles & permissions**. Each is shown to anyone whose role can view settings (owners, admins, and custom roles with Settings: View). My security joins in 3d. The page content doesn't move when the sub-navigation appears (3b unit test covers 2+ sections).
- `/settings` opens the first section, *Organization*; on phones it shows the section list.
- **Organization-wide pages hide the company switcher** (route flag `orgWide`): *Organization*, *Companies* and every *Roles & permissions* page. *Team* keeps following it (3b).
- **Read-only viewers** (a custom role with Settings: View only) see every section without **Save changes**, **Add company**, row menus, **New role** or editable grids. Server refusals name who to ask.

## Organization page
SetOrg board, "Company" and "Defaults" cards, cut to what Vento uses today.

| Field | Control | Rules |
|---|---|---|
| Organization name | Text, `autoComplete="organization"` | 2–120 characters, trimmed. Shown in the sidebar, emails ("Vento Homes Ltd via Vento") and documents |
| Head office state | Searchable select of the 36 states and FCT (shown "FCT (Abuja)") | Required |
| Financial year | Select "Starts in" January … December, with the span under it: "January – December" | Required. Under it, muted: "Your books and reports use this year." |
| Base currency | Read-only "NGN · ₦" | "Every company keeps its books in naira. Foreign receipts carry their rate." |

- **Save changes** is disabled until something differs; Enter saves. The page warns before leaving with unsaved changes ("Discard changes to Organization?" → **Discard** · **Keep editing**).
- Nothing else from the board (trading name, registered address, customer phone, time zone, date and number formats, week start) is built: the defaults are fixed (Africa/Lagos, `25 Nov 2026`, `1,234,567.89`) and the address and phone belong with branding on the first customer document (app-shell decision 6). See *Departures*.

## Companies page
**Layout.** Settings layout → title **Companies** → context line → toolbar → list. Organization-wide (no switcher).

- **Context line.** Everyone who can view settings: "3 active companies · 1 archived". **Owners on a plan with a company limit:** "2 of 2 active companies on your Starter plan", with **Talk to Vento** once at the limit. Nobody else sees a plan name. Internal and unlimited organizations see the plain count.
- **Primary action: Add company** (top right; sticky above the tabs on phones). Shown to members who can add companies (see *Permissions*).
- **Chips:** **Active** (default) · **Archived**, held in the address (`/settings/companies?show=archived`).
- **List** (server-paginated, 50 a page, A–Z by name):

| Column | Shows |
|---|---|
| Company | Name; under it "Holding company" or "Project company (SPV)" |
| RC number | "RC 1789234" or a muted "Not added" |
| TIN | "1789234-0001" or "Not added" |
| VAT | Badge **VAT registered** (emerald) or "Not registered" (muted text, no badge) |
| ⋯ | Edit · Archive (active) / Restore (archived) |

- **Click a row** to open the *Company sheet* (edit). There is no company detail page in 3c (question 10).
- **Phones:** each row is a card (name, type, then RC · TIN · VAT on one line); tapping opens the sheet full height, and Archive or Restore lives at the foot of the sheet.
- **A limited admin** sees only the companies within their access (as the switcher does), with no **Add company**, Archive or Restore.

## Add company and Company sheets
One side sheet (full screen on phones) for add and edit. Board: none; pattern *side-sheet form*.

- **Intro line (add only):** "A separate registered company, like an SPV for one estate. To add another estate, create a project instead." Muted, above the first field, no link (projects don't exist yet; the Projects brick turns "create a project" into a link).
- **Fields:** Company name (`autoComplete="organization"`, cursor here on desktop) · Type, a two-option segmented control **Holding company** / **Project company (SPV)** (SPV preselected on add) · RC number (`inputMode="text"`, `autoCapitalize="characters"`, normalised on blur to "RC 1789234") · TIN (`inputMode="numeric"`) · VAT registered (switch, off by default). Under RC and TIN: "You can add this later".
- **Format warnings never block** (2a): "RC numbers are digits, like RC 1789234" · "TINs are usually 10 digits, or like 12345678-0001".
- **Buttons:** add: **Add company** · **Cancel**; edit: **Save changes** (disabled until something differs) · **Cancel**. Enter submits; pending state; no double submit.
- **Archived company:** the sheet is read-only with "Archived 2 Dec 2026 by Olumide Bankole" and **Restore**.
- **At the plan limit (owners):** **Add company**, wherever it's pressed (page, switcher, checklist), opens the *plan message* instead of the form, so nobody types into a form that can't save: "Your Starter plan includes 2 active companies. Archive one, or talk to Vento about Growth." → **Talk to Vento** · **Close** (question 11). Other members only learn of the limit from the server's refusal, shown in the sheet with **PlanLimitMessage**; what they typed stays.

## Company switcher changes
- **Label:** "Company" above the current choice; "All companies" for everyone. Type notes stay ("Holding company", "SPV").
- **+ Add company** sits at the foot of the menu, below a divider, for members who can add companies (owners and admins with all-companies access), and never in *Preview as role* for a role that couldn't. It opens the *Add company sheet* over the current page; after adding, the toast's **Switch to it** selects the new company.
- A member with **no active company left** (everything they were limited to was archived) sees the switcher label "No company" and, on Home, a calm card: "You don't have access to any active company in Vento Homes Ltd. Ask Olumide Bankole (owner) to give you access." Their pages show empty states, never another company's data.

## Roles & permissions
**Roles list** (`/settings/roles`; SetPermissions board, partly). Title **Roles & permissions** · "What each role can do. Give roles to people on Team." · primary **New role** (for members who can make roles).

| Column | Shows |
|---|---|
| Role | Name and its one-line description; a quiet "Custom" tag on custom roles |
| People | "3 people" as a link to *Team* filtered by the role (`/settings/team?role=…`); "Nobody" when none; open invitations add "· 1 invited" |
| Two-step | "Required" or "–" |
| ⋯ | Duplicate · Preview this role · Delete role (custom, when nobody holds it) |

- Order: the nine built-ins in the default order (Owner … Viewer), then custom roles A–Z. One list, not paginated (it's bounded; see *Behind the scenes*).
- **No custom roles yet:** under the built-ins, a quiet panel: "Need a role the built-in ones don't fit, like Site engineer? Open the closest role and duplicate it." → **New role**.
- **Phones:** cards (name, description, "3 people · Two-step required"); tap opens the role page.

**Role page** (`/settings/roles/$roleId`; SetPermissions and PermissionsMobile boards).
- **Header:** role name (editable in place for custom roles), description (custom: editable, optional, "Based on Project manager" until changed), "3 people" link, and the actions **Duplicate role** · **Preview this role** · ⋯ (**Delete role**, custom only).
- **Grid:** rows are the ten modules (labels from `MODULE_LABELS`, each with one muted line on what it covers, e.g. "Land & title · parcels, titles, encumbrances"); columns **View · Create · Edit · Delete · Export · Approve**; each cell is a **PermissionCell**: *allowed* (filled tick) or *not allowed* (empty). The *up to a limit* state arrives with approval rules in brick 4. The **Approve** header has a tooltip: "Can approve other people's sensitive actions, such as reversing a receipt." The **Settings** row explains its actions in one line: "Create: invite people, add companies · Edit: change access, roles and the organization · Delete: remove people, archive companies, delete roles".
- **Built-in roles** are read-only, with one line above the grid: "Built-in roles can't be changed. Duplicate this role to make your own version."
- **Custom roles** are editable in place. Ticking any action also ticks **View**; unticking **View** clears the row. A role must keep at least one ticked cell ("Give this role access to at least one area"). Changes collect in a sticky bar: "3 changes · applies to 4 people on their next click" → **Discard** · **Save changes**. Leaving with unsaved changes asks first.
- **Two-step** (custom roles): a switch, "Require two-step sign-in". It starts at the source role's value. It's **locked on** when the role can change settings (Settings: Create, Edit or Delete) or do more than view in Finance or HR, with the reason under it: "Required because this role can manage money, payroll or people's access." (question 4). This matches every built-in role.
- **Phones (PermissionsMobile):** one row per module with its actions as words ("View · create · edit · export", or "No access"). On a custom role, tapping a row opens a bottom sheet with six labelled switches and **Done**; the save bar sits above the tabs.

**New role dialog.** Title "New role" · Name (required, 2–40 characters, unique in the organization, case-insensitive, including built-in names) · **Start from** (select of all roles; preset to the role you came from, else **Viewer**) · **Create role** · **Cancel**. Creates the role with the source's permissions and two-step value, then opens its page ready to edit.

## Setup checklist on Home
- **Rename:** "Add your first entity" becomes **Add your first company**.
- **New item: Add your other companies (SPVs)**, after it. Shown to owners and admins with all-companies access. Detail line when open: "Most estates sit in their own company. Add each SPV you run." Actions: **Add company** (opens the sheet, or the plan message at the limit) and a quiet **We only have one company**.
- **Done when** a second company exists (active or archived), detail "3 companies"; or when someone answered **We only have one company**, detail "Just Victoria Gardens Dev. Ltd". The answer is a recorded fact about the organization (who, when), not a hand tick, and adding a second company later replaces the detail (question 12).

## Acceptance criteria

### Permissions (server-side; the UI only mirrors them)
"All-companies access" means the member isn't limited to some companies.

| Action | Needs | Extra rules |
|---|---|---|
| See *Organization*, *Companies*, *Roles & permissions*, any role page | settings `view` | Limited members see only their companies |
| Edit the organization profile | settings `edit` + all-companies access | – |
| Add a company; answer "We only have one company" | settings `create` + all-companies access | Plan limit |
| Edit a company's details | settings `edit` | Only companies within the member's access |
| Archive or restore a company | settings `delete` + all-companies access | Last active company kept; restore checks the plan limit |
| Create a role | settings `create` + all-companies access | Permission ceiling |
| Edit a custom role | settings `edit` + all-companies access | Ceiling; not the role you hold; built-ins never |
| Delete a custom role | settings `delete` + all-companies access | Nobody holds it, no open invitation uses it; within the deleter's own permissions (ceiling) |
| Give a role (invite, change role) | as 3b | **New:** the role must be within the granter's own permissions |
| Preview this role | settings `view` (3a rule) | – |

- **Given** each of the nine built-in roles, **when** it calls each 3c procedure, **then** the result matches the table; the expected result is read from the shared permission table (2a test, extended).
- **Given** Grace (sales) types `/settings/companies` or `/settings/roles`, **then** she sees *403* ("Settings is for owners and admins. Ask Olumide Bankole (owner)…") and nothing is requested.
- **Given** the admin limited to Parkview Residences SPV Ltd, **then** *Companies* lists only Parkview, without **Add company**, Archive or Restore; its sheet lets them edit Parkview's details; *Organization* and every role page are read-only with "Only people with access to every company can change this. Ask Olumide Bankole (owner)." The server refuses the same actions with the same message.
- **Given** a custom role with Settings: View only, **then** every section is read-only and every change procedure refuses it: "Only owners and admins can change this. Ask Olumide Bankole (owner)."
- **Given** an admin previewing as Sales, **then** Settings, **+ Add company** and the checklist disappear, as for Sales.

### Organization profile
- **Given** a change, **when** **Save changes** is pressed, **then** only changed fields are saved and audited as `organization.updated` with before → after (2a), and the sidebar, the organization switcher and new emails use the new name at once.
- **Given** a name under 2 or over 120 characters, or with hidden characters, **then** the field error from 2a shows and nothing is saved.
- **Given** two owners save different fields at the same moment, **then** both changes apply (only changed fields are sent). **Given** both change the same field, **then** the later save wins and both are in the audit trail.
- **Given** the financial year changes, **then** it saves now; once Finance has closed a period (Finance brick), changing it will need finance's approval. That rule belongs to the Finance spec.

### Companies
- **Given** a valid name and type, **when** **Add company** is pressed, **then** the company is created in one transaction with its audit event (`entity.created`), the plan limit is checked inside that transaction (feature-flags rule), and the switcher of every member with all-companies access offers it on their next request.
- **Given** an RC number already used by another company in the organization, **then** it's refused naming it: "Parkview Residences SPV Ltd already uses RC 1789234." **Given** that company is archived, **then** "Lekki Pearl Estates Ltd (archived) already uses RC 1904417." with **Restore it instead** for members who can restore. The RC is compared after normalising ("rc-1789234" and "RC 1789234" clash). Nothing typed is lost.
- **Given** two people add companies with the same RC at the same moment, **then** one succeeds and the other is refused by the unique index with "Another company already uses RC 1789234." (existing API rule).
- **Given** an owner on Starter with 2 active companies, **when** they press **Add company** anywhere, **then** the plan message opens instead of the form. **Given** an admin in the same organization, **then** the form opens; on submit the server refuses with `plan_limit` and **PlanLimitMessage** shows "Your organization has reached its limit of 2 active companies. Ask Olumide Bankole (owner)."; the fields stay.
- **Given** two admins add the last allowed company at the same moment, **then** only one succeeds; the other sees the limit message (feature-flags concurrency rule).
- **Given** an edit, **then** only changed fields are saved and audited (`entity.updated`); the RC rule applies; **Save changes** stays disabled until something differs.
- **Given** an archived company, **when** someone tries to edit it (sheet or API), **then** it's refused: "Lekki Pearl Estates Ltd is archived. Restore it to make changes." (*New server rule:* archived companies are read-only.)

### Archiving and restoring
- **Given** a company nobody is limited to alone, **when** **Archive** is chosen, **then** it's archived at once, audited (`entity.archived`), and the toast offers **Undo** for 8 seconds (Undo is a restore, audited as `entity.restored`).
- **Given** members whose only active company is this one, **then** a confirm comes first: "Archive Lekki Pearl Estates Ltd?" naming up to three of them ("Kunle Ojo, Ope Martins and 1 other can only see this company. They'll see no company data until you give them access to another.") → **Archive company**. *API change:* `archivePreview` returns the names the viewer may see, not just a count.
- **Given** the last active company, **then** **Archive** is shown disabled with the reason "Vento Homes Ltd needs at least one active company." and the server refuses with the existing message. **Given** two people archive the last two companies at the same moment, **then** the second is refused (the organization lock serialises them).
- **Given** an archived company, **then** it leaves the switcher, can't be granted on Team (2a), keeps its RC number, and links to it show "That company isn't available. Showing all companies." (3a, renamed). Its records and audit history stay.
- **Given** members limited to an archived company, **then** their limit is kept (not deleted), *Team* shows it in their access as "Lekki Pearl Estates Ltd (archived)", and the member sheet's tick list doesn't offer it.
- **Given** **Restore**, **then** the company becomes active, audited as `entity.restored`, the plan limit is checked in the same transaction, and members limited to it see it again on their next request. **Given** restoring would pass the limit, **then** the owner sees the plan message and others see **PlanLimitMessage**.
- **Given** the company was already archived or restored by someone else, **then** the action is refused as the latest state ("Lekki Pearl Estates Ltd is already archived. The list is up to date.") and the list refetches.

### Roles: viewing
- **Given** any built-in role, **then** its grid equals `defaultPermissions` for that role, cell for cell, and its two-step column equals `requiresTwoStep` (test derived from the shared table).
- **Given** a built-in role, **then** the page has no editable controls, and `roles.update` and `roles.delete` refuse it: "Built-in roles can't be changed. Duplicate it to make your own."
- **Given** the People link, **then** it opens *Team* filtered by that role, keeping Team's own entity-switcher behaviour.

### Roles: creating, editing, deleting
- **Given** **Create role** with a name and a source role, **then** a custom role is created in one transaction with the source's permissions and two-step value, audited as `role.created` (name, source role, permissions), and its page opens.
- **Given** a name already used by any role in the organization (any case), **then** "A role called Site engineer already exists." on the field.
- **Given** a save, **then** the role's permissions and two-step are replaced in one transaction, audited as `role.updated` with before → after (actions added and removed per module, two-step, name), and the toast "Site engineer saved · Undo" offers 8 seconds to put it back (a second audited change).
- **Given** a role change, **then** each holder's next request uses it without signing in again; their sidebar and tabs follow (3a); a page they can no longer view becomes *403*; if two-step is now required and they haven't set it up, the shell sends them to *Set up two-step* first (2a).
- **Given** the two-step switch on a role that can change settings or do more than view in Finance or HR, **then** it's on and locked, and the server rejects `requiresTwoStep: false` for such a role: "This role needs two-step sign-in because it can manage money, payroll or people's access."
- **Given** someone holds the custom role, **when** they open its page, **then** it's read-only with "You have this role. Ask another owner or admin to change it." and the server refuses edits to the caller's own role (prevents locking yourself out).
- **Given** two admins edit the same role, **when** the second saves, **then** it's refused because the role changed since it loaded: "Aisha Bello changed Site engineer a moment ago. Reload to see the latest, then make your change again." with **Reload**; nothing is overwritten. (*New:* `roles.update` takes the version it was loaded at.)
- **Given** **Delete role** on a custom role that active members or open invitations hold, **then** the menu item reads "Move 3 people to another role first" and links to *Team* filtered by the role; the server refuses with the same counts.
- **Given** a custom role nobody holds, **when** **Delete Site engineer** is confirmed, **then** it disappears from every list and menu, audited as `role.deleted`. If removed members or past invitations still refer to it, it's kept hidden for history (archived) rather than erased (non-negotiable 7); its name can be reused.
- **Given** someone assigns a role at the same moment another deletes it, **then** one wins: the assignment is refused with "That role no longer exists. Choose another." or the delete is refused because someone holds it. The role row is locked in both transactions.
- **Given** an organization with 50 custom roles, **then** **New role** is refused: "You can have up to 50 custom roles. Delete one you no longer use." (a guard, not a plan limit).

### Permission ceiling (new server rule)
- **Given** a member, **then** they can create or save a role only if every ticked action is one they have themselves, and can give a role (invite or change role) only if it is within their own permissions. Refused: "You can only give access you have yourself."
- **Given** a custom role that can do things the member can't, **when** they try to delete it, **then** it's refused: "Finance lead can do things you can't. Ask Olumide Bankole (owner) to change it." (review fix, 26 Nov 2026)
- **Given** a member whose role has fewer permissions than someone else's, **then** they can't change, reset or remove that person or withdraw that invitation; the row is read-only with "Kemi Adebayo can do things you can't. Ask Olumide Bankole (owner) to change it." This extends the 3b `manage-rules` (new reason `wider_permissions`). Owners and admins have every permission, so nothing changes for them today.

### Preview
- **Given** **Preview this role** on any role, **then** 3a's preview starts for it (navigation only; requests keep the previewer's own access) and Home opens. **Given** unsaved changes on the page, **then** the button is disabled with "Save your changes to preview them."
- **Given** a custom role, **then** its mobile tabs are its first three viewable modules in sidebar order (3a rule).

### Setup checklist
- **Given** an organization with one active company and no answer, **then** owners and admins with all-companies access see **Add your other companies (SPVs)** open, with **Add company** and **We only have one company**.
- **Given** **We only have one company**, **then** the item is done with "Just Victoria Gardens Dev. Ltd", stored on the organization with who and when, audited as `organization.updated`, and the toast offers **Undo**.
- **Given** a second company is added, **then** the item is done with "2 companies", whatever was answered.
- **Given** the checklist counts, **then** they read only the active organization's companies; the detail never names a company outside the viewer's access.

### Organization isolation
- **Given** any 3c procedure (organization, companies, roles, checklist answer, and `members.updateAccess` / `invitations.create` with a custom role) called with an ID from another organization, **then** the answer is "not found" and nothing is read, changed or audited. The 2a isolation test covers every new procedure.
- **Given** a role ID from another organization in an invite or role change, **then** it's "not found" (composite foreign keys, decision 0012).
- **Given** two tabs and an organization switch in one, **then** the other tab's next 3c request is refused by the tab guard (decision 0013); a half-filled company sheet or role grid stays on screen.

### Empty, error, loading and offline
- **Given** *Companies* → **Archived** with none, **then** "No archived companies." **Given** no custom roles, **then** the panel above.
- **Given** loading, **then** skeletons in the final layout (rows on desktop, cards on phones; the role grid's ten rows). **Given** failure, **then** "Companies couldn't load. Check your connection and try again." / "Roles couldn't load…" → **Try again**.
- **Given** offline, **then** the 3a banner shows; saves fail with the 3a offline message and keep what was typed or ticked; nothing changes optimistically.
- **Given** the session expires with a sheet, dialog or unsaved grid open, **then** 2a's session-expired dialog appears over it and the work is still there after signing in.

### Mobile and keyboard
- **Given** 375 px, **then** lists become cards, sticky primary actions sit above the tabs, every target is at least 44 px, sheets are full height and their main button stays above the keyboard.
- **Given** the keyboard, **then** the grid is a set of labelled checkboxes ("Projects: Create") reachable with Tab and toggled with Space; ⌘S saves a dirty role or form; Esc closes sheets and dialogs and returns focus.
- **Given** ⌘K, **then** it offers **Go to Organization**, **Go to Companies**, **Add company**, **Go to Roles & permissions**, **New role**, and each role by name ("Sales role"), each only with permission. On *Companies* and *Roles & permissions*, `n` opens **Add company** / **New role**; listed under `?`.

## Behind the scenes
- **Existing API (2a), used as is:** `organization.get`, `organization.update`, `entities.list`, `entities.get`, `entities.create`, `entities.update`, `entities.archive`, `roles.list`, `members.updateAccess`, `invitations.create`. All audited.
- **API additions (for the architect):**
  - `entities.restore({ id })` (settings `delete`, all-companies, plan limit in the transaction, `entity.restored`).
  - `entities.archivePreview` returns `{ isLastActive, members: { count, names[] } }`, names limited to the viewer's access.
  - `entities.update` refuses archived companies; `entities.create`, `archive` and `restore` and `organization.update` require all-companies access (open question 2).
  - `entities.list` gains `q` and is used with `status` for the chips.
  - `roles.get({ id })`, `roles.create({ name, sourceRoleId })`, `roles.update({ id, version, name?, description?, requiresTwoStep?, permissions? })`, `roles.delete({ id })`. Custom roles get `key = null`, `isSystem = false`, `pluralName` derived ("people with the Site engineer role"), and `archivedAt` for roles kept for history; the name index becomes partial (`archivedAt is null`).
  - `roles.list` adds `memberCount` and `invitedCount` per role.
  - Two-step lock and permission ceiling as shared pure functions in `packages/shared/src/access` so the screen and server can't drift; `manage-rules` gains `wider_permissions`.
  - Checklist: item `other_companies`; organization field `singleCompanyConfirmedAt` / `…By`.
  - `me` exposes `canAddCompany` (settings `create` and all-companies access) for the switcher, Home and ⌘K.
- **Permissions apply on the next request:** the member context already loads role permissions per request (`access/context.ts`); no session change is needed. Any per-request cache must be keyed by role `updatedAt`.
- **Audit:** new events `role.created`, `role.updated`, `role.deleted`, `entity.restored`; existing `organization.updated`, `entity.created`, `entity.updated`, `entity.archived`. Undo is an ordinary second event.
- **Maker-checker (non-negotiable 12):** approvals arrive in brick 4. **Now:** every change is audited with before → after; the guardrails above (all-companies rule, permission ceiling, two-step lock, not your own role, last active company) stand in for a second person. **Brick 4:** a default approval rule "Change a role's permissions" (a second owner or admin approves when the organization has two or more), and "Make someone an owner" if the owner wants it. Archiving companies (reversible) and the organization profile don't need a checker (question 13).
- **No new emails.** The 3b "is now an owner" alert is unchanged; custom roles can never be owners.
- **Plans:** companies count against the `entities` limit (active only); roles have no plan limit (core feature).

## UI copy
| Where | Copy |
|---|---|
| Settings sub-navigation | "Organization" · "Companies" · "Team" · "Roles & permissions" |
| Settings list on phones (one line each) | Organization: "Name, head office and financial year" · Companies: "Your holding company and SPVs" · Team: (3b) · Roles & permissions: "What each role can do" |
| Organization page | Title "Organization" · "Your developer group. Each company inside it is set up under Companies." · labels "Organization name" · "Head office state" · "Financial year" ("Starts in", span "January – December", help "Your books and reports use this year.") · "Base currency" "NGN · ₦" ("Every company keeps its books in naira. Foreign receipts carry their rate.") · **Save changes** |
| Leave with unsaved changes | Title "Discard changes to Organization?" · **Discard** · **Keep editing** (role page: "Discard changes to Site engineer?") |
| Companies header | Title "Companies" · "3 active companies · 1 archived" · owner on a limited plan: "2 of 2 active companies on your Starter plan" **Talk to Vento** · **Add company** · chips "Active" "Archived" |
| Companies list | "Holding company" · "Project company (SPV)" · "Not added" · badge "VAT registered" · "Not registered" · menu "Edit" · "Archive" · "Restore" · disabled reason "Vento Homes Ltd needs at least one active company." |
| Add company sheet | Title "Add company" · "A separate registered company, like an SPV for one estate. To add another estate, create a project instead." · "Company name" · "Type" "Holding company" / "Project company (SPV)" · "RC number" · "TIN" · "You can add this later" · "VAT registered" · **Add company** · **Cancel** |
| Company sheet (edit) | Title = company name · **Save changes** · archived: "Archived 2 Dec 2026 by Olumide Bankole" **Restore** |
| Format warnings (2a) | "RC numbers are digits, like RC 1789234" · "TINs are usually 10 digits, or like 12345678-0001" |
| RC refusals | "Parkview Residences SPV Ltd already uses RC 1789234." · "Lekki Pearl Estates Ltd (archived) already uses RC 1904417." **Restore it instead** · "Another company already uses RC 1789234." |
| Plan message (owner) | Title "All your plan's companies are in use" · "Your Starter plan includes 2 active companies. Archive one, or talk to Vento about Growth." · **Talk to Vento** · **Close** |
| Plan limit (others) | "Your organization has reached its limit of 2 active companies. Ask Olumide Bankole (owner)." |
| Archive confirm | Title "Archive Lekki Pearl Estates Ltd?" · "Kunle Ojo, Ope Martins and 1 other can only see this company. They'll see no company data until you give them access to another. Its records stay, and you can restore it later." · **Archive company** · **Cancel** |
| Company toasts | "Lekki Pearl Estates Ltd added" **Switch to it** · "Lekki Pearl Estates Ltd updated" · "Lekki Pearl Estates Ltd archived · Undo" · "Lekki Pearl Estates Ltd restored" · "Organization details saved" |
| Company errors | "Lekki Pearl Estates Ltd is archived. Restore it to make changes." · "Lekki Pearl Estates Ltd is already archived. The list is up to date." · "Only people with access to every company can change this. Ask Olumide Bankole (owner)." |
| Company switcher | Label "Company" · "All companies" · notes "Holding company" / "SPV" · footer "+ Add company" · no company: "No company" · Home card "You don't have access to any active company in Vento Homes Ltd. Ask Olumide Bankole (owner) to give you access." · link toast "That company isn't available. Showing all companies." |
| Roles list | Title "Roles & permissions" · "What each role can do. Give roles to people on Team." · **New role** · columns "Role" "People" "Two-step" · "Custom" · "3 people" · "Nobody" · "· 1 invited" · "Required" · menu "Duplicate" · "Preview this role" · "Delete role" · empty panel "Need a role the built-in ones don't fit, like Site engineer? Open the closest role and duplicate it." **New role** |
| Role page | "3 people" · **Duplicate role** · **Preview this role** · built-in note "Built-in roles can't be changed. Duplicate this role to make your own version." · columns "View" "Create" "Edit" "Delete" "Export" "Approve" · Approve tooltip "Can approve other people's sensitive actions, such as reversing a receipt." · Settings row "Create: invite people, add companies · Edit: change access, roles and the organization · Delete: remove people, archive companies, delete roles" · description placeholder "What this role is for" · default "Based on Project manager" |
| Module lines | Land & title "Parcels, titles, encumbrances" · Projects & construction "Projects, budgets, site diary, purchase orders" · Sales & CRM "Buyers, units, subscriptions, payment plans" · Finance "Receipts, ledger, bills, tax" · Facility & estate "Estates, residents, service charge" · HR & payroll "Staff, payroll, leave" · Compliance "KYC, AML, permits" · Documents & contracts "Letters, contracts, templates" · Executive analytics "Dashboards and reports" · Settings "Organization, companies, team, roles" |
| Two-step switch | "Require two-step sign-in" · locked: "Required because this role can manage money, payroll or people's access." |
| Save bar | "3 changes · applies to 4 people on their next click" / "· applies to nobody yet" · **Discard** · **Save changes** · preview disabled: "Save your changes to preview them." |
| New role dialog | Title "New role" · "Name" (prefill "Copy of Project manager") · "Start from" · **Create role** · **Cancel** |
| Delete role | Menu when held: "Move 3 people to another role first" · confirm title "Delete Site engineer?" · "Nobody has this role. It will no longer be offered on Team. Its history stays in the audit trail." · **Delete Site engineer** · **Cancel** |
| Role toasts | "Site engineer created" · "Site engineer saved · Undo" · "Site engineer deleted" |
| Role errors | "A role called Site engineer already exists." · "Give this role access to at least one area" · "Enter a name for the role" · "Built-in roles can't be changed. Duplicate it to make your own." · "You have this role. Ask another owner or admin to change it." · "Aisha Bello changed Site engineer a moment ago. Reload to see the latest, then make your change again." **Reload** · "That role no longer exists. Choose another." · "You can only give access you have yourself." · "Kemi Adebayo can do things you can't. Ask Olumide Bankole (owner) to change it." · "This role needs two-step sign-in because it can manage money, payroll or people's access." · "You can have up to 50 custom roles. Delete one you no longer use." |
| List errors | "Companies couldn't load. Check your connection and try again." · "Roles couldn't load. Check your connection and try again." **Try again** · "No archived companies." |
| Setup checklist | "Add your first company" · "Add your other companies (SPVs)" ("Most estates sit in their own company. Add each SPV you run.") **Add company** · "We only have one company" · done "3 companies" / "Just Victoria Gardens Dev. Ltd" |
| 3b copy renamed | "Entity access" → "Company access" · "All entities" → "All companies" · "Only some entities" → "Only some companies" · "2 entities" → "2 companies" · "One of the entities you chose is no longer available. Choose again." → "One of the companies you chose…" · "has access to entities you can't see" → "has access to companies you can't see" · "Choose at least one entity, or allow all" → "Choose at least one company, or allow all" |
| ⌘K | "Go to Organization" · "Go to Companies" · "Add company" · "Go to Roles & permissions" · "New role" · "Sales role" |

## Departures from the approved designs
To be logged in `docs/design/CHANGES.md` when built.

| Board | Change | Why |
|---|---|---|
| SetOrg | One page (organization, defaults and entities table) becomes two sections, *Organization* and *Companies* | Team's left-nav pattern; each page does one job |
| SetOrg | No trading name, legal name or RC on the organization; no registered address, customer phone, time zone, date and number format or week start | RC and TIN belong to each company; address and phone go with branding on the first document (app-shell decision 6); formats are fixed defaults, not settings |
| SetOrg | No "CAC verified" badge; entities table has no Projects column | No CAC lookup exists; projects arrive with their brick |
| SetPermissions | Rows are the ten modules, not sub-areas (Purchase orders, Receipts, Refunds…) | Permissions are per module (2a); sub-area rules are approval rules (brick 4) |
| SetPermissions | No "Limited to" column, no "≤" cells, no separation-of-duties banner | Company limits belong to each member (Team); approval limits and separation of duties are brick 4 |
| SetPermissions | Role select and "Start from template" become a roles list, a role page, and a New role dialog; Save becomes a bar that appears on change | Seeing every role and who holds it is the first question; a Save that's always on screen invites "did it save?" |
| SetPermissions | Column order View · Create · Edit · Delete · Export · Approve | Approve is the special one; it sits last with its tooltip |
| PermissionsMobile | Tapping a module on a custom role opens a sheet of six switches | Six 18 px boxes in a row fail 44 px targets |
| EntityDetail | Not built in 3c; a row opens the Company sheet | The page's substance is bank accounts, documents and directors (Finance, Compliance); four fields don't need a page |
| Top bar (ExecutiveHome) | "ENTITY" → "Company"; "+ Add company" at the foot of the menu | Plain words (question 1); owner's note on entities vs estates |
| Settings sub-navigation | "Users & roles" / "Permissions" → "Team" / "Roles & permissions"; only built sections shown | 3b names; decision 12 |

## Screens this slice touches
| Screen (row in SCREENS.md) | Boards | What 3c builds |
|---|---|---|
| Settings layout with left sub-navigation | SetOrg, DSAdditions, SettingsMobile | Sub-navigation and phone list now shown (4 sections) |
| Organization profile (new row) | SetOrg (partly) | Name, head office state, financial year |
| Companies list (new row) | SetOrg (entities table) | List, chips, plan line, archive with Undo or confirm, restore |
| Add company / Company sheet (new row) | – | Pattern: side-sheet form; plan message dialog |
| Roles & permissions list (new row) | SetPermissions (partly) | Roles, people, two-step, row menu |
| Role page (new row) | SetPermissions, PermissionsMobile | Grid, two-step, save bar, Duplicate, Preview, Delete |
| New role dialog and delete confirm (new row) | – | Pattern: dialog |
| App shell | – | Switcher labelled Company; + Add company; "No company" state |
| Setup checklist on Home | Onboarding, DSAdditions | Renamed first item; new "other companies" item |
| Team, invite and member sheets | RolesSettings | Copy "Company access"; custom roles in role menus; ceiling read-only reason |
| Entities list and entity detail (Finance section) | EntityDetail | Unchanged; the detail page waits for bank accounts |

## Journeys
Added to `docs/journeys/01-onboarding-and-access.md` as **draft**: **J-ONB-07** *Set up the organization and its companies* (`e2e/settings/organization-and-companies.spec.ts`) and **J-ONB-08** *Make a role that fits the job* (`e2e/settings/custom-roles.spec.ts`). Notes added to J-ONB-01 step 7 (checklist item) and J-ONB-05 step 3 (switcher). When built, J-ONB-02, J-ONB-05 and J-ONB-06 and their help articles take the "Company" wording.

## Domain changes
To add to `docs/DOMAIN.md` once approved:
- **Entity** (notes): "Shown on screen as **company** ('Company: All companies', *Settings → Companies*); code and this guide say entity. Status `active ⇄ archived`: an archived entity can be restored (within the plan limit) and is read-only while archived. It keeps its RC number, so the number can't be reused. Members limited to it keep the limit."
- **Current entity** (meaning): "chosen in the company switcher"; notes: "A member whose every entity is archived sees 'No company' and empty pages."
- **Role** (notes): add "Custom roles are made by duplicating any role, then editing its actions per module and whether two-step is required. A custom role is deleted only when no active member or open invitation holds it; one with history is kept hidden. Changes apply on holders' next request."
- **System role** (notes): "owners copy one" → "owners and admins duplicate one (brick 3c)".
- **Custom role** (new term): "A role an organization makes from a built-in or another custom role. Never an owner. Up to 50 per organization."
- **Access rules:** add "**Organization-wide changes** (the organization profile, adding, archiving and restoring companies, and making, editing or deleting roles) need access to every company." · "**Permissions can't be raised by the granter:** a member can make or edit a role, or give one, only within their own permissions, and can manage only people whose role is within their own." · "**Two-step is required** for any role that can create, edit or delete in Settings, or do more than view in Finance or HR (this is why owner, admin, finance and HR require it)." · "Nobody can edit the role they hold."
- **Setup checklist** (notes): add "'Add your other companies (SPVs)' is done when a second company exists or someone answers 'We only have one company' (recorded on the organization)."

## Out of scope
- Bank accounts, directors, UBOs, documents and the entity detail page (Finance, Compliance). Branding, logo, registered address and customer phone (with the first customer document).
- Approval limits, the "up to a limit" cell, separation of duties and approval rules for role changes (brick 4). Passkeys and My security (3d).
- Project limits and a project filter (Projects brick). Permissions per sub-area (receipts vs bills) beyond the ten modules.
- Editing built-in roles; a compare-all-roles overview; moving everyone from one role to another in one action (use Team's role filter and change each row); role templates shared across organizations.
- Deleting a company, merging companies, transferring records between companies, intercompany setup (Finance R3).
- CAC or tax-ID lookups; any change to how a financial-year change affects closed periods (Finance).

## Owner's decisions (26 Nov 2026)
All 14 recommendations below were approved as written.

## Open questions (answered above; recommendations in bold)
1. **"Company" or "Entity" on screen?** The owner's note suggests "Company" for the switcher. *Recommended:* **"Company" everywhere a user reads it** (switcher, Settings → Companies, Team's "Company access", checklist), with `entity` kept in code, the API and DOMAIN. Mixing the two words would be worse than either. It costs a copy change to 3a and 3b screens, tests and help articles in this brick.
2. **One rule for organization-wide changes.** Only people with access to every company can edit the organization profile, add, archive or restore companies, and make, edit or delete roles. A limited admin can still fix their own company's details. *Recommended:* **yes.** A Parkview-only admin shouldn't add companies they then can't see, or change a role used across the group.
3. **Permission ceiling.** Nobody can make, edit or give a role with actions they don't have, or manage someone whose role can do more than theirs. It only bites custom roles (owners and admins have everything). *Recommended:* **yes.** Without it, a custom "Office manager" with Settings: Edit could make someone an Admin.
4. **Two-step for custom roles.** A switch, locked on when the role can change settings or do more than view in Finance or HR (matching every built-in role); otherwise it starts at the source role's value. *Recommended:* **yes.** It prevents "Finance without two-step" with no extra setting to explain.
5. **Who makes roles.** *Recommended:* **owners and admins** (settings create, edit, delete), as with everything else in Settings, rather than owners only. Admins can already give the Admin role, so roles add no new power; brick 4 can add a checker.
6. **Can someone edit the role they hold?** *Recommended:* **no**, like their own access on Team. It stops a person removing their own Settings access by accident.
7. **A tick per action (the board) or a level per module ("View", "Edit", "Full")?** *Recommended:* **a tick per action**, matching the board and the read-only grid, with "any tick adds View" and "untick View clears the row". Levels are tidier but can't say "view and export" or "view and approve".
8. **Saving a role:** at once with **Undo**, with the save bar saying how many people it affects; no confirm. *Recommended:* **yes**, the same as role changes on Team.
9. **Deleting a custom role:** only when no active member or open invitation holds it; a role with history is kept hidden instead of erased. *Recommended:* **yes.**
10. **Archiving a company:** at once with **Undo** when nobody depends on it alone; a confirm naming the people otherwise; plus **Restore** for archived companies (within the plan limit) and read-only while archived. No company detail page until bank accounts arrive. *Recommended:* **yes.** Without Restore, a mistaken archive is permanent, and the RC number can never be used again.
11. **Owner at the company limit:** **Add company** opens the plan message instead of a form that can't save. *Recommended:* **yes.** Admins keep the 3b pattern (server refusal naming the owner).
12. **Checklist item "Add your other companies (SPVs)":** done when a second company exists, or when someone answers **We only have one company** (recorded on the organization, with Undo). *Recommended:* **yes.** Many small developers have one company, and an item they can never finish is noise.
13. **Maker-checker:** 3c audits every change and relies on the guardrails above; brick 4 adds a default approval rule "Change a role's permissions" (second owner or admin, when there are two or more). Archiving companies and the organization profile need no checker. *Recommended:* **yes.**
14. **Organization profile fields:** name, head office state and financial year only; the board's address, phone, time zone and formats are left out. *Recommended:* **yes.** Address and phone return with branding on the first customer document.
