# Onboarding and access

## J-ONB-01 · Set up a new organization
**Who / how often:** MD or admin, once per customer.
**Starts from:** Sign-up link from the website or a Vento sales invite.

Spec: [accounts-and-access](../specs/accounts-and-access.md) (steps 1–4 and the two-step setup; step 5 onwards comes with Projects and Sales).

**Steps**
1. *Sign up:* name, company, work email, password (≥ 8 characters with an uppercase letter, a lowercase letter, a number and a special character) and confirm password, accept terms and privacy notice → **Create account**.
2. *Verify email:* link or 6-digit code from the email (valid 30 minutes) → **Verify email**.
3. *Onboarding, step 1 (organization):* organization name (pre-filled from Company), head office state, financial year start (January). Base currency NGN is shown, not chosen → **Continue**.
4. *Onboarding, step 2 (first entity):* entity name (pre-filled), type (holding company or SPV), RC number, TIN, VAT registered? RC and TIN can be left for later → **Finish setup**.
5. *Set up two-step:* the owner scans the QR code, enters a code and saves 10 backup codes.
6. *Onboarding, step 3 (first project and units):* project name, location, type, then "Add units now" (bulk create) or "Import from Excel" or "Skip". *(Projects and Sales bricks.)*
7. Lands on *Home* inside the *App shell* (brick 3a replaces the temporary signed-in page). From brick 3b ([team](../specs/team.md)), Home also shows the *Setup checklist* to owners and admins: "Create your organization", "Add your first entity" and "Turn on two-step sign-in" ticked from the data, then "Invite your team" with **Invite people** (opens the *Invite people sheet* over Home). Other steps (other entities, approval rules, bank account, Paystack, import, first project, BoQ, reminders) appear only once their feature is available. **Hide checklist** hides it for this person; ⌘K "Show setup checklist" brings it back. *(Brick 3c, draft, [roles-and-organization](../specs/roles-and-organization.md): the first-entity item reads "Add your first company", and owners and admins with access to every company get "Add your other companies (SPVs)" with **Add company** and a quiet **We only have one company**; it's done when a second company exists or someone gives that answer.)*

**Behind the scenes:** step 1 creates the organization and the person as its owner in one transaction; step 2 creates the entity. Each step saves, so the user can leave and resume. Audit events written for each. Later bricks add the entity's default chart of accounts, default approval rules and current statutory rules.
**Done when:** the organization and first entity exist, the owner has two-step on and sees the signed-in page (later: their project on Home with checklist step 1 done).
**Watch for:** email already registered (offer sign in); unverified email (back to *Verify email*); leaving mid-onboarding and coming back resumes at the next unfinished step; RC/TIN format warnings never block ("You can add this later"); RC number already used by another entity in the organization is refused when adding entities (brick 3; it can't happen for the first entity).
**Target:** under 3 minutes and 4 clicks to a saved organization and entity; ≤ 5 minutes to first project. **Test:** `e2e/onboarding/new-organization.spec.ts` **Status:** built (steps 1–2; step 3 with Projects)

## J-ONB-02 · Invite the team and set roles
**Who / how often:** Owner or admin, at setup then occasionally.
**Starts from:** *Setup checklist* on Home ("Invite your team" → **Invite people**), *Settings → Team*, or ⌘K "Invite".

Spec: [team](../specs/team.md) (brick 3b, the screens and email delivery) on [accounts-and-access](../specs/accounts-and-access.md) (brick 2a, the invitee's side and the API).

**Steps**
1. *Team* → **Invite people** (1 click), or **Invite people** on the checklist (the same sheet opens over Home).
2. *Invite people sheet:* paste or type up to 20 emails (lists copied from Excel, Gmail or Outlook work; duplicates merge; typos get "Did you mean…?"). **Role** is preselected for everyone (the role you used last, else your team's most common one; never Owner or Admin); change it in 2 clicks, or **Give people different roles** for a role per row. Roles show one line each; **Owner** is offered to owners only. A role that requires two-step or can approve says so under the menu.
3. *Entity access:* one line, "Access: All entities · Change" (hidden when the organization has one entity). If a single entity is picked in the top-bar switcher, the sheet opens with that entity already chosen. **Change** gives "Only some entities" with a tick list ("Kunle: Parkview Residences SPV Ltd only"). An admin limited to some entities sees only theirs, and never "All entities". It applies to the whole batch. Project limits arrive with the Projects brick.
4. **Send 5 invitations** (1 click). Toast "Invitations sent to 5 people" with **View invited**. They appear on *Team* after the members (first under the *Invited* chip) as "Invited · expires 3 Dec".
5. Invitee: *Invitation email* (from "Vento Homes Ltd via Vento Real Estate", Reply-To the inviter) → *Accept invitation* (organization, who invited them, role, entities, what the role can approve, whether two-step is required) → name, password and confirm password, or sign in if they already use Vento Real Estate → *Set up two-step* where the role requires it → lands on *Home* with their role's sidebar. On *Team* their row becomes a member with "Two-step on" and "Last active today".
6. Later, on an invitation's ⋯ menu: **Resend** (new link, fresh 7 days) or **Withdraw** (2 clicks; toast with **Undo**).

**Behind the scenes:** one transaction creates the batch (all or nothing); each invitation is an audit event; emails go after commit through Postmark in staging and production (console in development; staging only to allowed addresses), with tracking off. A failed send or a bounce marks the invitation "Email not delivered". Members plus open invitations count against the plan's people limit, checked inside the transaction. Permissions are checked on the server for every action.
**Done when:** the invitee appears as an active member with their role, entity access and two-step on.
**Watch for:** some emails already members or already invited (marked, with **Resend instead** for invited ones and a one-tap **Remove**; Send counts and sends only unmarked rows, and marked rows stay in the sheet); your own email ("That's you"); more than 20 pasted (20 kept, the rest left in the box); an owner with fewer places left than rows ("You have 2 places left on your Starter plan. Talk to Vento Real Estate for more." above a disabled Send, with **Send only 2**; rows that don't fit read "No place left on your plan"); an admin hitting the limit (server refusal, "Ask Olumide Bankole (owner)", rows kept); two admins taking the last place at once (one succeeds); an entity archived while the sheet is open; resending within a minute (refused); invite to someone already in another organization (allowed; they join with their existing account); opened while signed in as someone else ("This invitation is for…"); expired, withdrawn or bounced invitations; a removed member invited again (from *Removed* → **Invite again**); organization switched in another tab (refused, typing kept); session expired with the sheet open (typing kept); 375 px with the keyboard open (Send stays visible).
**Target:** 3 clicks and under 60 seconds for a batch of 5; invitee active with two-step in under 3 minutes; invitation delivered within 1 minute. **Test:** `e2e/auth/accept-invitation.spec.ts` (2a), `e2e/settings/invite-members.spec.ts` (3b), `e2e/home/setup-checklist.spec.ts` (3b) **Status:** built (Postmark delivery in its own pull request)

## J-ONB-06 · Change someone's access, reset their two-step, remove a leaver
**Who / how often:** Owner or admin; role and access changes monthly, a lost phone or a leaver a few times a year.
**Starts from:** *Settings → Team*, a colleague's message ("I lost my phone"), or HR telling the admin someone has left.

Spec: [team](../specs/team.md) (brick 3b) on [accounts-and-access](../specs/accounts-and-access.md) (2a rules).

**Steps**
1. *Team* → search "aisha" (the search and filters stay in the address). The list follows the top-bar entity switcher: picking Parkview shows "People who can work in Parkview Residences SPV Ltd" (owners, everyone with all entities, and those limited to Parkview) with **Show all entities**.
2. **Change role:** the role menu on Aisha's row → **Finance** (2 clicks). Saved at once; toast "Aisha Bello is now Finance · Undo". Making someone an **Owner** asks to confirm first and emails every owner.
3. **Change entity access:** click the row → *Member sheet* → "Only some entities" → tick **Parkview Residences SPV Ltd** → **Save changes** (4 clicks). Toast "Access updated for Kunle Ojo".
4. **Reset two-step** (lost phone and backup codes): ⋯ → **Reset two-step** → confirm (3 clicks). The badge becomes "Reset, waiting for new password"; they get a security alert and a link to set a new password, then set up two-step again at sign-in (J-ONB-04). *(Brick 3d, draft, [my-security](../specs/my-security.md): the reset also removes all their passkeys, the confirm says how many, and **Reset two-step** is also offered to someone with passkeys but two-step off; the member sheet shows "2 passkeys".)*
5. **Remove a leaver:** ⋯ → **Remove from team** → **Remove Grace Umeh** (the confirm names Vento Homes Ltd) (3 clicks). Toast "Grace Umeh removed. History kept." The row moves to the *Removed* chip with **Invite again**.

**Behind the scenes:** each change is one transaction and an audit event (`member.access_changed`, `two_step.reset`, `member.removed`, `session.revoked_by_removal`); an Undo is a second audited change. A change applies on the member's next request; removal ends their sessions in this organization at once; a two-step reset ends all their sessions everywhere. The removed member's place frees up on the plan.
**Done when:** the row shows the new role, access or two-step state, or the person is under *Removed*.
**Watch for:** your own row (read-only: "This is you…"); an admin and an owner's row (read-only: "Only owners can change an owner's access."); an admin limited to Parkview and a member with wider access (read-only, names outside their limit hidden); two owners removing each other at once (the second refused: "Vento Homes Ltd needs at least one owner…"); the member already removed by someone else ("Grace Umeh is no longer a member. The list is up to date."); Reset two-step offered only when two-step is on; role menus don't change while offline; preview as a role without settings (Team disappears); phone at 375 px (cards, actions in the sheet).
**Target:** role change in 2 clicks, removal or reset in 3; under 10 seconds each. **Test:** `e2e/settings/manage-members.spec.ts` **Status:** built

## J-ONB-07 · Set up the organization and its companies
**Who / how often:** Owner or admin with access to every company; at setup, then whenever an SPV is incorporated (a few times a year). A Parkview-only admin fixes Parkview's own details.
**Starts from:** *Setup checklist* ("Add your other companies (SPVs)" → **Add company**), the top-bar *Company switcher* (**+ Add company**), *Settings → Companies*, or ⌘K "Add company".

Spec: [roles-and-organization](../specs/roles-and-organization.md) (brick 3c) on [accounts-and-access](../specs/accounts-and-access.md) (2a API).

**Steps**
1. *Settings* opens on *Organization* (the sub-navigation now shows Organization · Companies · Team · Roles & permissions). Correct the name, head office state or the month the financial year starts → **Save changes** (2 clicks). Toast "Organization details saved". The company switcher is hidden on this page and on *Companies* and *Roles & permissions* (organization-wide).
2. *Companies* → **Add company** (2 clicks). The *Add company sheet* opens with "A separate registered company, like an SPV for one estate. To add another estate, create a project instead." Enter "Lekki Pearl Estates Ltd", keep **Project company (SPV)**, RC "1904417" (shown as "RC 1904417" on blur), leave TIN for later, VAT registered off → **Add company** (3rd click). Toast "Lekki Pearl Estates Ltd added" with **Switch to it**.
3. The same from anywhere: *Company switcher* → **+ Add company** → the same sheet over the current page.
4. Fix a detail: click the Parkview row → *Company sheet* → add the TIN → **Save changes**. Toast "Parkview Residences SPV Ltd updated".
5. Archive one that's wound up: row ⋯ → **Archive** (2 clicks). Toast "… archived · Undo". If anyone can see only that company, a confirm names them first → **Archive company** (3 clicks).
6. Bring it back: **Archived** chip → **Restore** (2 clicks).

**Behind the scenes:** each change is one transaction with an audit event (`organization.updated`, `entity.created`, `entity.updated`, `entity.archived`, `entity.restored`). Adding and restoring check the plan's active-company limit inside the transaction. RC numbers are unique in the organization, archived companies included. Archiving keeps members' limits; they see the company again on restore.
**Done when:** the organization profile is right and every company the developer runs is listed with its RC, TIN and VAT status, and appears in the switcher.
**Watch for:** RC already used ("Parkview Residences SPV Ltd already uses RC 1789234."), or used by an archived company (with **Restore it instead**); two people adding the same RC at once (one refused); owner on Starter at 2 active companies (the plan message opens instead of the form, with **Talk to Vento Real Estate**); an admin at the limit (server refusal naming the owner, fields kept); two admins taking the last place at once; the last active company (Archive disabled with the reason); two people archiving the last two at once; archived company opened (read-only, **Restore**); members left with no active company ("No company" and a Home card naming who to ask); a shared link to an archived company ("That company isn't available. Showing all companies."); a limited admin (sees only their companies; no Add, Archive or Restore; Organization read-only); another organization's company ID (not found); organization switched in another tab (refused, typing kept); offline; 375 px.
**Target:** add a company in 3 clicks and under 30 seconds; profile edit in 2 clicks. **Test:** `e2e/settings/organization-and-companies.spec.ts` **Status:** built

## J-ONB-08 · Make a role that fits the job
**Who / how often:** Owner or admin with access to every company; at setup, then when a job doesn't fit the built-in roles (monthly at most).
**Starts from:** *Settings → Roles & permissions*, ⌘K "New role", or a question like "what can Sales actually see?".

Spec: [roles-and-organization](../specs/roles-and-organization.md) (brick 3c).

**Steps**
1. *Roles & permissions* (1 click): the nine built-in roles, then custom ones, each with its description, how many people have it, and whether two-step is required.
2. Click **Project manager** (2): the *Role page* shows the ten modules against View · Create · Edit · Delete · Export · Approve, read-only, with "Built-in roles can't be changed. Duplicate this role to make your own version."
3. **Duplicate role** (3) → *New role dialog*: Name "Site engineer", **Start from** Project manager → **Create role** (4).
4. On the new role's page (the name looks editable: click it to rename): untick **Sales: View** and **Land & title: View**, tick **Documents: Create**. The bar reads "3 changes · applies to nobody yet" → **Save changes** (5). Toast "Site engineer saved · Undo"; **Discard** instead drops the changes, also with Undo. The two-step switch follows the source; it's locked on for any role that can change settings or do more than view in Finance or HR.
5. **Preview this role** (1 click): Home opens as Site engineer under "Previewing as Site engineer" → **Stop preview**.
6. *Team* → Bayo's role menu → **Site engineer** (2 clicks, as J-ONB-06). The server applies the new role to his very next request; his sidebar follows the next time Vento Real Estate refreshes his access (returning to the tab, or within 30 seconds) and shows Home, Projects and Documents, without signing in again.
7. Later, tidy up: role page ⋯ → **Delete role** → **Delete Site engineer** (3 clicks), offered only when nobody holds it.

**Behind the scenes:** `role.created`, `role.updated` (actions added and removed per module, two-step, name; Undo is a second event) and `role.deleted` audit events. Permissions are loaded on every request, so holders get the change on their next click without signing in again; if two-step becomes required they're sent to set it up first. A role kept by history (removed members, past invitations) is hidden rather than erased.
**Done when:** the role exists with the intended actions, and the people who need it have it.
**Watch for:** built-in role (read-only; API refuses edits); a name already used ("A role called Site engineer already exists."); no ticks left ("Give this role access to at least one area"); ticking an action you don't have yourself ("You can only give access you have yourself."); the role you hold (read-only: "You have this role…"); two admins editing the same role (second refused with **Reload**, nothing overwritten); deleting a role people hold ("Move 3 people to another role first" linking to Team filtered by it); assigning a role while it's deleted (one wins); unsaved changes and **Preview this role** (disabled until saved); leaving with unsaved changes (asks first); a limited admin or a Settings: View custom role (read-only); a member managing someone with more permissions than theirs (read-only row on Team); 50 custom roles (guard); another organization's role ID (not found); offline (nothing changes, ticks kept); 375 px (tap a module for a sheet of switches).
**Target:** under 60 seconds from the roles list to a saved custom role; 4 clicks to the new role. **Test:** `e2e/settings/custom-roles.spec.ts` **Status:** built

## J-ONB-03 · Import existing buyers and payments from Excel
**Who / how often:** Finance or admin, at go-live and when migrating a project.
**Starts from:** Setup checklist or ⌘K "Import".

**Steps**
1. *Excel import wizard:* pick what to import (units, buyers, subscriptions, payments to date), download the template or upload their own file.
2. Map columns (auto-matched by header name, adjustable).
3. Preview with row-level errors, each fixable in the preview table with one click. Nothing saves until Import ("Row 14: unit A-14 not found", "Row 22: amount is not a number"). Fix in the file and re-upload, or skip bad rows.
4. "Import 238 rows". Progress, then a summary with links.

**Behind the scenes:** one import job; rows created in batches inside transactions; historical receipts post to the ledger with their original dates in an open period, or to an opening-balance journal if the period is closed. Every created row is tagged with the job id.
**Done when:** the import shows `imported` and the records are visible.
**Watch for:** duplicates of existing buyers (match by phone/email and offer merge); money in strings like "85m" or "₦85,000,000" (parse or flag); undo is available for 7 days and removes exactly what the import added; blocked with an explanation once those records are used further (e.g. receipts allocated).
**Target:** under 10 minutes for 500 rows. **Test:** `e2e/settings/excel-import.spec.ts` **Status:** draft

## J-ONB-04 · Sign in with two-factor, recover access
**Who / how often:** Everyone, daily.

Spec: [accounts-and-access](../specs/accounts-and-access.md); passkeys and the new-device email: [my-security](../specs/my-security.md) (brick 3d, draft).

**Steps**
1. *Sign in:* email, password, optional "Keep me signed in on this device" (30 days) → **Sign in** → *Two-step check* (authenticator code, or "Use a backup code") → **Verify**. If the role (or, from 3d, the organization) requires two-step and it isn't set up, *Set up two-step* comes first.
2. *(Brick 3d, draft)* **With a passkey:** tap the email field and pick the passkey the browser offers, or **Sign in with a passkey** under the form (1 tap) → Face ID, fingerprint or Windows Hello → Home. No code is asked: a passkey counts as two-step. "Keep me signed in" applies too. Where two-step is required and the authenticator app isn't set up yet, *Set up two-step* still comes first.
3. Forgot password: *Forgot password* → email link (30 minutes, works once) → *Reset password* (new password and confirm password, not one of the last 5) → signed in after the two-step check; every other session ends.
4. Lost authenticator: a passkey on another device (3d), a backup code, or an owner (for anyone) or admin (for non-owners) resets their two-step (audit event, security alert to the member; from 3d the reset also removes their passkeys); they set a new password from the emailed link and set two-step up again at next sign-in.
5. *(Brick 3d)* A sign-in from a browser that hasn't signed in to the account in 90 days emails "Vento Real Estate: new sign-in on Chrome on Mac" with a link to *My security*.

**Behind the scenes:** sign-ins (method password or passkey), failures, lockouts, password and two-step changes are audit events visible to the owners of every organization the person belongs to; security alerts can't be muted. The rule that applies at sign-in is the one of the organization the session opens in (the last used, or the invitation's).
**Done when:** the member is signed in on their page.
**Watch for:** five wrong two-step or backup codes lock sign-in for 15 minutes and email the user (10 wrong passwords in 15 minutes do the same); a passkey still works during a lock (3d, open question 8) but never while a password reset is required; the code boxes turn rose with a message saying what to do; the same message for a wrong email or a wrong password; forgot-password never reveals whether an account exists; an unknown or removed passkey ("That passkey isn't recognised. Sign in with your password."); passkeys not available to any of the person's organizations; the person cancels the Face ID prompt (nothing happens, try again); a browser without passkey support (button hidden); session expired mid-form (input kept on the device, signing in again, by password or passkey, returns them to the page); *Session expired / signed out elsewhere* screen; a member who requires two-step can't turn it off; the only owner losing their phone and codes needs Vento Real Estate support (or a passkey on another device).
**Target:** under 20 seconds and 2 clicks for a daily sign-in; with a passkey, 1 tap plus Face ID and under 5 seconds. **Test:** `e2e/auth/sign-in.spec.ts`, `e2e/auth/passkeys.spec.ts` (3d) **Status:** built

## J-ONB-09 · Secure your own account
**Who / how often:** Every member. Adding a passkey: once per device. Sessions: the day a phone is lost or a shared laptop was used. Password and backup codes: a few times a year.
**Starts from:** User menu (or More on a phone) → **My security**; ⌘K "Add a passkey", "Change password", "Turn on two-step"; the passkey offer after a password sign-in; a "new sign-in" email.

Spec: [my-security](../specs/my-security.md) (brick 3d).

**Steps**
1. User menu → **My security** (2 clicks; anyone, whatever their role, including roles with no Settings access). The page shows four cards: your name and email; *Sign-in* (password, two-step, backup codes); *Passkeys*; *Where you're signed in*.
2. **Add a passkey** (1) → *Confirm it's you* (password; skipped if confirmed in the last 5 minutes) → **Continue** (2) → Face ID. Toast "Passkey added · iCloud Keychain · iPhone" with **Rename**. Next sign-in on this phone is one tap.
3. **Turn on two-step** (if off): **Turn on** → *Set up two-step* sheet: scan, enter code, **Verify** → save 10 backup codes, tick, **Done** (4 clicks).
4. Backup codes running low ("3 left", amber) → **Make new codes** → confirm → tick saved → **Done** (3 clicks). Old codes stop working.
5. **Change password** → current, new, confirm → **Change password** (2 clicks). Other devices are signed out; this one stays.
6. Lost phone: on the laptop, *Where you're signed in* → **Sign out** on "Safari on iPhone" (1 click), then ⋯ → **Remove** on the phone's passkey → **Remove passkey** (3 clicks). Or **Sign out other devices** → **Sign out 2 devices**.
7. Fix a misspelt name: click the name → type → Enter.
8. Turn two-step off (only when no organization of theirs requires it): **Turn off** → password and code → **Turn off two-step**.

**Behind the scenes:** every change is audited once per organization the person belongs to (`passkey.added`, `passkey.renamed`, `passkey.removed`, `two_step.enabled`, `two_step.disabled`, `two_step.backup_codes_regenerated`, `account.password_changed`, `session.revoked`, `account.name_changed`). Alerts emailed (can't be muted): passkey added or removed, two-step turned off, password changed. Sessions and passkeys belong to the person, so signing out other devices covers every organization. No procedure takes a person's ID.
**Done when:** the card shows the new state (passkey listed, two-step on, device gone from the list, new name).
**Watch for:** two-step required by role or by the organization (no **Turn off**, the row says which); in two organizations, a requirement in either blocks turning it off; a wrong password or code (counts towards the 2a locks); a browser that can't make passkeys (message instead of the button); the device already has a passkey for this account; 10 passkeys (limit); cancelling Face ID (nothing saved); the backup codes dialog closed before ticking (new codes already in force); a session already signed out from another device ("The list is up to date."); two tabs (stale action refused, page refreshes); previewing as another role (My security still shows your own account); offline (nothing changes, typing kept); session expired with a dialog open; passkeys not yet available to the organization (card hidden); 375 px.
**Target:** add a passkey in 2 clicks plus Face ID; turn on two-step in 4 clicks and under 90 seconds; end a lost phone's session in 3 clicks from any page. **Test:** `e2e/settings/my-security.spec.ts`, `e2e/auth/passkeys.spec.ts` **Status:** built

## J-ONB-10 · Require two-step for everyone
**Who / how often:** Owner, once (rarely turned off).
**Starts from:** *Settings → Organization*, or a board or auditor asking "does everyone use two-step?".

Spec: [my-security](../specs/my-security.md) (brick 3d; owner's decision of 26 Nov 2026).

**Steps**
1. *Settings → Organization* (1) → *Security* card: "9 of 12 people have two-step on" → switch **Require two-step sign-in for everyone** (2).
2. Confirm: "3 people haven't set it up: Grace Umeh, Kunle Ojo and 1 other. They'll set it up at their next sign-in, or within 7 days." → **Require two-step** (3). Toast "Two-step is now required for everyone in Vento Homes Ltd".
3. Those three see a banner on every page, "Vento Homes Ltd now requires two-step sign-in…" with **Set up two-step**; on *Team* their badge reads "Set up at next sign-in"; every role reads "Required".
4. Grace signs in the next morning → *Set up two-step* comes first → Home. Her badge turns **On**.
5. Later, turning it off: switch → "Stop requiring two-step for everyone?" → **Stop requiring**. Every owner is emailed. Nobody's two-step is switched off.

**Behind the scenes:** `organization.updated` (two-step required off → on) with who and when. The requirement applies to this organization only; a person's two-step is personal, so a requirement in any of their organizations stops them turning it off. Roles keep their own two-step values, which apply again when the setting is off. New invitations say two-step is required.
**Done when:** everyone in the organization has two-step on (the card reads "12 of 12").
**Watch for:** an admin or a read-only settings viewer (switch read-only: "Only owners can change this."); everyone already on ("Everyone already has two-step on."); someone with "Keep me signed in" who doesn't sign in for days (required after 7 days, setup opens over their page and keeps their work); a person in two organizations (asked only when they're in this one); two owners changing it at once (later wins, both audited); a passkey-only member (still sets up the authenticator app); custom role two-step switch (on and locked with the reason); organization switched in another tab (tab guard).
**Target:** 3 clicks. **Test:** `e2e/settings/require-two-step.spec.ts` **Status:** built

## J-ONB-05 · Find your way around the workspace
**Who / how often:** Every member, many times a day. Admins previewing roles: at setup and when roles change.
**Starts from:** Signing in, a shared link, or ⌘K from any page.

Spec: [app-shell](../specs/app-shell.md) (brick 3a).

**Steps**
1. After *Sign in*, the member lands on *Home* in the *App shell* (or on the page they were trying to reach). The sidebar shows only the modules their role can view; on a phone, *Home* plus up to three module tabs and **More**.
2. Click a sidebar entry (1 click) or press ⌘K, type "sal", Enter. Only modules **available** to the organization (released to it and in its plan, see [feature-flags](../specs/feature-flags.md)) and viewable by the role appear. A module the role can't view opens *403*, which names the owner or admin to ask; a module that isn't available opens *404*. Features the organization has early opens carry an "Early access" tag. In Vento Real Estate's internal organizations only, a module that isn't built yet shows "Soon" and opens its *Module placeholder*. Owners searching ⌘K for a feature outside their plan see one row, "Available on Growth", with **Talk to Vento Real Estate**.
3. *Company switcher* → pick **Parkview Residences SPV Ltd** (2 clicks). The choice stays in the address and is remembered on this device for this organization. *(Brick 3c: the switcher reads "Company: All companies"; owners and admins with access to every company get **+ Add company** at the foot of the menu (J-ONB-07); it's hidden on organization-wide pages: Organization, Companies, Roles & permissions.)*
4. People in two organizations: click the organization name at the top of the sidebar → pick **Lekki Partners Ltd** (2 clicks). *Home* of that organization opens; *Set up two-step* first if its role requires it.
5. Avatar → **Light**, **Dark** or **System** (2 clicks).
6. Owners and admins: avatar → **Preview as role** → **Sales** (3 clicks). The sidebar, tabs and Home become Sales', under a "Previewing as Sales" banner → **Stop preview**.
7. `?` lists the shortcuts; `[` collapses the sidebar; `g` then `h` goes Home.

**Behind the scenes:** switching organization is checked on the server against active memberships and updates the session and the default for next sign-in; the browser cache is cleared. Every request says which organization the tab expects, and a mismatch is refused before any read or write. Preview changes navigation only; requests still run with the admin's own access. No audit events (no data or access changes).
**Done when:** the member is on the page they wanted, in the right organization and entity.
**Watch for:** two tabs, organization switched in one (the other reloads with "You switched to Lekki Partners Ltd in another tab."); removed from the current organization mid-session (moved to the next organization, or "You no longer have access to Vento Homes Ltd." with Sign out); role changed mid-session (navigation updates on the next page or tab focus, open page becomes *403* if no longer allowed); shared link with an entity they can't see, archived or made up ("That entity isn't available. Showing all entities."); member limited to one entity (label, no menu); unknown address, or a module not available to the organization (*404*, signed out: *404* with Sign in); a feature switched off or a trial ending mid-task (next call refused, app returns Home with "Sales isn't available on your account right now. What you were typing wasn't saved."); no flash of unavailable items on load; server failure (*500* with a reference to copy); connection lost (offline banner; typed input kept); session expired (2a dialog over the page); reduced motion; 375 px width; dark mode.
**Target:** any allowed module in 1 click on a laptop, 1–2 taps on a phone, or ⌘K + 3 keystrokes; organization or entity switch in 2 clicks. **Test:** `e2e/shell/navigation.spec.ts`, `e2e/shell/command-palette.spec.ts`, `e2e/shell/organizations.spec.ts`, `e2e/shell/theme-and-preview.spec.ts`, `e2e/shell/errors-offline.spec.ts`, `e2e/shell/accessibility.spec.ts` **Status:** built
